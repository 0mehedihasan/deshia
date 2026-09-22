---
name: dataset-engine
description: DeshiA's dataset scanner — recursive discovery, checksums, Sharp metadata, duplicate detection, and scan review.
---

# Dataset Engine (Scanner) — DeshiA

Turns a source directory into `images` rows. **Read-only over sources.**

## Files
- `src/core/scanner/scan.ts` — recursive walk, per-file classification, progress.
- `src/core/scanner/checksum.ts` — SHA-256 content hash (streamed).
- `src/core/scanner/metadata.ts` — Sharp width/height/format.
- `src/core/filesystem/paths.ts` — path validation, extension checks.

## Supported extensions
`jpg, jpeg, png, webp, heic, heif` (lower-cased, dot stripped). Anything else is
`UNSUPPORTED` (recorded, not imported as annotatable).

## Per image, capture
unique id · original filename · original path · extension · file size · width ·
height · **SHA-256 checksum** · modification timestamp · status (`PENDING`).

## Duplicate detection
Hash content, not names. The first file with a given checksum in a workspace
wins; later identical files are flagged `isDuplicate` with `duplicateOfId` set.
Never trust filenames as identity.

## Progress + review
Emit progress counts per format while scanning (JPEG/PNG/HEIC/WEBP/…). After
scanning, present: Total Images · Supported · Duplicates · Unsupported · Errors,
and let the user review before creating the workspace. Scanning must not modify,
move, or rename any source file.

## Performance
Datasets may reach thousands of images. Stream checksums, read metadata without
decoding full pixels where possible, and never hold all files in memory as
decoded images. Persist rows in batched transactions.
