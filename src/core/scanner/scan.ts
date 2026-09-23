import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { ScanEntryKind } from '@/types/domain';
import { sha256OfFile } from './checksum';
import { isSupportedImage, normalizeExtension, readImageMetadata } from './metadata';
import { collectFiles, type WalkOptions } from './walk';

/**
 * Recursive source-directory scanner.
 *
 * Walks a read-only source tree, classifies each file, computes a checksum and
 * dimensions for supported images, and flags content duplicates (same checksum
 * seen earlier in the walk). Never writes to the source tree.
 */

export interface ScanEntry {
  kind: ScanEntryKind;
  absolutePath: string;
  filename: string;
  extension: string | null;
  fileSize: number;
  modifiedAt: number;
  width?: number;
  height?: number;
  checksum?: string;
  /** Absolute path of the first file that carried this checksum. */
  duplicateOf?: string;
  error?: string;
}

export interface ScanResult {
  entries: ScanEntry[];
  supported: number;
  duplicates: number;
  unsupported: number;
  errors: number;
}

export type ScanOptions = WalkOptions;

/**
 * Scan a source directory into classified entries with checksums, dimensions,
 * and duplicate flags. Ordering is deterministic (sorted paths).
 */
export async function scanDirectory(root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const files = await collectFiles(root, options);
  const entries: ScanEntry[] = [];
  const seenChecksums = new Map<string, string>();
  let supported = 0;
  let duplicates = 0;
  let unsupported = 0;
  let errors = 0;

  for (const absolutePath of files) {
    const filename = path.basename(absolutePath);
    const extension = normalizeExtension(absolutePath);

    if (!isSupportedImage(absolutePath)) {
      unsupported += 1;
      entries.push({
        kind: 'UNSUPPORTED',
        absolutePath,
        filename,
        extension,
        fileSize: 0,
        modifiedAt: 0,
      });
      continue;
    }

    try {
      const info = await stat(absolutePath);
      const checksum = await sha256OfFile(absolutePath);
      const meta = await readImageMetadata(absolutePath);
      const priorPath = seenChecksums.get(checksum);
      const base: ScanEntry = {
        kind: priorPath ? 'DUPLICATE' : 'SUPPORTED',
        absolutePath,
        filename,
        extension,
        fileSize: info.size,
        modifiedAt: Math.round(info.mtimeMs),
        width: meta.width,
        height: meta.height,
        checksum,
      };
      if (priorPath) {
        base.duplicateOf = priorPath;
        duplicates += 1;
      } else {
        seenChecksums.set(checksum, absolutePath);
        supported += 1;
      }
      entries.push(base);
    } catch (err) {
      errors += 1;
      entries.push({
        kind: 'ERROR',
        absolutePath,
        filename,
        extension,
        fileSize: 0,
        modifiedAt: 0,
        error: (err as Error).message,
      });
    }
  }

  return { entries, supported, duplicates, unsupported, errors };
}
