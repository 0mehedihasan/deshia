# Changelog

All notable changes to DeshiA are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Initialized per-label visibility/lock state before the canvas derives its
  objects, removing a runtime error when switching to the Objects editor.

### Added — full CVAT-style toolset (single-user, DeshiA branding)

- **Objects editor** alongside the original component workflow: many independent
  schema-labelled objects per frame with eight geometry kinds (rectangle,
  rotated box, ellipse, polygon, polyline, point, points, 8-corner cuboid),
  attributes, occlusion, z-order, visibility/lock, tracks and per-frame video.
- **Recursive schema system persisted in SQLite** with draft/published versions,
  SQLite triggers enforcing immutability, a local schema editor, JSON import/export
  and a migration from the legacy flat schema.
- **CVAT-style canvas tools**: 2-point and 4-point rectangles, vertex
  insert/delete, snapping, freehand, crosshair, live dimensions, marquee and
  keyboard multi-select, clipboard, wheel zoom, pan, fit, four z-order moves and
  bounded undo/redo.
- **Video & tracks**: source scanning for MP4/MOV/AVI/MKV/WEBM, optional ffprobe
  metadata, ffmpeg frame decoding with a bounded cache, timeline with keyframe
  markers, read-time interpolation, keyframe promotion and track management.
- **Exporters/importers**: CVAT 1.1 XML + stored ZIP, dataset-level aggregate
  COCO, native lossless project, explicit loss reports, YOLO/COCO/VOC/CVAT/native
  importers and label-driven export redaction.
- **Reliability**: revision history with audited restore, IndexedDB crash drafts
  with explicit Restore/Discard, optimistic-concurrency conflict resolution,
  focus-trapped dialogs and an in-app manual.
- **Local analytics** for generalized objects with Markdown report, and a
  workspace snapshot backup with SHA-256 manifest.
- **Optional multi-user layer** behind `DESHIA_MULTIUSER=1`: sign-in, roles and
  an admin user screen; off by default so the normal path stays single-user.
- **Open-source project files**: full build guide, reusable agent skill, issue
  and PR templates, dependabot, code of conduct and repository metadata.

### Added

- **Schema-driven annotation engine** (`src/core/annotation`) — resolves any
  `AnnotationSchema` (Dataset → Class → View → Component → Visibility → Box
  rule) with zero hardcoded ontology.
- **Built-in Rickshaw / E-Rickshaw schema** (`src/schemas/rickshaw.ts`) as the
  first dataset, including domain rules (Chain is a separate box; the rear
  round part is _Rear Drive Assembly_, not a motor; E-Rickshaw pedal optional).
- **Deterministic bounding-box color palette** (`src/core/annotation/palette.ts`)
  — perceptually separated, color-blind-aware, assigned by component key so
  distinct components in one image never share a color and colors stay stable.
- **SQLite persistence via Drizzle** (`src/db`) — Workspace, Image, Annotation,
  BoundingBox, append-only `annotation_events`, and ExportJob, all behind
  repositories.
- **Recursive source scanner** (`src/core/scanner`) — checksum-based duplicate
  detection, Sharp metadata, supported/unsupported classification.
- **Crash recovery** (`src/core/recovery`) — detect and resume the next image
  from persisted drafts + the append-only event trail.
- **Multi-format exporter + strict submission transaction**
  (`src/core/exporter`) — every submission writes **Pascal VOC XML, COCO JSON,
  and YOLO TXT** side by side plus a dataset-level `classes.txt`, copies the
  clean RAW and ANNOTATED images, and renders a box-annotated `VISUALIZATIONS`
  preview: persist → generate labels → copy RAW → copy clean ANNOTATED + write
  labels → verify files on disk → only then mark `ANNOTATED`.
- **Face-privacy mosaic redaction** (`src/core/annotation/redaction.ts`,
  `src/core/exporter/redaction-render.ts`) — a resizable circular tool that
  pixelates human faces with a hard, irreversible mosaic baked into every
  exported copy (RAW, ANNOTATED, visualizations); source images are never
  modified and redactions survive class/view changes.
- **Dataset navigation** — dataset-order Previous / Next paging plus one-click
  resume of the next pending image.
- **Workspace management** — rename and delete workspaces from the welcome
  screen; delete is DB-only, leaving source images and existing output on disk.
- **Output inventory** — a read-only scan of what exists on disk, broken down by
  class and view, surfaced on the dashboard.
- **Application services** (`src/app/actions`, `src/app/api`) — server actions
  for create-workspace, scan-and-import, save-draft, submit, and skip; a scoped
  byte-serving image route.
- **UI** (`src/features`, `src/components`) — welcome/workspace creation,
  dashboard with progress + image inventory, three-zone annotation workbench
  (Konva canvas, class/view selectors, per-component visibility + draw-arm, live
  validation, autosave), and a read-only settings/schema view. Dark-first,
  CV-workstation design system driven entirely by CSS variables.
- **Docs & contributor context** — `.claude/CLAUDE.md`, subsystem skills,
  `AGENTS.md`, `CONTRIBUTING.md`, and `docs/`.

### Changed

- Face redaction now applies a hard, irreversible **mosaic** instead of a
  Gaussian blur — a blur could leave faces recognizable, whereas averaging each
  region down to a few blocks destroys the detail for good.
- Canvas selection resize handles are now high-contrast red with a light ring so
  they stay visible over bright image regions (an annotator-only affordance,
  never exported); box borders keep their semantic component color.

### Tests

- Vitest unit suites for scanner, checksum, schema/annotation validation, bbox
  math, palette assignment, filename generation, VOC / COCO / YOLO + label-map
  output, visualization layout, and redaction geometry + mosaic pixelation.
- Playwright end-to-end spec for the full loop (create → scan → annotate with
  distinct colors → save/resume → submit → verify output on disk).

[Unreleased]: https://github.com/0mehedihasan/deshia/commits/main
