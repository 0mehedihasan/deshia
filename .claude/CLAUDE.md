# CLAUDE.md — DeshiA Project Instructions

> Authoritative project-level guidance for any Claude / coding-agent session.
> Read this first. It is written so a fresh session can work on DeshiA without
> any prior conversation history. When code and this file disagree, trust the
> code and fix this file.

## 1. What DeshiA is

**DeshiA (Deshi Annotation)** is an open-source, desktop **image annotation
workstation for computer vision research**. It supports image organization,
hierarchical labeling (class → view → component), bounding-box annotation,
persistent progress with crash recovery, and reproducible dataset export.

- First target dataset: a Bangladeshi **Rickshaw / E-Rickshaw** set (~500 images).
- **The Rickshaw ontology is the first dataset, NOT a limitation.** The core
  annotation engine is **schema-driven** and must stay reusable for any dataset.
- Author: Md. Mehedi Hasan (AMIR Lab, BUBT). GitHub: `0mehedihasan`. License: Apache-2.0.

Product priorities, in order: **correctness → data safety → annotation
usability → recovery → architecture → visual quality → extensibility →
performance → open-source quality.** When trading off, respect this order.

## 2. Golden rules (do not violate)

1. **Never hardcode the dataset ontology** (Rickshaw, E-Rickshaw, Front, Side,
   Back, Chain, Motor, …) into the core engine. Those live in a schema.
2. **Never silently lose annotation data.** Every mutation is persisted or
   audited; failures preserve the draft and surface an error.
3. **Never mark an image `ANNOTATED` before export fully succeeds and files are
   verified on disk.**
4. **Never modify or draw onto source images.** Originals are read-only inputs.
5. **No DB or filesystem logic inside React components.** UI → services →
   domain → persistence → filesystem.
6. **Different semantic components in the same image must have visibly distinct
   box colors.** Same component may reuse one color across its boxes. Color
   assignment is deterministic and stable (no per-render randomness).
7. **Bounding boxes are stored normalized (0..1)** and validated:
   `0 <= xMin < xMax <= 1`, `0 <= yMin < yMax <= 1`.
8. Strict TypeScript. No `any` escapes, no unused symbols, no enums (use `as
   const` unions). Keep changes small and coherent; inspect before inventing.

## 3. Architecture

Layered, one direction of dependency (top depends on things below it):

```
UI (React/Next app + components)
  ↓
Application Services (server actions / route handlers in src/app, orchestration)
  ↓
Domain Logic (src/core: annotation engine, validation, exporter, recovery, scanner)
  ↓
Persistence (src/db: Drizzle schema + repositories)
  ↓
Filesystem (source images read-only; DeshiA_Output written)
```

Directory map (`src/`):

| Path | Responsibility |
| --- | --- |
| `app/` | Next.js App Router routes, layouts, server actions, route handlers |
| `components/` | Reusable UI (incl. `components/ui` shadcn primitives) |
| `features/` | Screen-level feature modules: workspace, dataset, annotation, dashboard, export, settings |
| `core/scanner/` | Recursive scan, checksum, Sharp metadata, classification |
| `core/filesystem/` | Path validation, filename sanitization, output tree |
| `core/annotation/` | Schema-driven engine, color palette, bbox math, validation |
| `core/recovery/` | Draft detection + resume |
| `core/exporter/` | Pascal VOC XML, filename generation, submission transaction |
| `core/validation/` | Shared validators |
| `db/schema/` | Drizzle tables | `db/repositories/` | data access | `db/migrations/` | generated SQL |
| `schemas/` | AnnotationSchema types, zod validation, built-in Rickshaw schema |
| `stores/` | Zustand client stores (annotation working state, autosave status) |
| `hooks/`, `lib/`, `types/`, `utils/` | Cross-cutting helpers |

**Runtime model:** Next.js runs with a Node runtime so Drizzle + `better-sqlite3`
+ `sharp` work server-side. Tauri hosts the webview and provides native folder
dialogs (`@tauri-apps/plugin-dialog`). See `docs/architecture.md` for dev vs.
packaged runtime and the Node-sidecar note.

## 4. Technology stack

Next.js 14 (App Router) · React 18 · **strict** TypeScript · Tailwind + shadcn/ui
· Lucide icons · Geist Sans/Mono · Zustand · SQLite via **Drizzle ORM** +
`better-sqlite3` · **Sharp** for image metadata/copies · **Konva/react-konva**
canvas · **Tauri v2** desktop shell · Vitest + Playwright · **pnpm**. Avoid new
dependencies unless clearly justified.

## 5. Design system (must read before any UI work)

DeshiA must look like a **serious CV research workstation**, not a SaaS
dashboard or an AI landing page. Dark-first, technical, high information
density, restrained borders, strong typography, subtle motion (150–250ms).

**Do NOT use:** purple AI gradients, glassmorphism, huge rounded cards,
oversized hero sections, heavy shadows, decorative animation, random colors.

Colors are **CSS variables only** (`src/app/globals.css`) surfaced as Tailwind
semantic classes (`bg-surface`, `text-muted`, `border-strong`, `text-primary`
…). Never scatter hex values in components.

| Token | Dark | Light |
| --- | --- | --- |
| bg | `#0B0D10` | `#F7F8FA` |
| surface | `#11151A` | `#FFFFFF` |
| elevated | `#171C22` | `#FFFFFF` |
| border | `#252B33` | `#E5E7EB` |
| border-strong | `#343B45` | `#D1D5DB` |
| text | `#F5F7FA` | `#111827` |
| text-secondary | `#B1BAC4` | `#4B5563` |
| muted | `#7D8792` | `#6B7280` |
| primary | `#4DA3FF` | `#2563EB` |
| success / warning / error | `#32D583` / `#F5B942` / `#F04438` | `#059669` / `#D97706` / `#DC2626` |

Type: Geist Sans for UI; **Geist Mono for file paths, dimensions, IDs, technical
metadata.** Radius: buttons/inputs 8px, cards 10–12px, large surfaces 12–16px;
avoid pills. Spacing scale: 4/8/12/16/20/24/32/40/48.

## 6. Database rules

- SQLite + Drizzle; schema in `src/db/schema/tables.ts`. Entities: Workspace,
  Image, Annotation, BoundingBox, AnnotationEvent, ExportJob (schema/class/view/
  component are string keys resolved against the versioned AnnotationSchema).
- Foreign keys ON, every FK indexed, timestamps are epoch ms.
- Image status: `PENDING | IN_PROGRESS | ANNOTATED | SKIPPED | ERROR`.
- Annotation status: `DRAFT | SUBMITTED`; submissions bump `annotationVersion`.
- **`annotation_events` is append-only** — the audit/recovery trail. Never
  destructively delete annotation history; archive instead.
- All multi-row mutations run in a **transaction**. Access the DB only through
  `src/db/repositories/*`, never raw SQL in features/components.
- Output file numbering uses the persistent `images.datasetIndex`, **never** a
  count of files in a directory.

## 7. Annotation rules

Hierarchy: **Dataset → Class → View/Subclass → Component → Visibility rules →
Bounding-box rules.** Changing class changes available views; changing view
changes available components. **The UI is generated from the schema.**

Visibility: `VISIBLE` (require box when schema says so) · `OCCLUDED`
(schema-defined) · `NOT_VISIBLE` (no box required). All schema-configurable.

Annotation scope: annotate **major** body / structural / mechanical / electrical
/ class-discriminative components only. Do **not** annotate decorative parts,
screws, tiny lights, individual spokes, or minor hardware unless a future schema
explicitly configures them.

## 8. Rickshaw schema (the FIRST dataset — lives in `src/schemas/`)

Classes: **Rickshaw**, **E-Rickshaw**. Views: **Front, Side, Back**.

| Class + View | Required | Main components | Notes |
| --- | --- | --- | --- |
| Rickshaw + Front | Rickshaw Body, Steering Head | — | |
| Rickshaw + Side | Rickshaw Body | Pedal / Crank Assembly, **Chain** | **Chain is a SEPARATE box — never merge into Pedal/Crank.** |
| Rickshaw + Back | Rickshaw Body | Rear Drive Assembly | **Do NOT label the round rear part a "Motor".** |
| E-Rickshaw + Front | E-Rickshaw Body, Steering Head | Electric Control / Circuit | |
| E-Rickshaw + Side | E-Rickshaw Body | Electric Drive Area | **Pedal is OPTIONAL** — do not require when absent. |
| E-Rickshaw + Back | E-Rickshaw Body, Electric Motor | — | |

## 9. Bounding-box color rules (HARD UI requirement)

Use the dedicated utility `src/core/annotation/palette.ts`. Requirements:

1. No two **different** active components in the same image share a color.
2. Same component's multiple boxes **may** share its color.
3. Deterministic + stable within a session (no per-render randomness); assign by
   component key, not render order.
4. Perceptually separated hues; avoid adjacent/ambiguous hues; color-blind aware.
5. **Do not encode meaning with red/green alone.**
6. Box border + label text use the **same** component color; label background is
   a darker/translucent version; interior fill is highly transparent (image
   stays clearly visible, ~8–12% fill).
7. Selected box may get a stronger border/glow but keeps its semantic color.
8. If more components than the base palette, generate the next perceptually
   distinct color deterministically (golden-angle hue rotation).

## 10. Filesystem & export rules

- Source images are **read-only**; never write into or near them.
- Output tree under `DeshiA_Output/`: `RAW/<class>/<view>/`,
  `ANNOTATED/<class>/<view>/{images,annotations}/`, `VISUALIZATIONS/`.
- The **ANNOTATED** dataset holds **clean** images (no drawn boxes).
  Box-rendered images go only in `VISUALIZATIONS/`.
- Filenames: `raw_<class>_<view>_<NNN>.jpg`,
  `annotated_<class>_<view>_<NNN>.(jpg|xml)`; `NNN` from `datasetIndex`.
  Sanitize all names; never trust source filenames as identifiers.
- Validate every path (no traversal); restrict writes to the workspace output.
- Initial export format: **Pascal VOC XML** (`filename, path, size{width,height,
  depth}, object{name,pose,truncated,difficult,bndbox{xmin,ymin,xmax,ymax}}`).
  COCO/YOLO are declared in the UI but not yet implemented.

## 11. Submission transaction (order matters)

1. Validate → 2. Persist annotation → 3. Generate XML → 4. Copy RAW image →
5. Copy annotated (clean) image → 6. Verify files exist/non-empty →
7. Update DB → 8. Mark image `ANNOTATED` → 9. Load next `PENDING`.
Any failure: preserve annotation, do **not** mark complete, show a useful error,
allow retry. Marking `ANNOTATED` happens **only after** step 6 verification.

## 12. Testing requirements

- Vitest unit tests for pure logic: scanner, checksum, schema validation,
  annotation validation, bbox normalization/conversion, color assignment,
  filename generation, XML generation, export, recovery.
- Playwright e2e for the full loop: create workspace → scan → annotate →
  distinct box colors → save draft → reopen/resume → submit → verify output +
  DB status → next image.
- After each phase run: `pnpm typecheck`, `pnpm lint`, `pnpm test` (and `pnpm
  build` where meaningful). Fix errors before moving on.

## 13. Development workflow

1. Inspect the repo & existing abstractions before changing code. 2. Reuse, make
the smallest coherent change. 3. Keep the ontology in schemas, not the engine.
4. Never fake functionality or leave placeholder buttons that pretend to work.
5. Run typecheck + lint + tests. 6. Update the relevant `docs/` and this file.

Commands: `pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test` ·
`pnpm test:e2e` · `pnpm db:generate` · `pnpm db:migrate` · `pnpm tauri:dev`.

## 14. Key architectural decisions

- **Normalized bbox coordinates internally** — resolution-independent, exact
  VOC pixel conversion only at the exporter edge.
- **DB runs in the Next Node runtime**, not the Tauri/Rust side, because the
  spec mandates Drizzle + better-sqlite3 + Sharp (all Node). Tauri stays a thin
  shell (webview + native dialogs + packaging).
- **Server-only guard** in `db/client.ts` (throws in browser) instead of the
  `server-only` package, which isn't in the dependency set.
- **Append-only `annotation_events`** guarantees recoverability and satisfies
  "never silently lose data".
- **Deterministic color-by-component-key** guarantees stable, distinct box
  colors without storing a color per box.

## 15. Where to look

`docs/architecture.md`, `docs/annotation-schema.md`, `docs/dataset-format.md`,
`docs/export-format.md`, `docs/development.md`, `docs/recovery.md`,
`docs/claude-context.md`. Subsystem playbooks: `.claude/skills/*/SKILL.md`.
Contributor/agent workflow: `CONTRIBUTING.md` and `AGENTS.md`.

