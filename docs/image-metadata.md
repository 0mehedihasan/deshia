# Image Metadata and Resolution Analysis

DeshiA extracts metadata from the original file during source scanning. Sharp
reads image headers for the encoded width, height, detected container format,
MIME type, color space, and channel count. A streamed SHA-256 is calculated
from the original file bytes. Extraction reads source files only; it never
resizes, recompresses, crops, rotates, or overwrites them.

## Persistence and definitions

The existing `images` record remains the source of truth for image ID, source
filename/path, extension, file size, width, height, SHA-256, import timestamp,
and dataset index. Migration `0003_add_image_metadata` adds detected format,
MIME type, color/channel description, extraction status, and extraction error.
Existing rows receive `PENDING` status and can be analyzed in bounded,
resumable batches. Failed rows can be retried, and **Verify All Sources** can
check all imported originals against their recorded checksums.

Resolution is the exact encoded pixel width × height reported by Sharp metadata
for the original source file. Resolution counts are not grouped by megapixels.
Aspect ratios are reduced integer ratios, while file-size histogram buckets
use byte ranges shown in the UI. Pixel count and aspect ratio are derived, not
stored redundantly. `created_at` records the import timestamp.

The annotation canvas continues to use original image dimensions. Any future
thumbnail, preview, or visualization must be treated as a derived artifact;
its dimensions must never replace source resolution metadata.

## Supported formats and validation

The import suffix allowlist remains JPG/JPEG, PNG, WEBP, HEIC, and HEIF. Format
and MIME are detected from content through Sharp rather than guessed from the
suffix. HEIC/HEIF support depends on the libvips codecs bundled with the local
Sharp build; unsupported/corrupt files become failed metadata records with a
visible error. No fallback dimensions are invented.

Validation reports extraction failures, invalid dimensions, extension/MIME
mismatches, duplicate SHA-256 groups, missing or changed source files, and
checksum mismatches. It does not delete files or annotation data. Exact
duplicate source paths are kept in `source_image_duplicates`, an additive
inventory table with checksum, dimensions, format and file size. They remain
excluded from `images` and annotation workflows. Source-file totals,
resolution/format/size distributions, storage, duplicate groups and metadata
exports include these duplicate paths; imported-image and annotation counts
remain based on `images` only.

## Backfill and reports

Statistics → **Analyze Existing Images** processes pending records in batches
and can be stopped between batches; successfully processed rows remain saved.
**Retry Failed** retries extraction errors. **Verify All Sources** rechecks
every source file, including existing analyzed images. All operations preserve
annotations and source bytes.

CSV contains one row per imported image or duplicate source file and uses
workspace-relative paths. `record_type` and `duplicate_of_filename` identify
inventory-only duplicate rows. JSON includes
dataset ID/version, generation timestamp, metadata schema version, summary,
resolution/aspect/format/size distributions, validation findings, and image
records. The Markdown resolution report contains the same reproducibility
identifiers and distributions. SHA-256 is explicitly defined as the digest of
the original file bytes. Absolute source paths are not included in these
exports.

Migrations `0003` and `0004` are additive; old image rows are not rewritten or
deleted. Existing rows start as `PENDING`, so the in-app backfill can inspect
files and populate new fields without duplicating image rows. Repeated source
scans upsert the separate duplicate inventory by workspace and relative source
path.
