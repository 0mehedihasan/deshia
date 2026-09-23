import { desc, eq } from 'drizzle-orm';
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
    .set({ status: 'SUCCEEDED', outputs: JSON.stringify(outputs), error: null, updatedAt: Date.now() })
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
