# Changelog

All notable changes to DeshiA are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Schema-driven annotation engine** (`src/core/annotation`) — resolves any
  `AnnotationSchema` (Dataset → Class → View → Component → Visibility → Box
  rule) with zero hardcoded ontology.
- **Built-in Rickshaw / E-Rickshaw schema** (`src/schemas/rickshaw.ts`) as the
  first dataset, including domain rules (Chain is a separate box; the rear
  round part is *Rear Drive Assembly*, not a motor; E-Rickshaw pedal optional).
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
- **Pascal VOC XML exporter + strict submission transaction**
  (`src/core/exporter`) — persist → generate XML → copy RAW → copy clean
  ANNOTATED image → verify files on disk → only then mark `ANNOTATED`.
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

### Tests

- Vitest unit suites for scanner, checksum, schema/annotation validation, bbox
  math, palette assignment, filename + VOC XML generation.
- Playwright end-to-end spec for the full loop (create → scan → annotate with
  distinct colors → save/resume → submit → verify output on disk).

[Unreleased]: https://github.com/0mehedihasan/deshia/commits/main
