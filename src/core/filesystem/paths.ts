import path from 'node:path';

/**
 * Path safety + output-tree layout.
 *
 * Rules (see .claude/CLAUDE.md §10):
 *  - Source images are read-only; we never write into or near them.
 *  - All writes are confined to the workspace output directory.
 *  - Every path is validated against traversal; source filenames are never
 *    trusted as identifiers — output names come from datasetIndex.
 */

/** Output-tree top-level directory name, created under the chosen output root. */
export const OUTPUT_ROOT_DIRNAME = 'DeshiA_Output';

export type Segment = 'RAW' | 'ANNOTATED' | 'VISUALIZATIONS';

/**
 * Resolve the DeshiA_Output root inside the user-chosen output directory.
 * `outputDir` is expected to be an absolute path.
 */
export function outputRoot(outputDir: string): string {
  return path.join(outputDir, OUTPUT_ROOT_DIRNAME);
}

/**
 * Directory for RAW (clean, original-copy) images: RAW/<class>/<view>/.
 */
export function rawDir(outputDir: string, classKey: string, viewKey: string): string {
  return path.join(outputRoot(outputDir), 'RAW', safeSegment(classKey), safeSegment(viewKey));
}

/**
 * The ANNOTATED dataset root: DeshiA_Output/ANNOTATED. Dataset-level label maps
 * (e.g. the YOLO `classes.txt`, which must be consistent across every class/view
 * folder) live directly here rather than under a single (class, view) leaf.
 */
export function annotatedRoot(outputDir: string): string {
  return path.join(outputRoot(outputDir), 'ANNOTATED');
}

/**
 * Directories for the ANNOTATED dataset:
 * ANNOTATED/<class>/<view>/{images,annotations}/.
 */
export function annotatedImageDir(outputDir: string, classKey: string, viewKey: string): string {
  return path.join(
    outputRoot(outputDir),
    'ANNOTATED',
    safeSegment(classKey),
    safeSegment(viewKey),
    'images',
  );
}

export function annotatedAnnotationDir(
  outputDir: string,
  classKey: string,
  viewKey: string,
): string {
  return path.join(
    outputRoot(outputDir),
    'ANNOTATED',
    safeSegment(classKey),
    safeSegment(viewKey),
    'annotations',
  );
}

/** Directory for box-rendered preview images (never part of the dataset). */
export function visualizationDir(outputDir: string, classKey: string, viewKey: string): string {
  return path.join(
    outputRoot(outputDir),
    'VISUALIZATIONS',
    safeSegment(classKey),
    safeSegment(viewKey),
  );
}

/** All directories that must exist for one (class, view) export target. */
export function exportTargetDirs(
  outputDir: string,
  classKey: string,
  viewKey: string,
): { raw: string; annotatedImages: string; annotatedAnnotations: string; visualizations: string } {
  return {
    raw: rawDir(outputDir, classKey, viewKey),
    annotatedImages: annotatedImageDir(outputDir, classKey, viewKey),
    annotatedAnnotations: annotatedAnnotationDir(outputDir, classKey, viewKey),
    visualizations: visualizationDir(outputDir, classKey, viewKey),
  };
}

/**
 * Sanitize a single path segment (class/view key). Rejects anything that could
 * escape the tree; keeps only lower-case alnum, dash, underscore.
 */
export function safeSegment(input: string): string {
  const cleaned = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error(`Unsafe path segment: "${input}"`);
  }
  return cleaned;
}

/**
 * Assert that `child` resolves to a location inside `parent`. Throws on any
 * traversal attempt. Both arguments should be absolute.
 */
export function assertInside(parent: string, child: string): void {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  const rel = path.relative(p, c);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    if (c === p) return;
    throw new Error(`Path escapes workspace output: "${child}"`);
  }
}

/** True when `child` is strictly inside `parent` (no throw). */
export function isInside(parent: string, child: string): boolean {
  try {
    assertInside(parent, child);
    return true;
  } catch {
    return false;
  }
}
