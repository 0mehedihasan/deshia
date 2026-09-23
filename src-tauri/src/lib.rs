//! DeshiA desktop shell.
//!
//! The heavy lifting (SQLite via Drizzle, filesystem scanning, Sharp, Pascal VOC
//! export) lives in the Next.js server running in Node. This Rust shell is thin:
//! it hosts the webview, wires the `dialog`/`fs` plugins for native folder
//! selection, and — in a packaged build — extracts and launches the bundled
//! Next.js standalone server, then points the webview at it. See
//! `docs/architecture.md`.
//!
//! Dev (`tauri dev`, debug) loads `devUrl` (`pnpm dev` on :3000) and spawns
//! nothing. Release builds have no dev server, so we run the bundled server.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent};

/// The bundled Next.js server process. We spawn it directly (not via the shell
/// plugin), so we terminate it ourselves on app exit.
struct Sidecar(Mutex<Option<Child>>);

/// Grab an ephemeral free loopback port so two instances never collide.
fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(47319)
}

/// First candidate path that exists on disk, if any.
fn first_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|p| p.exists()).cloned()
}

/// Poll the loopback port until the server accepts a connection (or we give up).
fn wait_for_port(port: u16, attempts: u32) -> bool {
    for _ in 0..attempts {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

/// Append a line to the launch log (and stderr) so packaged-app failures are
/// diagnosable — the `.app` swallows stderr, but the log file survives.
fn log_line(log_path: &Path, msg: &str) {
    eprintln!("DeshiA: {msg}");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(f, "{msg}");
    }
}

/// Replace the loading-splash message (used to surface startup errors).
fn show_message(app: &AppHandle, text: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval(&format!(
            "var m=document.getElementById('msg'); if(m){{m.textContent={text:?};}}"
        ));
    }
}

/// Extract the bundled server archive into a writable runtime dir, skipping work
/// if this version is already extracted. Running from a writable dir (not the
/// read-only `.app` Resources) lets Next write its runtime cache.
fn ensure_runtime(app_tar: &Path, runtime_dir: &Path, version: &str) -> Result<(), String> {
    let marker = runtime_dir.join(".deshia-version");
    if let Ok(existing) = fs::read_to_string(&marker) {
        if existing.trim() == version {
            return Ok(());
        }
    }
    if runtime_dir.exists() {
        fs::remove_dir_all(runtime_dir).map_err(|e| format!("clean runtime dir: {e}"))?;
    }
    fs::create_dir_all(runtime_dir).map_err(|e| format!("create runtime dir: {e}"))?;
    let file = File::open(app_tar).map_err(|e| format!("open {}: {e}", app_tar.display()))?;
    let mut archive = tar::Archive::new(file);
    archive.set_preserve_permissions(true);
    archive.set_overwrite(true);
    archive
        .unpack(runtime_dir)
        .map_err(|e| format!("unpack server archive: {e}"))?;
    fs::write(&marker, version).map_err(|e| format!("write version marker: {e}"))?;
    Ok(())
}

/// Extract + launch the bundled server. Returns the port to navigate to, or a
/// human-readable error (also written to the launch log) on any failure.
fn start_backend(app: &AppHandle) -> Result<u16, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("no resource dir: {e}"))?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;
    let log_path = data_dir.join("deshia-launch.log");
    log_line(&log_path, "--- DeshiA launch ---");
    log_line(&log_path, &format!("resource_dir = {}", resource_dir.display()));

    let app_tar = first_existing(&[
        resource_dir.join("app.tar"),
        resource_dir.join("resources/app.tar"),
    ])
    .ok_or_else(|| format!("bundled app.tar not found under {}", resource_dir.display()))?;

    let runtime_dir = data_dir.join("runtime");
    ensure_runtime(&app_tar, &runtime_dir, env!("CARGO_PKG_VERSION"))?;
    log_line(&log_path, &format!("runtime = {}", runtime_dir.display()));

    let server_dir = runtime_dir.join("server");
    let server_js = server_dir.join("server.js");
    let migrations_dir = runtime_dir.join("migrations");
    if !server_js.exists() {
        return Err(format!("server.js missing after extract: {}", server_js.display()));
    }

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(PathBuf::from));
    let mut node_candidates: Vec<PathBuf> = Vec::new();
    if let Some(dir) = &exe_dir {
        node_candidates.push(dir.join("node"));
    }
    node_candidates.push(resource_dir.join("node"));
    let node_bin = first_existing(&node_candidates)
        .ok_or_else(|| "bundled node runtime not found next to the app binary".to_string())?;
    log_line(&log_path, &format!("node = {}", node_bin.display()));

    let db_path = data_dir.join("deshia.db");
    let port = free_port();
    log_line(&log_path, &format!("port = {port}, db = {}", db_path.display()));

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&server_js)
        .current_dir(&server_dir)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("DESHIA_DB_PATH", &db_path)
        .env("DESHIA_MIGRATIONS_DIR", &migrations_dir);

    let child = cmd.spawn().map_err(|e| format!("spawn node: {e}"))?;
    if let Some(state) = app.try_state::<Sidecar>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = Some(child);
        }
    }
    log_line(&log_path, "node server spawned");
    Ok(port)
}

/// Tauri entry point. Registers the dialog/fs plugins, and in release builds
/// extracts + launches the bundled Next server, then navigates the splash
/// webview to it. The sidecar process is terminated on app exit.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            // Dev builds (`tauri dev`) load `devUrl` (pnpm dev on :3000) and
            // spawn nothing; only release builds run the bundled server.
            if cfg!(debug_assertions) {
                return Ok(());
            }
            let handle = app.handle().clone();
            match start_backend(&handle) {
                Ok(port) => {
                    thread::spawn(move || {
                        if wait_for_port(port, 240) {
                            if let Some(win) = handle.get_webview_window("main") {
                                let _ = win.eval(&format!(
                                    "window.location.replace('http://127.0.0.1:{port}/')"
                                ));
                            }
                        } else {
                            show_message(
                                &handle,
                                "The annotation server did not start. See deshia-launch.log in the app data folder.",
                            );
                        }
                    });
                }
                Err(e) => {
                    let handle2 = handle.clone();
                    thread::spawn(move || {
                        // Give the webview a moment to mount before we write to it.
                        thread::sleep(Duration::from_millis(600));
                        show_message(&handle2, &format!("Startup failed: {e}"));
                    });
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building DeshiA")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Sidecar>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}

