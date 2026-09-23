import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { exportTargetDirs, outputRoot } from '@/core/filesystem/paths';
import type { AnnotationSchema } from '@/schemas/types';

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

/**
 * Create the full DeshiA_Output tree for a workspace up front, so the target
 * layout is visible in the chosen output folder as soon as the workspace is
 * created — not only after the first export. Idempotent (recursive mkdir).
 *
 * Builds the top-level sections (RAW / ANNOTATED / VISUALIZATIONS) plus every
 * (class, view) leaf declared by the schema. Nothing is ever written near the
 * read-only source tree (CLAUDE.md §10).
 */
export async function ensureWorkspaceOutputScaffold(
  outputDir: string,
  schema: AnnotationSchema,
): Promise<{ root: string; created: string[] }> {
  const root = outputRoot(outputDir);
  const dirs = new Set<string>([
    path.join(root, 'RAW'),
    path.join(root, 'ANNOTATED'),
    path.join(root, 'VISUALIZATIONS'),
  ]);

  for (const cls of schema.classes) {
    for (const view of cls.views) {
      const target = exportTargetDirs(outputDir, cls.key, view.key);
      dirs.add(target.raw);
      dirs.add(target.annotatedImages);
      dirs.add(target.annotatedAnnotations);
      dirs.add(target.visualizations);
    }
  }

  const created = [...dirs];
  await Promise.all(created.map((dir) => mkdir(dir, { recursive: true })));
  return { root, created };
}
