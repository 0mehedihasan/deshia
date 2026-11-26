# Rooyacvat feature parity — analysis & phased plan

**Date:** 2026-11-25 · **Status:** living document
**Source analysed:** the former `rooyacvat/` folder (RooyaCVAT: React/Vite + Rust/Axum + SQLite, 19 migrations, ~197 frontend unit tests). The reference folder was removed from this repository on 2026-11-26 after the port; this document is the retained analysis.
**Target:** DeshiA — branding, product name, logo and copy stay **DeshiA**. Features are ported, not the brand.

**Deployment constraint (user decision, 2026-11-25):** DeshiA remains a
**single-user, local-device** workstation. Rooyacvat's authentication, roles,
admin/reviewer accounts, assignments, job queues, review approvals and team
reports are **out of scope by default**. An opt-in multi-user layer (sign-in,
roles ADMIN/ANNOTATOR/REVIEWER and an admin user screen) is available behind
`DESHIA_MULTIUSER=1`; the default build stays single-user and needs no sign-in.
"All features" means all _annotation
tools, editing interactions, schema capabilities, reliability, video/track,
export/import and analytics features_, minus anything that requires a second
user. Phases below have been revised accordingly.

## Why this document exists

The user asked for **all Rooyacvat features in DeshiA**, in phases, preserving the
existing uncommitted work in the tree. This document is the honest inventory of
what Rooyacvat actually has, what DeshiA already had, what has been ported in
phase 1, and what remains. It follows the project's rule: **do not claim a
feature works until it is wired and verified**. Pure domain code is labelled
as such; "implemented" means reachable from the running app.

## Source inventory (Rooyacvat, grouped)

| Area          | Features present in Rooyacvat                                                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shapes        | Rectangle (2/4-point, rotation), ellipse, polygon, polyline, point, points group, 8-corner projected cuboid; attributes (text/number/checkbox/select); visibility + lock; occlusion + z-order; `outside` track exit; reserved `source`/`score`                 |
| Editing       | CVAT tool rail + draw popover, crosshair, rubber band, live dimensions, freehand (Shift-drag), vertex snap/insert/remove, edge auto-pan, zoom-invariant strokes, on-canvas shape text, multi-select, clipboard, bounded undo/redo, clear-all with confirmation |
| Reliability   | 700 ms debounced autosave, request-id idempotency, monotonic frame revision with 409/412 conflict recovery, IndexedDB drafts with Recover/Discard, last-100 revision history with restore                                                                      |
| Video         | ffprobe import gate, ffmpeg frame decode + cache, frame slider/navigation, tracks, server-side keyframe interpolation, keyframe promotion on edit                                                                                                              |
| Schemas       | Draft → Published immutable versions, normalized label/attribute/value tables, JSON import/export, admin schema manager, inline label builder at batch creation, redaction flag                                                                                |
| Workflow      | Batches/tasks/jobs, per-media assignment, job state machine (NEW → … → ACCEPTED/REJECTED), reassignment, role-scoped queues, review issues/comments with canvas placement                                                                                      |
| Reports       | 7/30/90-day aggregate activity + CSV, per-annotator drill-down (duty days, hours, sessions), reviewer and batch tables                                                                                                                                         |
| Auth          | PBKDF2 passwords, hashed cookie sessions, ADMIN/ANNOTATOR/REVIEWER RBAC, demo admin, audit log (write-only)                                                                                                                                                    |
| Import/export | Folder import with side detection + SHA-256, streamed upload, batch delete/add-files, COCO / YOLO / Pascal VOC / CVAT 1.1 XML+ZIP / native package, skip reports, point-driven redaction, unified export runner                                                |
| Storage/ops   | StorageProvider seam + local adapter, byte-range media streaming, Tauri scoped folder writer, crash handling, graceful shutdown                                                                                                                                |
| UI            | Admin shell, job dashboard, manual page, theme control, readability pass, lazy-loaded editor, dialog a11y                                                                                                                                                      |

Rooyacvat features that are **not actually implemented there** (design only): AI
assist (DB columns + provider seam), brush/mask, skeleton annotation, relations,
tags, notifications, issue categories, backup/restore, cloud adapters, URL
routing. These are not parity targets.

## DeshiA baseline (before this work)

Strong existing foundations: normalized bbox + deterministic palette +
schema-driven class/view/component engine, append-only audit events, transactional
draft save, verified atomic submission, SHA-256 scanner + Sharp metadata,
VOC/COCO/YOLO exporters, face-mosaic redaction, crash recovery, statistics,
Tauri shell.

Principal gaps: only one component-decomposed annotation per image, axis-aligned
rectangles only on the canvas, no multi-user workflow, no video, no CVAT-style
tool rail/undo/attributes/locks/z-order, no schema editor UI, no annotation
importers, no CVAT/native export.

## Phase 1 — generalized annotation core (DONE)

Wired into the running app:

- Eight geometry kinds in `src/core/geometry/`: `box`, `rotated_box`, `polygon`,
  `polyline`, `point`, `points`, `ellipse`, `cuboid` (8-corner CVAT order),
  with unified bounds/centre/polygon view, hit-testing and pixel-isotropic math.
- `AnnotationObject` domain model (`src/types/domain.ts`) — many objects per
  image, stable label id, attributes, `occluded`, `zOrder`, `visible`, `locked`,
  `trackId`, `outside`, `source`/`score`.
- Pure domain helpers `src/core/annotation/objects.ts` — validation against a
  recursive label definition, CVAT z-order moves, vertex editing, duplication,
  defensive JSON serialization/parsing.
- Persistence: `annotation_objects` table (migration `0005_annotation_objects.sql`),
  repository with transactional whole-frame replacement and `OBJECTS_SAVED`
  audit events. Existing component-box data is untouched.
- Client store: objects plus a bounded 50-snapshot undo/redo history covering
  boxes, objects, redactions and class/view changes.
- UI: **Objects** editor mode beside the existing Components mode — label
  picker, CVAT tool rail (keys 1–9), drag/click drawing for all shapes,
  click-to-finish paths, vertex editing, object list with attributes,
  visibility/lock/occlusion/track/z-order controls, undo/redo buttons.
- Draft payload carries objects through save/submit actions and reloads them on
  re-open; debounced autosave keeps working.
- `db:migrate` entrypoint fixed for ESM (`require.main` was broken).

**Deliberate limitation:** Submit is disabled in Objects mode. The current export
writers only understand component boxes; submitting would produce an empty
dataset. Drafts are saved and recovered in full. Phase 4 wires the exporters
before enabling submit.

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (190 passed, 1 skipped),
`pnpm build`, migration applied to a fresh temp DB and schema inspected.

## Phase 2 — schema editor (DONE)

- SQLite persistence: `schemas` + `schema_versions` tables (migration `0006_schema_versions.sql`),
  draft/published versions, one draft per schema, immutable published versions
  enforced by SQLite triggers (verified by direct UPDATE/DELETE attempts).
- Repository `src/db/repositories/schemas.ts` — create/update/publish/new-draft/
  import/activate, defensive JSON parsing, never throws on corrupt definitions.
- Server actions `src/app/actions/schemas.ts` with validation on every write.
- Local editor at `/workspace/[id]/schema` (new **Schemas** tab): create/rename,
  select, groups/labels, names/colors, enabled/archived/visible, geometry types,
  attribute types and required flags, reorder/delete, JSON import/export,
  save draft → publish → new draft.
- The annotate screen now uses the workspace's persisted schema definition as
  the object label source; built-in Rickshaw schemas stay read-only.
- Pure immutable tree helpers `src/schemas/nodes-edit.ts` with unit tests.

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (194 passed, 1 skipped),
`pnpm build`; migration applied to a fresh temp DB and immutability triggers exercised.

## Phase 3 — exporters & importers (DONE)

- `src/core/exporter/object-formats.ts` — object label map from the recursive
  schema, AABB conversion with **explicit loss reports**, COCO segmentation for
  polygons, CVAT 1.1 XML with real geometry/occlusion/z-order/attributes, and a
  native lossless JSON project entry.
- `exportImage` now validates the object model, writes VOC/COCO/YOLO/CVAT XML +
  native project for Objects mode, and still uses the untouched legacy path for
  component-box submissions. Preview images contain boxes only in `VISUALIZATIONS/`.
- **Submit is enabled in Objects mode** when objects are present and valid.
- `src/core/importer/import-annotations.ts` — YOLO TXT, COCO JSON, Pascal VOC
  XML and native project importers with label-reference resolution; the Objects
  panel has an Import button (.txt/.json/.xml).
- Unit tests cover export loss reporting, CVAT XML, native round-trip and all
  four importers.

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (202 passed, 1 skipped),
`pnpm build`.

## Phase 4 — video & tracks (DONE)

- `frameNumber` on every object (migration `0007_video_frames.sql`, with `media_kind`,
  `duration_ms`, `fps`, `frame_count` on media rows).
- Scanner accepts MP4/MOV/AVI/MKV/WEBM as read-only video sources; ffprobe metadata
  is best-effort and never blocks import.
- Pure ffprobe parser + bounded ffmpeg frame-decode cache; authenticated frame
  route `/api/media/[id]/frame?n=` returns a downscaled JPEG or a clear 503 when
  ffmpeg is not installed.
- Pure track interpolation (boxes, rotated boxes, ellipses, points, point groups,
  paths and cuboids; shortest-arc angles; no extrapolation; `outside` closes a
  segment) with unit tests.
- Objects editor: frame slider and prev/next, per-frame object filtering,
  interpolated shapes shown between keyframes, editing an interpolated frame
  promotes it to a real keyframe, and a **New track** action assigns a track id
  to the selected object.

Limitation: frame decoding requires `ffmpeg` on the local device; when absent the
video still imports and all annotations/drafts are saved, but no frame preview is
shown. This is surfaced in the UI, never faked.

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (207 passed, 1 skipped),
`pnpm build`; migration applied to a fresh DB and frame columns inspected.

## Phase 5 — editing polish & reliability (DONE)

- Vertex snapping with Ctrl/Cmd bypass, Shift-drag freehand with downsampling,
  full-image crosshair while drawing, live `W × H px` readout.
- Multi-select (Ctrl/Cmd+A) and clipboard duplication (Ctrl/Cmd+C/V) in one
  undo step; all selected shapes show handles.
- Revision history panel: reads the append-only `OBJECTS_SAVED` events and
  restores a snapshot as a new revision through `RECOVERED` audit events —
  history is never rewritten.
- IndexedDB crash drafts mirrored on every successful autosave, with an explicit
  **Restore / Discard** prompt on reopen when the local copy differs.
- In-app **Manual** page (`/manual`) with keyboard shortcuts and data-safety
  notes, linked from the workspace top bar.
- Pure snapping/freehand helpers with unit tests.

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (210 passed, 1 skipped),
`pnpm build`.

## Phase 6 — local analytics & hardening (DONE)

- Pure object statistics (geometry/label distributions, occlusion, tracks,
  frames, attribute coverage) with Markdown report; wired into the Statistics
  screen with an Export report button.
- Local snapshot export in Settings: checkpointed SQLite database + workspace
  output tree + SHA-256 manifest. The live database is never overwritten;
  restore is a documented manual step with the app closed.
- Settings now lists CVAT XML and native project as available formats.
- CI workflow (`.github/workflows/ci.yml`) runs typecheck, lint, tests and build.

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (212 passed, 1 skipped),
`pnpm build` — all green.

## Gap audit and closure (2026-11-25 → 26)

A code-level audit found several helpers that were never wired into the UI.
All of the following are now implemented and verified:

- 4-point rectangle mode; vertex insert (double-click edge) / delete (right-click
  vertex); wheel zoom, middle-drag pan, fit; all four z-order operations;
  marquee multi-select; double-click label rename.
- Clear-all confirmation and focus-trapped dialogs (Radix); Alt+1…9 quick
  labels; `?` manual shortcut; brightness/contrast/gamma display filters.
- Per-label show/hide + lock toggles; object search/filter; attribute defaults
  and `mutable`; track list with rename/remove, `outside` control; video
  keyframe markers and explicit Add-keyframe button.
- Optimistic-concurrency conflict detection via `save_revision` (migration 0008)
  with Use-saved / Keep-local resolution.
- CVAT ZIP archive (verified with `unzip -t`), dataset-level aggregate COCO,
  CVAT XML import, label-driven export redaction, schema rename/delete UI.
- Object-mode Playwright spec; legacy e2e placeholders removed.

**Still absent (by user decision or because the source project never had it):**
authentication, roles, teams, jobs/assignments, review workflows, multi-user
reports, AI assist, brush/mask, skeleton, relations, tags, cloud adapters.
Request-ID replay (as opposed to revision-based conflict detection) is not
implemented — the local single-user workflow does not need cross-device replay.

## Phase table (historical)

| Phase                            | Scope (single-user)                                                                                                                   | Acceptance gate                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 2 — Schema editor & attributes   | **DONE** — persisted versions, local editor UI, object labels wired, immutability triggers                                            | Verified: typecheck/lint/tests/build + trigger checks                |
| 3 — Exporters & importers        | **DONE** — VOC/COCO/YOLO/CVAT XML/native project, loss reports, four importers                                                        | Verified: typecheck/lint/tests/build; Submit enabled in Objects mode |
| 4 — Video & tracks               | **DONE** — video ingest/probe, frame decode + cache, frame slider, keyframe promotion, interpolation, track ids                       | Verified: typecheck/lint/tests/build + migration; ffmpeg optional    |
| 5 — Editing polish & reliability | **DONE** — snapping, freehand, crosshair/dimensions, multi-select/clipboard, revision restore, IndexedDB Recover/Discard, manual page | Verified: typecheck/lint/tests/build                                 |
| 6 — Local analytics & hardening  | **DONE** — object statistics, snapshot export with manifest, format docs, CI                                                          | Verified: typecheck/lint/tests/build                                 |

**Out of scope by user decision:** authentication/sessions, roles/RBAC, teams,
batches/tasks/jobs with assignees, review state machine, reviewer issues/comments,
reviewer/admin performance reports, notifications, hosted/cloud adapters.

## Non-goals for parity

- No rebranding: no Rooya names, logo or colors in DeshiA.
- No port of Rooyacvat's unimplemented features (AI, brush, skeleton, relations,
  tags, cloud adapters) — those remain documented as future work, not fake UI.
- No modification of source images; clean exports only, as required by `AGENTS.md`.
