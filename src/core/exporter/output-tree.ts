import { mkdir } from 'node:fs/promises';
import { exportTargetDirs } from '@/core/filesystem/paths';

/**
 * Ensure the DeshiA_Output directory tree exists for a (class, view) export
 * target. All directories live under the workspace output root; nothing is ever
 * created near the read-only source tree.
 */
export async function ensureExportTarget(
  outputDir: string,
  classKey: string,
  viewKey: string,
): Promise<{
  raw: string;
  annotatedImages: string;
  annotatedAnnotations: string;
  visualizations: string;
}> {
  const dirs = exportTargetDirs(outputDir, classKey, viewKey);
  await Promise.all([
    mkdir(dirs.raw, { recursive: true }),
    mkdir(dirs.annotatedImages, { recursive: true }),
    mkdir(dirs.annotatedAnnotations, { recursive: true }),
    mkdir(dirs.visualizations, { recursive: true }),
  ]);
  return dirs;
}
