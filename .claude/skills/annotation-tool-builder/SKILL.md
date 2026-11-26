---
name: annotation-tool-builder
description: Build a local-first, schema-driven image/video annotation workstation from scratch — ontology model, geometry engine, Konva canvas tools, persistence with an append-only audit log, autosave/crash recovery, export/import formats, video tracks, optional multi-user mode, and the verification gate. Use when asked to create an annotation tool, port CVAT-style features into an app, or design a dataset annotation workflow.
---

# Building an annotation tool

A field guide derived from a working implementation (DeshiA). The product can
be rebranded; these engineering rules are what make the annotation data
trustworthy. Follow the phases in order — each one has an acceptance gate.

## Golden rules (never violate)

1. **The ontology is data, not code.** Classes, labels, attributes and their
   rules live in a versioned schema. The engine renders whatever schema it is
   given; never hardcode dataset names in JSX or validators.
2. **Never silently lose work.** Every mutation is persisted or audited. Use an
   append-only event table and fail loudly without clearing the in-memory draft.
3. **Never mark an image done before its files exist and are verified.** Submit
   order: validate → persist → write exports → verify on disk → mark complete.
4. **Source media is read-only.** All derived copies (clean images, previews,
   redacted copies) go to an output tree. No drawing onto originals.
5. **No DB/filesystem calls in React components.** UI → server action →
   repository → domain logic → filesystem.
6. **Stable, deterministic colors.** Distinct active labels in one frame must
   never share a color; key the palette by label id, not render order.
7. **Normalized geometry internally.** Store `[0,1]` image-relative
   coordinates; convert to pixels only at the canvas and exporter edges.
8. **No fake UI.** If a capability is not implemented, say so — do not render a
   button that pretends to work.

## Recommended layout

```
src/
  core/
    geometry/      pure shape math, hit-testing, bounds, transforms
    annotation/    schema resolution, validation, objects, z-order, snapping, interpolation
    exporter/      VOC/COCO/YOLO/CVAT/native writers, loss reports, ZIP, aggregate COCO
    importer/      YOLO/COCO/VOC/CVAT/native parsers
    recovery/      next-image detection, browser drafts
    scanner/       recursive discovery, checksums, metadata, video probing
    video/         ffprobe parsing + ffmpeg frame decoding
  schemas/         schema types, zod validation, traversal, migration, attributes
  db/              client, migrations, Drizzle tables, repositories only
  stores/          client working state + bounded undo/redo history
  features/        screen modules (annotation, schema, analytics, auth)
  app/actions/     server actions (the only DB/FS orchestration entry points)
```

Dependency direction is strictly downward: `features → actions → core/db → fs`.

## Phase 1 — schema and geometry core (pure, testable first)

- Model a schema as a forest of **group** and **label** nodes. A label has a
  stable `id`, display `name`, allowed `geometryTypes`, `attributes`, `color`,
  `enabled`/`archived`/`visible`, and optionally `redactOnExport`.
- Keep a flat legacy schema if you need a first dataset, but migrate it into the
  recursive model with deterministic path-derived ids and `legacyKey` bridges.
  Never orphan existing annotations.
- Geometry union: `box`, `rotated_box` (cx/cy/w/h/angle, clockwise degrees in
  pixel space), `polygon`, `polyline`, `point`, `points`, `ellipse`, `cuboid`
  (8 projected corners in CVAT order). Implement bounds, center, polygon view,
  hit-test and validation per kind before touching UI.
- Store an object per instance: `labelId`, `geometry`, `attributes`, `occluded`,
  `zOrder`, `visible`, `locked`, `trackId`, `frameNumber`, `outside`, `source`,
  `score`. Validation compares attributes and geometry kind against the label.

**Gate:** unit tests for every geometry kind, schema validation, duplicate ids,
attribute validation, and the legacy→recursive migration.

## Phase 2 — persistence and audit

- Tables: workspace, media/image (index, checksum, dimensions, `mediaKind`,
  `duration`, `fps`, `frameCount`), annotation (one per still image, with
  `status`, `saveRevision`), objects (one row per annotated object), and an
  **append-only** event table.
- Every draft save is one transaction: replace the object set, append a
  `DRAFT_SAVED` snapshot, update status `PENDING → IN_PROGRESS` only.
- Published schema versions are immutable; enforce it with SQLite triggers, not
  just application checks. Drafts can be edited until publish; a new draft
  copies the previous definition.
- Add a monotonic `saveRevision`. A client sends `expectedRevision`; a mismatch
  returns a conflict with the server state and lets the user choose.

**Gate:** migrations applied to a fresh DB; FK cascade checked; triggers reject
UPDATE/DELETE of published versions; a draft save is atomic.

## Phase 3 — canvas and interaction

- One stage, three layers: source image, object shapes, selection/overlay.
- Convert pointer positions through a single transform seam
  (`stageToImageNorm` / `imageNormToStage`); wheel zoom at pointer and pan must
  change only the view, never stored geometry.
- Tools: Select, Rectangle (2-point drag **and** 4-point click), Rotated box,
  Ellipse, Polygon, Polyline, Point, Points, Cuboid.
- Gestures: drag-to-draw; click-to-place paths with double-click/Finish;
  Shift-drag freehand; double-click edge inserts a vertex; right-click vertex
  deletes it; vertex snapping with Ctrl/Cmd bypass; marquee multi-select;
  copy/paste with offset; all four z-order moves; undo/redo of whole snapshots.
- Display-only brightness/contrast/gamma via cached image filters — never alter
  source or exported pixels.
- Image adjustments, label text and tool state are UI-only; selection is not
  persisted as annotation metadata.

**Gate:** draw, edit, undo, redo, zoom/pan and color distinctness exercised in
the actual app, not only in pure helpers.

## Phase 4 — autosave, recovery, history

- Debounced autosave (700–800 ms) with explicit Save and status badge
  (Saved / Saving / Unsaved / Save failed).
- Mirror each successful save to IndexedDB. On reopen, if the browser copy
  differs from the persisted state, offer explicit **Restore / Discard** —
  never apply a local draft silently.
- Expose the last N append-only snapshots as a revision panel; "restore" writes
  the old snapshot as a **new** revision with a `RECOVERED` event.
- Use focus-trapped dialogs (Radix or equivalent) for destructive confirms and
  recovery; scope keyboard shortcuts to real DOM-originated events.

**Gate:** simulated crash resumes exact state; restore never rewrites history.

## Phase 5 — export/import

- VOC: axis-aligned boxes, integer pixels, `<occluded>`; COCO: bbox +
  segmentation for polygons, one dataset-level aggregate file; YOLO:
  normalized class cx cy w h + `classes.txt`; CVAT 1.1 XML: real geometry,
  attributes, occlusion, z-order, plus a stored ZIP; native project: lossless
  JSON with schema and raw object rows.
- A format that cannot represent a kind must convert **explicitly** and report
  the loss (AABB fallback, skipped point, attributes omitted). Never drop
  silently.
- Importers mirror exporters and resolve label references to stable ids;
  untrusted JSON/XML is parsed defensively and skips corrupt rows.
- Privacy redaction (face circles or label-driven regions) is baked only into
  exported copies; source bytes stay untouched.

**Gate:** export → import → re-export round-trip; ZIP passes `unzip -t`; every
loss reported; verified file existence before status changes.

## Phase 6 — video and tracks

- Persist `frameNumber` on objects; group objects into tracks by `trackId`.
- Interpolate geometries between keyframes on read (shortest-arc angles,
  vertex-matched paths, no extrapolation, `outside` closes a segment).
- Editing a frame without a keyframe promotes it to a real keyframe. Show a
  timeline with keyframe markers and explicit Add-keyframe/New-track actions.
- Frame decoding via optional ffmpeg/ffprobe, bounded cache, and a clear 503
  when the binary is absent. Never fake a preview.

**Gate:** annotate frame N, see N+1 interpolated, edit it, reload and still see
the promoted keyframe.

## Phase 7 — optional multi-user (only if asked)

- Keep single-user as the default. Gate sign-in, roles (ADMIN/ANNOTATOR/
  REVIEWER) and user management behind an environment flag such as
  `DESHIA_MULTIUSER=1`.
- PBKDF2 per-user salts; hashed opaque session tokens; HttpOnly cookies; guard
  write actions only when the flag is on. When off, no action reads sessions.

## Phase 8 — testing and verification gate

Run after **every** phase:

```bash
pnpm typecheck   # strict TypeScript
pnpm lint
pnpm test        # Vitest pure logic
pnpm build       # when build output is touched
```

Add Playwright e2e for the real loop (create → scan → annotate → save/reload →
submit → verify files). Unit-test pure math, repository transactions where
possible, and exporters. Document anything deliberately not implemented.

## Common failure modes

- Pure helper exists but is never wired into the canvas — audit UI reachability.
- Palette keyed by render order → colors shift when objects are deleted.
- Marking an image complete when export wrote an empty file.
- Using file counts instead of a persistent dataset index for filenames.
- Treating `NOT_VISIBLE`/`outside`/hidden objects as corrupt exports instead of
  reporting their exclusion.
- Publishing a schema version and then editing it in place, orphaning old
  annotation references.
- Assuming ffmpeg exists; always degrade gracefully.

See `docs/BUILD-ANNOTATION-TOOL.md` for the full narrative, checklists and
copyable contracts, and `docs/rooyacvat-parity.md` for a worked feature map.
