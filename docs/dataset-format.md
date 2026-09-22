# Dataset Format

How DeshiA ingests a source dataset and what it records per image.

## Source directory

- Selected via a native folder picker (or path input in browser dev).
- Scanned **recursively**; subdirectories are traversed.
- Source files are treated as **read-only**. DeshiA never modifies, moves, or
  renames them.

## Supported image formats

`jpg`, `jpeg`, `png`, `webp`, `heic`, `heif` (extension compared lower-cased,
dot stripped). Other files are recorded as `UNSUPPORTED` and are not imported as
annotatable images.

## Per-image record

Stored in the `images` table (`src/db/schema/tables.ts`):

| Field | Meaning |
| --- | --- |
| `id` | Unique id (content/uuid based, never the filename) |
| `datasetIndex` | Persistent, monotonic per-workspace number used for output naming |
| `originalFilename` | Source filename (display only) |
| `originalPath` | Absolute source path |
| `extension` | Normalized lower-case extension |
| `fileSize` | Bytes |
| `width`, `height` | Pixel dimensions (via Sharp) |
| `checksum` | **SHA-256** of file contents |
| `modifiedAt` | Source modification time (epoch ms) |
| `status` | `PENDING \| IN_PROGRESS \| ANNOTATED \| SKIPPED \| ERROR` |
| `isDuplicate`, `duplicateOfId` | Duplicate flag + pointer to the first copy |

## Duplicate detection

Duplicates are found by **content hash**, not filename. The first file with a
given checksum in a workspace is canonical; later identical files are flagged
`isDuplicate = true` with `duplicateOfId` set. Filenames are never trusted as
identity.

## Scan progress & review

While scanning, DeshiA reports per-format progress, e.g.:

```
Scanning dataset...
JPEG   382
PNG     71
HEIC    39
WEBP     8
Total  500
```

After scanning it presents a review before the workspace is committed:

```
SCAN COMPLETE
Total Images       500
Supported Images   500
Duplicates          12
Unsupported Files    3
Errors               0
```

The user reviews these counts before continuing to annotation.

## Performance

Datasets may contain thousands of images. Checksums are streamed, metadata is
read without full pixel decode where possible, and rows are inserted in batched
transactions. The UI never loads the whole dataset into React state — it
paginates and lazy-loads thumbnails and prioritizes the active image.
