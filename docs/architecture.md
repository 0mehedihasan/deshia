# Architecture

DeshiA is a layered desktop application. Dependencies flow **downward only** —
UI never reaches past the service layer into raw SQL or the filesystem.

```
┌──────────────────────────────────────────────┐
│ UI            React / Next App Router, canvas  │  src/app, src/components, src/features
├──────────────────────────────────────────────┤
│ Application   server actions / route handlers  │  src/app/**/actions.ts, src/app/api/**
│ Services      orchestration, transactions      │
├──────────────────────────────────────────────┤
│ Domain        engine, validation, exporter,    │  src/core/**, src/schemas/**
│ Logic         recovery, scanner, palette       │
├──────────────────────────────────────────────┤
│ Persistence   Drizzle repositories + schema    │  src/db/**
├──────────────────────────────────────────────┤
│ Filesystem    read-only sources, DeshiA_Output │  via src/core/filesystem
└──────────────────────────────────────────────┘
```

## Runtime model

DeshiA needs Node-only libraries — Drizzle + `better-sqlite3` (SQLite) and
`sharp` (image metadata/copies). A pure Tauri webview has no Node runtime, so:

- **The application logic runs inside the Next.js Node runtime** (server
  components, route handlers, server actions). This is where the DB, scanner,
  exporter, and recovery execute.
- **Tauri v2 is a thin desktop shell**: it hosts the webview, provides native
  folder pickers (`@tauri-apps/plugin-dialog`), scoped fs permissions, and
  packages the app. It does **not** contain business logic.

### Dev

```
pnpm tauri:dev
  └─ runs `pnpm dev` (Next server on :3000)
  └─ opens a Tauri window pointed at http://localhost:3000
```
You can also run `pnpm dev` alone and use the app in a browser; native folder
dialogs fall back to a path input when `DESHIA_E2E=1` or when not inside Tauri
(`src/lib/native-dialog.ts`).

### Packaged

`next build` produces a standalone Node server (`output: 'standalone'`). The
packaged app ships that server as a single tarball, extracts it to a writable
per-user dir on first launch, runs it as a child process, and points the webview
at it — implemented as follows:

```
pnpm tauri:build
  └─ beforeBuildCommand: node scripts/build-desktop.mjs
       ├─ next build → .next/standalone
       ├─ stage .stage/server      (standalone + .next/static + public, symlinks resolved)
       ├─ stage .stage/migrations  (Drizzle SQL + meta/_journal.json)
       ├─ pack → src-tauri/resources/app.tar   (single opaque resource)
       └─ copy Node binary → src-tauri/binaries/node-<target-triple>  (externalBin)
  └─ Rust shell (src-tauri/src/lib.rs), release only:
       ├─ extract app.tar → <app_data_dir>/runtime/{server,migrations}
       │     (skipped when a .deshia-version marker matches CARGO_PKG_VERSION)
       ├─ pick a free loopback port
       ├─ spawn bundled node server.js  (cwd = runtime/server/)
       │     env: PORT, HOSTNAME=127.0.0.1, NODE_ENV=production,
       │          DESHIA_DB_PATH=<app_data_dir>/deshia.db,
       │          DESHIA_MIGRATIONS_DIR=<app_data_dir>/runtime/migrations
       ├─ wait for the port, then navigate the window to http://127.0.0.1:PORT
       └─ kill the child on RunEvent::Exit
```

We ship a **tarball** rather than directory resources for two reasons: Tauri's
resource globbing skips dotfiles (a bare `.next/` dir would be silently dropped),
and `.app/Contents/Resources` is read-only whereas Next wants to write
`.next/cache` at runtime — extracting to `<app_data_dir>/runtime/` sidesteps both.
Startup progress and any failure are written to `<app_data_dir>/deshia-launch.log`.

Build UI shows `src-tauri/loading/index.html` (`frontendDist`) until the server
is live. In debug (`tauri dev`) nothing is spawned — the window loads `devUrl`
(`pnpm dev` on :3000). The `default` capability grants `remote.urls`
(`http://127.0.0.1:*`) so native dialog/fs IPC works from the loopback origin.
`src-tauri/resources/`, `src-tauri/binaries/`, and `src-tauri/.stage/` are build
artifacts (git-ignored) and must be produced on the target OS — `tauri build`
cannot cross-compile the bundled Node binary or the native
`better-sqlite3`/`sharp` addons.

## Module responsibilities

| Module | Responsibility |
| --- | --- |
| `src/core/scanner` | Recursive discovery, SHA-256 checksum, Sharp metadata, duplicate/format classification |
| `src/core/filesystem` | Path validation (no traversal), filename sanitization, output-tree creation |
| `src/core/annotation` | Schema-driven engine, bbox math, deterministic color palette, pre-submit validation |
| `src/core/exporter` | Pascal VOC XML, filename generation, submission transaction |
| `src/core/recovery` | Draft detection and exact-state resume |
| `src/schemas` | AnnotationSchema types, zod validation, built-in Rickshaw schema |
| `src/db` | Drizzle schema, connection singleton, repositories, migrations |
| `src/stores` | Zustand client state (working annotation, autosave status) |
| `src/features` | Screen modules composing UI + services |

## Data flow: annotating one image

1. UI selects class/view → engine (`core/annotation`) computes available views/
   components from the schema → UI renders controls.
2. Edits update the Zustand store → autosave persists a `DRAFT` annotation +
   boxes via a repository transaction and appends a `DRAFT_SAVED` event.
3. Submit runs the submission transaction (`core/exporter/submit`): validate →
   persist → VOC XML → copy RAW + clean annotated image → verify → mark
   `ANNOTATED` → load next `PENDING`. See [export-format.md](./export-format.md).

## Key decisions

- **Normalized bbox coordinates** internally; pixel conversion only at canvas
  and exporter edges — resolution-independent and reproducible.
- **Append-only `annotation_events`** — full recoverability, never a silent wipe.
- **Deterministic color-by-component-key** — stable, distinct box colors with no
  per-box storage and no render flicker.
- **String ontology keys** in the DB, resolved against a versioned schema — the
  engine stays dataset-agnostic.
