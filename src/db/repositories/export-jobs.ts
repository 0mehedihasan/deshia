import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { exportJobs, type ExportJobRow } from '@/db/schema';
import type { ExportFormat } from '@/types/domain';
import { newId } from './ids';

/** Export-job repository: one row per attempted per-image export. */

export function createExportJob(input: {
  workspaceId: string;
  imageId: string;
  format?: ExportFormat;
}): ExportJobRow {
  return db
    .insert(exportJobs)
    .values({
      id: newId('exp'),
      workspaceId: input.workspaceId,
      imageId: input.imageId,
      format: input.format ?? 'PASCAL_VOC',
      status: 'PENDING',
    })
    .returning()
    .get();
}

export function markExportSucceeded(id: string, outputs: string[]): void {
  db.update(exportJobs)
    .set({
      status: 'SUCCEEDED',
      outputs: JSON.stringify(outputs),
      error: null,
      updatedAt: Date.now(),
    })
    .where(eq(exportJobs.id, id))
    .run();
}

export function markExportFailed(id: string, error: string): void {
  db.update(exportJobs)
    .set({ status: 'FAILED', error, updatedAt: Date.now() })
    .where(eq(exportJobs.id, id))
    .run();
}

export function listExportJobs(workspaceId: string): ExportJobRow[] {
  return db
    .select()
    .from(exportJobs)
    .where(eq(exportJobs.workspaceId, workspaceId))
    .orderBy(desc(exportJobs.createdAt))
    .all();
}

/**
 * The most recent SUCCEEDED export for an image, with its written relative
 * paths already parsed. Used to detect orphaned outputs when an image is
 * re-submitted under a different class/view (its files then live in a new
 * folder, leaving the previous copies stale). Returns null if the image has
 * never been exported successfully.
 */
export function latestSucceededExportForImage(
  imageId: string,
): { id: string; outputs: string[] } | null {
  const row = db
    .select()
    .from(exportJobs)
    .where(and(eq(exportJobs.imageId, imageId), eq(exportJobs.status, 'SUCCEEDED')))
    .orderBy(desc(exportJobs.createdAt))
    .get();
  if (!row) return null;
  let outputs: string[] = [];
  try {
    const parsed = JSON.parse(row.outputs) as unknown;
    if (Array.isArray(parsed)) {
      outputs = parsed.filter((p): p is string => typeof p === 'string');
    }
  } catch {
    outputs = [];
  }
  return { id: row.id, outputs };
}
