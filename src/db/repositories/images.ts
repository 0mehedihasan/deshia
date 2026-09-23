import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { images, workspaces, type ImageRow, type NewImageRow } from '@/db/schema';
import type { ImageStatus } from '@/types/domain';
import { newId } from './ids';

/**
 * Image repository. All image reads/writes go through here — never raw SQL in
 * features/components (see .claude/CLAUDE.md §6).
 */

export interface InsertImageInput {
  workspaceId: string;
  originalFilename: string;
  originalPath: string;
  extension: string;
  fileSize: number;
  width: number;
  height: number;
  checksum: string;
  modifiedAt: number;
  isDuplicate?: boolean;
  duplicateOfId?: string | null;
}

/** Next monotonic dataset index for a workspace (max+1), never a file count. */
export function nextDatasetIndex(workspaceId: string): number {
  const row = db
    .select({ max: sql<number | null>`max(${images.datasetIndex})` })
    .from(images)
    .where(eq(images.workspaceId, workspaceId))
    .get();
  return (row?.max ?? -1) + 1;
}

/**
 * Bulk-insert scanned images in a single transaction, assigning stable
 * datasetIndex values. Returns the inserted rows in insertion order.
 */
export function insertImages(inputs: InsertImageInput[]): ImageRow[] {
  if (inputs.length === 0) return [];
  return db.transaction((tx) => {
    const workspaceId = inputs[0]!.workspaceId;
    const startRow = tx
      .select({ max: sql<number | null>`max(${images.datasetIndex})` })
      .from(images)
      .where(eq(images.workspaceId, workspaceId))
      .get();
    let index = (startRow?.max ?? -1) + 1;

    const inserted: ImageRow[] = [];
    for (const input of inputs) {
      const row: NewImageRow = {
        id: newId('img'),
        workspaceId: input.workspaceId,
        datasetIndex: index,
        originalFilename: input.originalFilename,
        originalPath: input.originalPath,
        extension: input.extension,
        fileSize: input.fileSize,
        width: input.width,
        height: input.height,
        checksum: input.checksum,
        modifiedAt: input.modifiedAt,
        status: 'PENDING',
        isDuplicate: input.isDuplicate ?? false,
        duplicateOfId: input.duplicateOfId ?? null,
      };
      const result = tx.insert(images).values(row).returning().get();
      inserted.push(result);
      index += 1;
    }
    return inserted;
  });
}

export function getImage(id: string): ImageRow | undefined {
  return db.select().from(images).where(eq(images.id, id)).get();
}

export function listImages(workspaceId: string): ImageRow[] {
  return db
    .select()
    .from(images)
    .where(eq(images.workspaceId, workspaceId))
    .orderBy(asc(images.datasetIndex))
    .all();
}

/** First image with the given status, ordered by datasetIndex. */
export function firstImageWithStatus(
  workspaceId: string,
  status: ImageStatus,
): ImageRow | undefined {
  return db
    .select()
    .from(images)
    .where(and(eq(images.workspaceId, workspaceId), eq(images.status, status)))
    .orderBy(asc(images.datasetIndex))
    .limit(1)
    .get();
}

export function setImageStatus(id: string, status: ImageStatus): void {
  db.update(images)
    .set({ status, updatedAt: Date.now() })
    .where(eq(images.id, id))
    .run();
}

export interface StatusCounts {
  total: number;
  pending: number;
  inProgress: number;
  annotated: number;
  skipped: number;
  error: number;
}

export function statusCounts(workspaceId: string): StatusCounts {
  const rows = db
    .select({ status: images.status, count: sql<number>`count(*)` })
    .from(images)
    .where(eq(images.workspaceId, workspaceId))
    .groupBy(images.status)
    .all();
  const counts: StatusCounts = {
    total: 0,
    pending: 0,
    inProgress: 0,
    annotated: 0,
    skipped: 0,
    error: 0,
  };
  for (const r of rows) {
    counts.total += r.count;
    if (r.status === 'PENDING') counts.pending = r.count;
    else if (r.status === 'IN_PROGRESS') counts.inProgress = r.count;
    else if (r.status === 'ANNOTATED') counts.annotated = r.count;
    else if (r.status === 'SKIPPED') counts.skipped = r.count;
    else if (r.status === 'ERROR') counts.error = r.count;
  }
  return counts;
}

export function workspaceExists(workspaceId: string): boolean {
  return Boolean(db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).get());
}
