# AGENTS.md

Guidance for autonomous coding agents (Claude Code, SDK agents, and similar)
working in the DeshiA repository. Human contributors: see
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Start here

1. Read [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) — the authoritative project
   instructions (purpose, architecture, golden rules, Rickshaw schema, color
   rules, workflow). It is written to bootstrap a session with **no** prior
   chat history.
2. Load the subsystem playbook you need from
   [`.claude/skills/`](./.claude/skills/): `frontend-design`, `annotation-engine`,
   `dataset-engine`, `database`, `export`, `testing`, `research-quality`,
   `desktop-filesystem`, `recovery`.
3. Skim the relevant `docs/*.md` for detail.

## Golden rules (never violate)

- Do **not** hardcode the dataset ontology (Rickshaw, E-Rickshaw, Front, Side,
  Back, Chain, Motor, …) into the core engine — it lives in `src/schemas/`.
- Do **not** silently lose annotation data. Every mutation is persisted or
  audited (`annotation_events` is append-only).
- Do **not** mark an image `ANNOTATED` before export succeeds and files are
  verified on disk.
- Do **not** modify or draw onto source images.
- Do **not** put DB/filesystem logic inside React components.
- Distinct components in the same image get **distinct, deterministic** box
  colors (`src/core/annotation/palette.ts`).

## Working agreement

- Inspect before changing. Reuse existing abstractions. Make the smallest
  coherent change. Never invent files/APIs/tables without checking.
- Strict TypeScript: no `any` escapes, no unused symbols, no `enum` (use `as
  const` unions). Access the DB only through `src/db/repositories/*`.
- Do not fake functionality or leave placeholder buttons that pretend to work.

## Verify before you finish (per-phase gate)

```bash
pnpm typecheck   # tsc --noEmit (strict)
pnpm lint        # eslint
pnpm test        # vitest run
pnpm build       # when the change touches build output
```

All green, or the work isn't done. Add a failing test first when fixing a bug.
Update the affected `docs/` and `.claude/CLAUDE.md` when behavior changes.

## Environment notes

- Package manager is **pnpm**. Node ≥ 20.11.
- `better-sqlite3` and `sharp` are native modules (need Xcode CLT on macOS).
- The DB runs in the Next Node runtime, not the Tauri/Rust side. Tauri is a thin
  shell (webview + native dialogs). See [`docs/architecture.md`](./docs/architecture.md).
- Commit style: small, scoped, imperative subject (≤ 70 chars). Do not commit
  datasets, `*.db`, or `DeshiA_Output/` (see `.gitignore`).
