import path from 'node:path';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import { SUPPORTED_EXTENSIONS, type SupportedExtension } from '@/types/domain';
import { sha256OfFile } from './checksum';

/**
 * Image metadata extraction (dimensions + normalized extension) via Sharp.
 * Source images are opened read-only; we never write back.
 */

export interface ImageMetadata {
  width: number;
  height: number;
  /** Lower-case extension without a leading dot, normalized (jpeg→jpg kept as-is). */
  extension: SupportedExtension;
  /** Container format detected from image bytes by Sharp. */
  detectedFormat: string;
  mimeType: string;
  colorMode: string | null;
}

export interface AnalyzedSourceImage {
  metadata: ImageMetadata;
  checksum: string;
  fileSize: number;
  modifiedAt: number;
}

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heif: 'image/heif',
  heic: 'image/heic',
};

/** Normalize a file extension to one of the supported keys, or null. */
export function normalizeExtension(filename: string): SupportedExtension | null {
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as SupportedExtension)
    : null;
}

export function isSupportedImage(filename: string): boolean {
  return normalizeExtension(filename) !== null;
}

/**
 * Read width/height for a source image. Throws if the file is unreadable or has
 * no intrinsic dimensions (the scanner records such files as ERROR entries).
 */
export async function readImageMetadata(filePath: string): Promise<ImageMetadata> {
  const ext = normalizeExtension(filePath);
  if (!ext) {
    throw new Error(`Unsupported image extension: ${filePath}`);
  }
  const meta = await sharp(filePath, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height || !meta.format) {
    throw new Error(`Could not read image dimensions: ${filePath}`);
  }
  const detectedFormat = meta.format.toLowerCase();
  const mimeType = MIME_BY_FORMAT[detectedFormat];
  if (!mimeType) throw new Error(`Unsupported detected image format: ${detectedFormat}`);
  const colorMode = meta.space
    ? `${meta.space}, ${meta.channels ?? 'unknown'} channels`
    : null;
  return { width: meta.width, height: meta.height, extension: ext, detectedFormat, mimeType, colorMode };
}

/** Inspect original bytes without modifying the source. An optional expected hash detects replacement since import. */
export async function analyzeSourceImage(filePath: string, expectedChecksum?: string): Promise<AnalyzedSourceImage> {
  const [fileInfo, metadata, checksum] = await Promise.all([
    stat(filePath),
    readImageMetadata(filePath),
    sha256OfFile(filePath),
  ]);
  if (expectedChecksum && /^[a-f0-9]{64}$/i.test(expectedChecksum) && checksum !== expectedChecksum)
    throw new Error('Source checksum mismatch: source bytes changed after import.');
  return { metadata, checksum, fileSize: fileInfo.size, modifiedAt: Math.round(fileInfo.mtimeMs) };
}
