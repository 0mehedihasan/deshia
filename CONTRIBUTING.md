# Contributing to DeshiA

Thanks for your interest in **DeshiA (Deshi Annotation)** — an open-source image
annotation workstation for computer vision research. This guide explains how to
set up, work, and submit changes. Coding agents should also read
[`AGENTS.md`](./AGENTS.md) and [`.claude/CLAUDE.md`](./.claude/CLAUDE.md).

## Table of contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Project layout](#project-layout)
- [Development workflow](#development-workflow)
- [Coding standards](#coding-standards)
- [The rules that matter most](#the-rules-that-matter-most)
- [Testing](#testing)
- [Commits & pull requests](#commits--pull-requests)

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | ≥ 20.11 | |
| pnpm | ≥ 9 | `corepack enable` |
| Rust | stable | Tauri desktop shell |
| Xcode CLT / build tools | — | `better-sqlite3`, `sharp` compile natively |

## Setup

```bash
git clone https://github.com/0mehedihasan/deshia.git
cd deshia
pnpm install
pnpm exec playwright install chromium   # only for e2e
pnpm db:generate && pnpm db:migrate      # create the local SQLite schema
pnpm dev                                 # browser dev at http://localhost:3000
pnpm tauri:dev                           # full desktop app (needs Rust)
```

## Project layout

See the directory map in [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) §3 and
[`docs/architecture.md`](./docs/architecture.md). In short: `src/app` (UI +
services) → `src/core` (domain) → `src/db` (persistence) → filesystem. The
dataset ontology lives in `src/schemas`, never in `src/core`.

## Development workflow

1. **Inspect first.** Understand the existing abstraction before adding one.
2. **Smallest coherent change.** Reuse; don't invent parallel systems.
3. **Keep the ontology in schemas**, not the engine.
4. **No fake functionality** — no placeholder buttons that pretend to work.
5. **Run the gate** (below) and fix everything before opening a PR.
6. **Update docs** (`docs/`, `.claude/CLAUDE.md`) when behavior changes.

## Coding standards

- **Strict TypeScript.** No `any` escapes, no unused symbols, no `enum` — use
  `as const` string-literal unions.
- Colors via CSS-variable Tailwind classes only; never hardcode hex in
  components (see the design system in CLAUDE.md §5).
- DB access only through `src/db/repositories/*`; no raw SQL in features/UI.
- Prettier + ESLint enforce formatting/lint (`pnpm format`, `pnpm lint`).

## The rules that matter most

- Never silently lose annotation data (`annotation_events` is append-only).
- Never mark an image `ANNOTATED` before export is verified on disk.
- Never modify or draw onto source images; ANNOTATED exports are clean copies.
- Distinct components in one image get distinct, deterministic box colors.
- Bounding boxes are normalized `[0,1]` and validated before persistence.

## Testing

```bash
pnpm typecheck
pnpm lint
pnpm test        # Vitest unit tests (src/**/*.test.ts)
pnpm test:e2e    # Playwright (e2e/)
```

Add unit tests for pure logic (scanner, checksum, bbox, color, filenames, VOC,
validation, recovery). Prefer writing a failing test before fixing a bug. See
[`docs/development.md`](./docs/development.md) and the `testing` skill.

## Commits & pull requests

- Small, focused commits; imperative subject ≤ 70 chars (e.g. `add VOC exporter`).
- Reference the phase/subsystem in the body when useful.
- PRs: describe what changed, what you tested, and any follow-ups. Ensure the
  verification gate is green.
- Do **not** commit datasets, `*.db` files, or `DeshiA_Output/` (see `.gitignore`).

## Code of conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
Report security issues per [`SECURITY.md`](./SECURITY.md).
