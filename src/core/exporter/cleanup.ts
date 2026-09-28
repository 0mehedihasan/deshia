import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { isInside, outputRoot } from '@/core/filesystem/paths';

/**
 * Orphaned-output cleanup.
 *
 * Output filenames are derived from the persistent `images.datasetIndex`, so
 * re-submitting the SAME image with the SAME class/view overwrites its files in
 * place (no duplicates). The one case that leaves stale files behind is a
 * re-submission under a DIFFERENT class or view: the new copies are written to a
 * new `<class>/<view>` folder while the previous copies linger in the old one.
 *
 * These helpers compute which of a previous export's paths are no longer part of
 * the new export and remove them, so the published dataset never accumulates
 * mismatched duplicates for a single source image. Dataset-level files that are
 * shared across every (class, view) — e.g. the YOLO `classes.txt` at the
 * ANNOTATED root — appear in both the old and new path sets, so they are never
 * treated as orphans.
 */

/**
 * Relative paths present in the previous export but not the new one. Pure and
 * order-preserving; de-duplicates so a path is never returned twice.
 */
export function computeOrphanPaths(oldRel: string[], newRel: string[]): string[] {
  const keep = new Set(newRel);
  const seen = new Set<string>();
  const orphans: string[] = [];
  for (const rel of oldRel) {
    if (keep.has(rel) || seen.has(rel)) continue;
    seen.add(rel);
    orphans.push(rel);
  }
  return orphans;
}

/**
 * Best-effort removal of orphaned relative paths under `outputDir`. Every target
 * is confined to the managed `DeshiA_Output` tree (anything resolving outside is
 * skipped, never deleted) and a failed/missing unlink is ignored: this runs
 * AFTER a submission has already committed, so it must never throw or turn a
 * good submit into an error. Returns the relative paths actually removed.
 */
export async function removeOrphanOutputs(
  outputDir: string,
  orphanRel: string[],
): Promise<string[]> {
  const root = outputRoot(outputDir);
  const removed: string[] = [];
  for (const rel of orphanRel) {
    const abs = path.join(outputDir, rel);
    // Never delete anything outside the workspace's managed output tree.
    if (!isInside(root, abs)) continue;
    try {
      await unlink(abs);
      removed.push(rel);
    } catch {
      // Missing file → already clean; any other error must not fail cleanup.
    }
  }
  return removed;
}
