# Image Metadata Analysis — repository inspection

Date: 2026-10-15

## Existing architecture

- Image discovery is `src/core/scanner/walk.ts` + `scan.ts`; it traverses source folders, filters supported extensions (`jpg`, `jpeg`, `png`, `webp`, `heic`, `heif`), streams SHA-256, and reads dimensions with Sharp metadata. It never writes source images.
- The `images` SQLite table already persists source path, filename, extension, byte size, width, height, checksum, modified timestamp, and dataset index. Image rows are inserted once by `imageRepo.insertImages` and duplicate content is tracked by checksum.
- `readImageMetadata` currently returns dimensions and normalized extension only. Import scan serially inspects files; extraction errors are counted but are not persisted as image rows.
- Workspace statistics are server rendered at `/workspace/[id]/statistics`; client dashboard and CSV/JSON/Markdown generators live in `src/features/analytics` and `src/core/analytics`.
- Annotation workbench displays image filename and width × height in the top strip. Original image dimensions drive canvas normalization; the image API serves the original path. No metadata panel exists.
- Sharp is already a dependency and used for metadata and image output. SHA-256 is already streamed from actual source bytes.
- Migrations use Drizzle SQL files and `src/db/migrations/meta/_journal.json`; database I/O belongs in repositories and services, not React components.
- Existing dirty changes include analytics, schema hierarchy, vehicle instance support and export consistency. Preserve them.

## Design decisions

- Treat dimensions returned by Sharp metadata on the original source file as the recorded source resolution. Never use a rendered/rotated/resized preview for resolution analytics.
- Keep resolution, pixel count, reduced aspect ratio, relative path, MIME type, and format as derived values where practical. Persist only new extraction facts not safely recoverable from existing fields: MIME type, color/channel description, extraction status, and extraction error. Existing extension/fileSize/width/height/checksum remain authoritative stored fields.
- Use source-root-relative paths in metadata reports; do not export absolute original paths.
- Backfill existing image records in bounded resumable batches. Recheck source stat, Sharp metadata and SHA-256; report checksum mismatches and unreadable/missing sources without changing annotations or image files.
- Derive aggregation from image rows in repository-provided projections; do not persist aggregate distributions.
- Support HEIC/HEIF through existing Sharp build; report extraction errors as data instead of falling back to extension-guessed dimensions or MIME.
- Keep statistics and metadata UI within existing Statistics and Annotation routes.

## Implementation progress

- Added an additive image metadata migration and applied it to the local workspace database after creating `/private/tmp/deshia-before-image-metadata.db`.
- Backfilled all 523 current RickshawVision-BD workspace image rows in 40-record batches. 523 analyzed, 0 failed; no annotation records were touched.
- Current measured summary: 523 total images (522 ANNOTATED, 1 SKIPPED), 523 analyzed, zero failures; 39 exact resolutions; width range 818–4608, height range 818–4608; 0.89–15.93 megapixels; most common 1536 × 2048 (90 images, 17.21%); average dimensions 2434.79 × 3012.50; 1,474,787,223 bytes total source storage; median file size 3,379,593 bytes; all 523 detected as JPEG; no duplicate checksum groups or metadata validation issues. Exact distribution is available in the Statistics page and generated exports.
- Tests cover JPEG/PNG/WebP fixtures, original-byte SHA-256, corrupt images, unsupported suffixes, checksum change detection, aggregation, relative paths, CSV/JSON/Markdown, and preservation of existing rows by migration. HEIF test is conditional on `DESHIA_HEIF_FIXTURE` being provided because no HEIF fixture is present in this environment.
- Verification complete: `pnpm typecheck`, `pnpm lint`, `pnpm test` (181 passed, one HEIF fixture test skipped), `pnpm build` (warning-free), migration smoke test, and live 523-image backfill all passed. Source checksum was revalidated for every existing image; image, box, and annotation-event counts remain 523, 1,209, and 5,088.

## Duplicate source inventory follow-up

- A fresh read-only scan of the local source tree found 541 supported files: 523 unique-content imports and 18 exact byte duplicates, with zero unsupported files or extraction errors. These duplicate paths were omitted from `images` by design, which also omitted their source storage from metadata summaries.
- Added migration `0004_add_source_image_duplicates` and the `source_image_duplicates` table. Duplicate rows are idempotently keyed by workspace/source path and keep dimensions, format/MIME, byte size, checksum, modification time and a canonical image reference. They do not create image or annotation rows.
- Statistics and metadata exports now include both imported rows and duplicate source files for source-file resolutions, formats, sizes, checksums and storage. They separately expose `importedImageRecords` and `duplicateFilesDetected`; each export row includes `record_type` and `duplicate_of_filename`.
- Local DB after migration and inventory: 541 source-file records; 523 unique checksums; 18 duplicate paths spanning 16 checksums; 1,546,561,960 bytes source storage. Existing image rows remain 523 and annotation rows remain 522.
- Full verification after this work: typecheck, lint, 183 tests passed with one optional HEIF test skipped, and production build passed. Direct app-action invocation was not possible because `tsx` required an IPC socket denied by the sandbox; source scan was run via Node’s TS import loader and duplicate inventory was populated from that scan using a transaction with the same idempotent key and fields as the repository upsert.
