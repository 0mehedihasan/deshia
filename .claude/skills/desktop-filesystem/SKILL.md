---
name: desktop-filesystem
description: DeshiA's Tauri desktop shell, native folder selection, path validation/sanitization, and the read-only-source / scoped-write model.
---

# Desktop & Filesystem — DeshiA

## Runtime model
Tauri v2 hosts a webview pointed at the Next.js server. All DB/FS/image work
happens in the **Next Node runtime** (server actions / route handlers), not in
Rust. The Rust shell (`src-tauri/`) provides the window, native dialogs, and
packaging. See `docs/architecture.md` for dev vs. packaged runtime.

## Native folder selection
- `src/lib/native-dialog.ts` wraps `@tauri-apps/plugin-dialog`'s `open({
  directory: true })` for the **source** and **output** folders.
- Outside Tauri (browser dev / E2E), fall back to a plain path input, gated by
  `DESHIA_E2E`. Do **not** rely on browser-only filesystem APIs for the core
  workflow.
- Capabilities are declared in `src-tauri/capabilities/default.json` (dialog +
  scoped fs read). Keep permissions minimal.

## Path & filename safety (`src/core/filesystem/paths.ts`)
- Validate every path: resolve, reject `..` traversal, reject paths escaping the
  workspace source (for reads) or output (for writes).
- **Sanitize filenames** before writing: strip separators/control chars,
  lowercase, snake-case class/view. Never trust a source filename as an id.
- Sources are **read-only**. Writes are restricted to the `DeshiA_Output/` tree.
- Never execute arbitrary files; never shell out to process user paths.

## Validate imported schemas
User-supplied schema JSON is untrusted: validate with zod
(`src/schemas/validate.ts`) before use; reject unknown/oversized structures.
