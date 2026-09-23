import path from 'node:path';
import sharp from 'sharp';
import { SUPPORTED_EXTENSIONS, type SupportedExtension } from '@/types/domain';

/**
 * Image metadata extraction (dimensions + normalized extension) via Sharp.
 * Source images are opened read-only; we never write back.
 */

export interface ImageMetadata {
  width: number;
  height: number;
  /** Lower-case extension without a leading dot, normalized (jpeg→jpg kept as-is). */
  extension: SupportedExtension;
}

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
  if (!meta.width || !meta.height) {
    throw new Error(`Could not read image dimensions: ${filePath}`);
  }
  return { width: meta.width, height: meta.height, extension: ext };
}
