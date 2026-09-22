# Development

## Prerequisites

- Node.js ≥ 20.11, **pnpm** ≥ 9 (`corepack enable`)
- Rust (stable) for the Tauri desktop shell
- Xcode Command Line Tools / platform build tools — `better-sqlite3` and `sharp`
  compile native binaries on install

## Install & run

```bash
pnpm install
pnpm exec playwright install chromium   # e2e only
pnpm db:generate                        # generate SQL migrations from schema
pnpm db:migrate                         # apply migrations → ./.deshia/deshia.db

pnpm dev            # Next dev server at http://localhost:3000 (browser)
pnpm tauri:dev      # full desktop app (Next + Tauri window)
```

In browser dev, native folder pickers fall back to a path input when not inside
Tauri; set `DESHIA_E2E=1` to force the fallback.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Next dev server |
| `pnpm build` / `pnpm start` | Production build / serve (standalone output) |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm lint` | ESLint (next config) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` / `pnpm test:watch` | Vitest unit tests |
| `pnpm test:e2e` | Playwright end-to-end |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `pnpm tauri:dev` / `pnpm tauri:build` | Desktop dev / package |

## Verification gate (run after every phase)

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Add `pnpm build` when the change affects build output. Everything must be green
before the work is considered done. When fixing a bug, add a failing test first.

## Environment variables

See `.env.example`. All optional:

- `DESHIA_DB_PATH` — SQLite file location (default `./.deshia/deshia.db`).
- `DESHIA_E2E` — set to `1` to use the path-input folder fallback.

## Database changes

1. Edit `src/db/schema/tables.ts`.
2. `pnpm db:generate` → review the SQL in `src/db/migrations/`.
3. `pnpm db:migrate`.
4. **Never edit an applied migration** — add a new one.

## Sandbox / CI notes

`tsc`, `eslint`, and `vitest` run anywhere `node_modules` is installed. Native
modules (`better-sqlite3`, `sharp`) and the Tauri/Rust build require a real
desktop toolchain and are not exercised in a headless registry-less sandbox —
run those locally. Tests that touch disk use temp directories and clean up.

## Build phases

The project was built in phases (see `.claude/CLAUDE.md`): foundation →
workspace → scanner → persistence → annotation engine → Rickshaw schema →
autosave/recovery → export → dashboard → settings/polish → testing → docs.
Each phase ends at the verification gate.
