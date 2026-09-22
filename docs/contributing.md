# Contributing (developer notes)

This is the in-repo companion to the root [`CONTRIBUTING.md`](../CONTRIBUTING.md)
(setup, standards, PR flow) and [`AGENTS.md`](../AGENTS.md) (agent working
agreement). It focuses on **how the codebase is organized** so you can find the
right place to make a change.

## Where things live

| You want to… | Work in | Read |
| --- | --- | --- |
| Change how a class/view/component behaves | `src/schemas/` (schema data) | [annotation-schema.md](./annotation-schema.md) |
| Change view/component resolution or bbox math | `src/core/annotation/` | `annotation-engine` skill |
| Change box colors | `src/core/annotation/palette.ts` | CLAUDE.md §9 |
| Add/modify a DB entity | `src/db/schema/tables.ts` + migration | `database` skill |
| Query or persist data | `src/db/repositories/` | `database` skill |
| Change scanning / duplicates | `src/core/scanner/` | [dataset-format.md](./dataset-format.md) |
| Change export / filenames / VOC | `src/core/exporter/` | [export-format.md](./export-format.md) |
| Change autosave / resume | `src/stores/annotation.ts`, `src/core/recovery/` | [recovery.md](./recovery.md) |
| Build/adjust a screen | `src/features/<area>/`, `src/app/` | `frontend-design` skill |
| Add a UI primitive | `src/components/ui/` | components.json |

## Boundaries to respect

- **Ontology lives in `src/schemas`**, never in `src/core/annotation`.
- **DB access only via `src/db/repositories`.** No raw SQL / Drizzle in
  `features/` or components.
- **No DB/filesystem in React components.** Route through server actions /
  route handlers in `src/app`.
- **Normalized bbox coordinates** everywhere except the canvas and exporter edges.
- **Colors via CSS-variable Tailwind classes**, never hardcoded hex.

## Adding a new export format (example flow)

1. Add the format key to `EXPORT_FORMATS` in `src/types/domain.ts`.
2. Implement a generator in `src/core/exporter/<format>.ts` (pure function:
   annotation + image size → serialized output).
3. Wire it into the submission transaction and settings UI.
4. Add Vitest coverage mirroring the VOC tests.
5. Document it in [export-format.md](./export-format.md) and CLAUDE.md §10.

## Definition of done

`pnpm typecheck && pnpm lint && pnpm test` are green, docs/CLAUDE.md updated if
behavior changed, and no fake/placeholder functionality was introduced.
