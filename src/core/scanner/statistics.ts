import path from 'node:path';
import packageJson from '../../../package.json';

export type MetadataStatus = 'PENDING' | 'ANALYZED' | 'FAILED';

export interface ImageMetadataRecord {
  id: string;
  filename: string;
  originalPath: string;
  extension: string;
  detectedFormat: string | null;
  mimeType: string | null;
  colorMode: string | null;
  width: number;
  height: number;
  fileSize: number;
  checksum: string;
  metadataStatus: MetadataStatus;
  metadataError: string | null;
  datasetIndex: number;
  createdAt: number;
}

export interface ImageMetadataExportRecord {
  image_id: string;
  record_type: 'IMAGE' | 'DUPLICATE_SOURCE_FILE';
  duplicate_of_filename: string | null;
  filename: string;
  relative_path: string;
  format: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  resolution: string | null;
  pixel_count: number | null;
  aspect_ratio: string | null;
  file_size_bytes: number;
  sha256: string | null;
  color_mode: string | null;
  metadata_status: MetadataStatus;
  metadata_error: string | null;
  import_timestamp: string;
}

export interface ImageMetadataStatistics {
  totalImages: number;
  importedImageRecords: number;
  duplicateFilesDetected: number;
  analyzedImages: number;
  failedImages: number;
  pendingImages: number;
  uniqueResolutions: number;
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  minPixelCount: number | null;
  maxPixelCount: number | null;
  averageWidth: number | null;
  averageHeight: number | null;
  mostCommonResolution: string | null;
  totalStorageBytes: number;
  averageFileSizeBytes: number;
  medianFileSizeBytes: number;
  minFileSizeBytes: number | null;
  maxFileSizeBytes: number | null;
  resolutions: Array<{
    resolution: string;
    width: number;
    height: number;
    images: number;
    percent: number;
  }>;
  aspectRatios: Array<{ ratio: string; decimal: number; images: number; percent: number }>;
  formats: Array<{ format: string; images: number; percent: number }>;
  fileSizeDistribution: Array<{
    range: string;
    minBytes: number;
    maxBytes: number | null;
    images: number;
    percent: number;
  }>;
  duplicateGroups: Array<{ sha256: string; images: number; filenames: string[] }>;
  validationIssues: Array<{
    severity: 'WARNING' | 'ERROR';
    imageId: string;
    filename: string;
    message: string;
  }>;
  images: ImageMetadataExportRecord[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x || 1;
}

export function resolutionString(width: number, height: number): string {
  return `${width} × ${height}`;
}

export function aspectRatio(width: number, height: number): { label: string; decimal: number } {
  const divisor = gcd(width, height);
  return { label: `${width / divisor}:${height / divisor}`, decimal: width / height };
}

function percent(count: number, total: number): number {
  return total ? (count / total) * 100 : 0;
}

export interface SourceDuplicateMetadataRecord
  extends Omit<
    ImageMetadataRecord,
    'metadataStatus' | 'metadataError' | 'datasetIndex' | 'filename' | 'createdAt'
  > {
  filename: string;
  createdAt: number;
  modifiedAt: number;
  duplicateOfImageId: string | null;
}

function toExportRecord(
  image: ImageMetadataRecord,
  sourceRoot: string,
  duplicateOfFilename: string | null = null,
): ImageMetadataExportRecord {
  const validDimensions =
    image.width > 0 && image.height > 0 && image.metadataStatus === 'ANALYZED';
  const ratio = validDimensions ? aspectRatio(image.width, image.height).label : null;
  return {
    image_id: image.id,
    record_type: duplicateOfFilename ? 'DUPLICATE_SOURCE_FILE' : 'IMAGE',
    duplicate_of_filename: duplicateOfFilename,
    filename: image.filename,
    relative_path: path.relative(sourceRoot, image.originalPath).split(path.sep).join('/'),
    format: image.detectedFormat,
    mime_type: image.mimeType,
    width: validDimensions ? image.width : null,
    height: validDimensions ? image.height : null,
    resolution: validDimensions ? resolutionString(image.width, image.height) : null,
    pixel_count: validDimensions ? image.width * image.height : null,
    aspect_ratio: ratio,
    file_size_bytes: image.fileSize,
    sha256: /^[a-f0-9]{64}$/i.test(image.checksum) ? image.checksum : null,
    color_mode: image.colorMode,
    metadata_status: image.metadataStatus,
    metadata_error: image.metadataError?.split(image.originalPath).join(image.filename) ?? null,
    import_timestamp: new Date(image.createdAt).toISOString(),
  };
}

export function calculateImageMetadataStatistics(
  rows: ImageMetadataRecord[],
  sourceRoot: string,
  duplicateRows: SourceDuplicateMetadataRecord[] = [],
): ImageMetadataStatistics {
  const sourceFiles: ImageMetadataRecord[] = [
    ...rows,
    ...duplicateRows.map((row) => ({
      ...row,
      metadataStatus: 'ANALYZED' as const,
      metadataError: null,
      datasetIndex: -1,
    })),
  ];
  const analyzed = sourceFiles.filter((row) => row.width > 0 && row.height > 0);
  const widthValues = analyzed.map((row) => row.width);
  const heightValues = analyzed.map((row) => row.height);
  const pixels = analyzed.map((row) => row.width * row.height);
  const fileSizes = sourceFiles
    .map((row) => row.fileSize)
    .filter((size) => Number.isFinite(size) && size >= 0);
  const resolutionCounts = new Map<string, { width: number; height: number; images: number }>();
  const ratioCounts = new Map<string, { decimal: number; images: number }>();
  const formatCounts = new Map<string, number>();
  const sizeBins = [
    { range: '< 1 MB', minBytes: 0, maxBytes: 1024 * 1024, images: 0 },
    { range: '1–5 MB', minBytes: 1024 * 1024, maxBytes: 5 * 1024 * 1024, images: 0 },
    { range: '5–10 MB', minBytes: 5 * 1024 * 1024, maxBytes: 10 * 1024 * 1024, images: 0 },
    { range: '10–25 MB', minBytes: 10 * 1024 * 1024, maxBytes: 25 * 1024 * 1024, images: 0 },
    { range: '≥ 25 MB', minBytes: 25 * 1024 * 1024, maxBytes: null, images: 0 },
  ];
  const checksumGroups = new Map<string, ImageMetadataRecord[]>();
  const validationIssues: ImageMetadataStatistics['validationIssues'] = [];
  for (const image of sourceFiles) {
    if (image.metadataStatus === 'FAILED')
      validationIssues.push({
        severity: 'ERROR',
        imageId: image.id,
        filename: image.filename,
        message: image.metadataError ?? 'Metadata extraction failed.',
      });
    if (image.metadataStatus === 'ANALYZED' && (image.width <= 0 || image.height <= 0))
      validationIssues.push({
        severity: 'ERROR',
        imageId: image.id,
        filename: image.filename,
        message: 'Image dimensions are invalid.',
      });
    if (
      image.metadataStatus === 'ANALYZED' &&
      image.mimeType &&
      !extensionMatchesMime(image.extension, image.mimeType)
    )
      validationIssues.push({
        severity: 'WARNING',
        imageId: image.id,
        filename: image.filename,
        message: `Extension .${image.extension} does not match detected MIME type ${image.mimeType}.`,
      });
    if (image.metadataStatus === 'ANALYZED') {
      const key = `${image.width}x${image.height}`;
      const resolution = resolutionCounts.get(key) ?? {
        width: image.width,
        height: image.height,
        images: 0,
      };
      resolution.images += 1;
      resolutionCounts.set(key, resolution);
      const ratio = aspectRatio(image.width, image.height);
      const ratioRecord = ratioCounts.get(ratio.label) ?? { decimal: ratio.decimal, images: 0 };
      ratioRecord.images += 1;
      ratioCounts.set(ratio.label, ratioRecord);
      const format = image.detectedFormat ?? 'unknown';
      formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
    }
    if (/^[a-f0-9]{64}$/i.test(image.checksum)) {
      const group = checksumGroups.get(image.checksum) ?? [];
      group.push(image);
      checksumGroups.set(image.checksum, group);
    }
    const sizeBin = sizeBins.find(
      (bin) =>
        image.fileSize >= bin.minBytes && (bin.maxBytes === null || image.fileSize < bin.maxBytes),
    );
    if (sizeBin) sizeBin.images += 1;
  }
  const resolutions = [...resolutionCounts]
    .map(([key, value]) => ({
      resolution: `${value.width} × ${value.height}`,
      width: value.width,
      height: value.height,
      images: value.images,
      percent: percent(value.images, analyzed.length),
      key,
    }))
    .sort((a, b) => b.images - a.images || a.width - b.width || a.height - b.height)
    .map(({ key: _key, ...row }) => row);
  const aspectRatios = [...ratioCounts]
    .map(([ratio, value]) => ({ ratio, ...value, percent: percent(value.images, analyzed.length) }))
    .sort((a, b) => b.images - a.images || a.decimal - b.decimal);
  const formats = [...formatCounts]
    .map(([format, images]) => ({ format, images, percent: percent(images, analyzed.length) }))
    .sort((a, b) => b.images - a.images || a.format.localeCompare(b.format));
  const duplicateGroups = [...checksumGroups]
    .filter(([, group]) => group.length > 1)
    .map(([sha256, group]) => ({
      sha256,
      images: group.length,
      filenames: group.map((image) => image.filename).sort(),
    }));
  for (const group of duplicateGroups)
    for (const image of checksumGroups.get(group.sha256) ?? [])
      validationIssues.push({
        severity: 'WARNING',
        imageId: image.id,
        filename: image.filename,
        message: `Duplicate file content: SHA-256 appears in ${group.images} images.`,
      });
  return {
    totalImages: sourceFiles.length,
    importedImageRecords: rows.length,
    duplicateFilesDetected: duplicateRows.length,
    analyzedImages: analyzed.length,
    failedImages: rows.filter((row) => row.metadataStatus === 'FAILED').length,
    pendingImages: rows.filter((row) => row.metadataStatus === 'PENDING').length,
    uniqueResolutions: resolutionCounts.size,
    minWidth: widthValues.length
      ? widthValues.reduce((min, value) => Math.min(min, value), Infinity)
      : null,
    maxWidth: widthValues.length
      ? widthValues.reduce((max, value) => Math.max(max, value), -Infinity)
      : null,
    minHeight: heightValues.length
      ? heightValues.reduce((min, value) => Math.min(min, value), Infinity)
      : null,
    maxHeight: heightValues.length
      ? heightValues.reduce((max, value) => Math.max(max, value), -Infinity)
      : null,
    minPixelCount: pixels.length
      ? pixels.reduce((min, value) => Math.min(min, value), Infinity)
      : null,
    maxPixelCount: pixels.length
      ? pixels.reduce((max, value) => Math.max(max, value), -Infinity)
      : null,
    averageWidth: widthValues.length
      ? widthValues.reduce((sum, value) => sum + value, 0) / widthValues.length
      : null,
    averageHeight: heightValues.length
      ? heightValues.reduce((sum, value) => sum + value, 0) / heightValues.length
      : null,
    mostCommonResolution: resolutions[0]?.resolution ?? null,
    totalStorageBytes: fileSizes.reduce((sum, value) => sum + value, 0),
    averageFileSizeBytes: fileSizes.length
      ? fileSizes.reduce((sum, value) => sum + value, 0) / fileSizes.length
      : 0,
    medianFileSizeBytes: median(fileSizes),
    minFileSizeBytes: fileSizes.length
      ? fileSizes.reduce((min, value) => Math.min(min, value), Infinity)
      : null,
    maxFileSizeBytes: fileSizes.length
      ? fileSizes.reduce((max, value) => Math.max(max, value), -Infinity)
      : null,
    resolutions,
    aspectRatios,
    formats,
    fileSizeDistribution: sizeBins.map(({ range, minBytes, maxBytes, images }) => ({
      range,
      minBytes,
      maxBytes,
      images,
      percent: percent(images, sourceFiles.length),
    })),
    duplicateGroups,
    validationIssues,
    images: [
      ...rows.map((image) => toExportRecord(image, sourceRoot)),
      ...duplicateRows.map((image) => {
        const canonical = rows.find((row) => row.id === image.duplicateOfImageId);
        return toExportRecord(
          { ...image, metadataStatus: 'ANALYZED', metadataError: null, datasetIndex: -1 },
          sourceRoot,
          canonical?.filename ?? null,
        );
      }),
    ],
  };
}

function extensionMatchesMime(extension: string, mimeType: string): boolean {
  const ext = extension.toLowerCase().replace(/^\./, '');
  const normalizedMime = mimeType.toLowerCase();
  if ((ext === 'jpg' || ext === 'jpeg') && normalizedMime === 'image/jpeg') return true;
  if (
    (ext === 'heic' || ext === 'heif') &&
    (normalizedMime === 'image/heic' || normalizedMime === 'image/heif')
  )
    return true;
  return normalizedMime === `image/${ext}`;
}

export function generateImageMetadataJson(
  dataset: { id: string; name: string; version: number },
  generatedAt: string,
  statistics: ImageMetadataStatistics,
): string {
  const { images, ...summary } = statistics;
  return (
    JSON.stringify(
      {
        dataset,
        generatedAt,
        metadataSchemaVersion: 1,
        deshiaVersion: packageJson.version,
        checksumMethod: 'SHA-256 over original file bytes',
        statistics: summary,
        images,
      },
      null,
      2,
    ) + '\n'
  );
}

const csv = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function generateImageMetadataCsv(images: ImageMetadataExportRecord[]): string {
  const headers: Array<keyof ImageMetadataExportRecord> = [
    'image_id',
    'record_type',
    'duplicate_of_filename',
    'filename',
    'relative_path',
    'format',
    'mime_type',
    'width',
    'height',
    'resolution',
    'pixel_count',
    'aspect_ratio',
    'file_size_bytes',
    'sha256',
    'color_mode',
    'metadata_status',
    'metadata_error',
    'import_timestamp',
  ];
  return (
    [
      headers.map(csv).join(','),
      ...images.map((image) => headers.map((header) => csv(image[header])).join(',')),
    ].join('\n') + '\n'
  );
}

export function generateImageMetadataMarkdown(
  dataset: { id: string; name: string; version: number },
  generatedAt: string,
  statistics: ImageMetadataStatistics,
): string {
  const n = (value: number | null) =>
    value === null
      ? 'Not available'
      : new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
  return `# Dataset Image Resolution Report\n\nDataset: ${dataset.name}\n\nDataset ID: ${dataset.id}\n\nDataset version: ${dataset.version}\n\nGenerated: ${generatedAt}\n\nMetadata schema version: 1\n\nDeshiA version: ${packageJson.version}\n\nChecksum: SHA-256 over original file bytes.\n\n## Overview\n\n| Measure | Value |\n|---|---:|\n| Total images | ${statistics.totalImages} |\n| Successfully analyzed | ${statistics.analyzedImages} |\n| Failed metadata extractions | ${statistics.failedImages} |\n| Pending metadata | ${statistics.pendingImages} |\n| Unique exact resolutions | ${statistics.uniqueResolutions} |\n| Most common resolution | ${statistics.mostCommonResolution ?? 'Not available'} |\n| Total storage | ${statistics.totalStorageBytes} bytes |\n| Average file size | ${n(statistics.averageFileSizeBytes)} bytes |\n| Median file size | ${n(statistics.medianFileSizeBytes)} bytes |\n| Minimum / maximum file size | ${n(statistics.minFileSizeBytes)} / ${n(statistics.maxFileSizeBytes)} bytes |\n\n## Resolution Distribution\n\n| Resolution | Width | Height | Images | Percentage |\n|---|---:|---:|---:|---:|\n${statistics.resolutions.map((row) => `| ${row.resolution} | ${row.width} | ${row.height} | ${row.images} | ${n(row.percent)}% |`).join('\n')}\n\n## Aspect Ratio Distribution\n\n| Aspect ratio | Images | Percentage |\n|---|---:|---:|\n${statistics.aspectRatios.map((row) => `| ${row.ratio} | ${row.images} | ${n(row.percent)}% |`).join('\n')}\n\n## File Format Distribution\n\n| Detected format | Images | Percentage |\n|---|---:|---:|\n${statistics.formats.map((row) => `| ${row.format} | ${row.images} | ${n(row.percent)}% |`).join('\n')}\n\n## File Size Distribution\n\n| Size | Images | Percentage |\n|---|---:|---:|\n${statistics.fileSizeDistribution.map((row) => `| ${row.range} | ${row.images} | ${n(row.percent)}% |`).join('\n')}\n`;
}
