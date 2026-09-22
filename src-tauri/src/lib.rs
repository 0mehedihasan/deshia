//! DeshiA desktop shell.
//!
//! The heavy lifting (SQLite via Drizzle, filesystem scanning, Sharp image
//! processing, Pascal VOC export) lives in the Next.js server layer running in
//! Node. This Rust shell is intentionally thin: it hosts the webview, wires the
//! `dialog` and `fs` plugins used for native folder selection, and packages the
//! application. See `docs/architecture.md` for the full runtime model.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running DeshiA");
}
