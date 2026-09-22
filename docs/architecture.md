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

`next build` produces a standalone server (`output: 'standalone'`). The packaged
desktop app runs that Node server as a **sidecar** and points the webview at it.
Wiring the sidecar (`externalBin` + a bundled Node) is the remaining packaging
task; `tauri.conf.json` is prepared for it. Until then, `pnpm tauri:dev` is the
supported way to run the full desktop experience.

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
