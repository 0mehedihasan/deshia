---
name: export
description: DeshiA export + submission — Pascal VOC XML, output tree, filename generation, and the atomic submission transaction.
---

# Export — DeshiA

## Files
- `src/core/exporter/voc.ts` — Pascal VOC XML generation.
- `src/core/exporter/filenames.ts` — deterministic, sanitized names.
- `src/core/exporter/output-tree.ts` — creates the `DeshiA_Output/` structure.
- `src/core/exporter/submit.ts` — the submission transaction (service layer).

## Output tree
```
DeshiA_Output/
  RAW/<class>/<view>/
  ANNOTATED/<class>/<view>/{images,annotations}/
  VISUALIZATIONS/
```
- **ANNOTATED images are CLEAN** (no boxes drawn). Rendered-box images go only
  in `VISUALIZATIONS/`. Never draw onto the original research image.

## Filenames (from persistent `datasetIndex`, zero-padded `NNN`)
- RAW: `raw_<class>_<view>_<NNN>.<ext>`
- ANNOTATED image: `annotated_<class>_<view>_<NNN>.<ext>`
- ANNOTATED xml: `annotated_<class>_<view>_<NNN>.xml`
Sanitize class/view to lowercase snake (`e_rickshaw`). Never derive numbering
from directory file counts.

## Pascal VOC XML
`annotation` → `filename`, `path`, `size{width,height,depth}`, and one `object`
per box → `name` (component label), `pose` (`Unspecified`), `truncated`,
`difficult`, `bndbox{xmin,ymin,xmax,ymax}` as **integer pixels** (round from
normalized × size, clamp inside image). Coordinates are 1-indexed per VOC
convention only if you match the reference tooling; keep it consistent and
documented in `docs/export-format.md`. Future: COCO JSON, YOLO txt.

## Submission transaction (strict order — see CLAUDE.md §11)
validate → persist annotation → generate XML → copy RAW → copy annotated (clean)
→ **verify files exist & non-empty** → update DB → mark `ANNOTATED` → next
`PENDING`. Any failure preserves the draft, does **not** mark complete, returns
a useful error, and allows retry. `ANNOTATED` is set only after verification.
