// scripts/build-desktop.mjs
//
// Assembles everything the packaged desktop app needs, then leaves the working
// tree ready for `tauri build` to bundle. Runs as tauri.conf `beforeBuildCommand`.
//
// Steps:
//   1. `next build` → produces `.next/standalone` (a self-contained Node server).
//   2. Stage that server + the runtime static/public assets, plus the Drizzle
//      migrations, under `src-tauri/.stage/{server,migrations}`.
//   3. Pack the staged tree into a single `src-tauri/resources/app.tar`. We ship
//      ONE tarball (not a directory resource) on purpose:
//        - Tauri's resource globbing skips dotfiles, so a bare `.next/` dir would
//          be silently dropped; a tarball is opaque and copied whole.
//        - The `.app/Contents/Resources` dir is read-only, but Next wants to
//          write `.next/cache` at runtime. The Rust shell extracts the tarball to
//          a writable per-user app-data dir on first launch, sidestepping this.
//   4. Copy the current Node binary to `src-tauri/binaries/node-<target-triple>`
//      (bundled as an `externalBin`; spawned by the Rust shell at startup).
//
// The Rust side (src-tauri/src/lib.rs) extracts app.tar to
// `<app_data_dir>/runtime/{server,migrations}` and launches the server with
// DESHIA_DB_PATH / DESHIA_MIGRATIONS_DIR pointed at writable per-user paths.
//
// Env knobs:
//   SKIP_NEXT_BUILD=1  reuse an existing .next/standalone (faster iteration).

import { execFileSync, execSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tauri = join(root, 'src-tauri');

const log = (msg) => console.log(`[build-desktop] ${msg}`);

/** Rust host target triple (e.g. aarch64-apple-darwin) for externalBin naming. */
function targetTriple() {
  try {
    const out = execSync('rustc -Vv', { encoding: 'utf8' });
    const m = out.match(/host:\s*(\S+)/);
    if (m) return m[1];
  } catch {
    /* rustc not on PATH — fall back to the current platform/arch. */
  }
  const arch =
    process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : process.arch;
  if (process.platform === 'darwin') return `${arch}-apple-darwin`;
  if (process.platform === 'linux') return `${arch}-unknown-linux-gnu`;
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`;
  throw new Error(`Unsupported platform: ${process.platform}`);
}

function reset(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

// __APPEND_MARKER__

// 1. Next.js production build (standalone server).
if (process.env.SKIP_NEXT_BUILD === '1') {
  log('SKIP_NEXT_BUILD=1 — reusing existing .next/standalone');
} else {
  log('running `next build`…');
  execSync('pnpm build', { cwd: root, stdio: 'inherit' });
}

const standalone = join(root, '.next', 'standalone');
if (!existsSync(standalone)) {
  throw new Error(
    `Missing ${standalone}. next.config must set \`output: "standalone"\` and the build must succeed.`,
  );
}

// 2. Stage the tree we will pack. `dereference: true` resolves any symlinks
//    (pnpm's node_modules, traced deps) into real files so the tarball is
//    self-contained and portable.
const stage = join(tauri, '.stage');
reset(stage);

// 2a. Server: standalone tree + static assets + public. `static` and `public`
//     are emitted OUTSIDE standalone and must sit next to server.js at runtime.
const serverStage = join(stage, 'server');
log('staging standalone server → .stage/server');
cpSync(standalone, serverStage, { recursive: true, dereference: true });

const staticSrc = join(root, '.next', 'static');
if (existsSync(staticSrc)) {
  cpSync(staticSrc, join(serverStage, '.next', 'static'), { recursive: true, dereference: true });
} else {
  log('WARNING: .next/static not found — the app will render without CSS/JS chunks');
}

const publicSrc = join(root, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(serverStage, 'public'), { recursive: true, dereference: true });
}

if (!existsSync(join(serverStage, 'server.js'))) {
  throw new Error(`Staged server is missing server.js at ${serverStage}`);
}

// 2b. Drizzle migrations (SQL files + meta/_journal.json).
const migrationsSrc = join(root, 'src', 'db', 'migrations');
if (!existsSync(migrationsSrc)) {
  throw new Error(`Missing migrations at ${migrationsSrc} — run \`pnpm db:generate\` first.`);
}
log('staging migrations → .stage/migrations');
cpSync(migrationsSrc, join(stage, 'migrations'), { recursive: true, dereference: true });

// 3. Pack the staged tree into a single tarball resource. COPYFILE_DISABLE=1
//    stops macOS bsdtar from writing AppleDouble (._*) sidecar entries.
const resourcesDir = join(tauri, 'resources');
reset(resourcesDir);
const tarPath = join(resourcesDir, 'app.tar');
log('packing → src-tauri/resources/app.tar');
execFileSync('tar', ['-cf', tarPath, '-C', stage, '.'], {
  stdio: 'inherit',
  env: { ...process.env, COPYFILE_DISABLE: '1' },
});
if (!existsSync(tarPath)) {
  throw new Error(`tar did not produce ${tarPath}`);
}

// 3a. The staging dir is a transient build artifact — drop it.
rmSync(stage, { recursive: true, force: true });

// 4. Bundle a Node runtime as the externalBin the Rust shell spawns.
const triple = targetTriple();
const binDir = join(tauri, 'binaries');
mkdirSync(binDir, { recursive: true });
const ext = process.platform === 'win32' ? '.exe' : '';
const nodeDest = join(binDir, `node-${triple}${ext}`);
log(`bundling node runtime (${process.execPath}) → binaries/node-${triple}${ext}`);
cpSync(process.execPath, nodeDest, { dereference: true });
if (process.platform !== 'win32') chmodSync(nodeDest, 0o755);

log('done. Ready for `tauri build`.');
