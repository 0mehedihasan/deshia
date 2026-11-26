import { and, asc, desc, eq, gt, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  images,
  sourceImageDuplicates,
  workspaces,
  type ImageRow,
  type NewImageRow,
} from '@/db/schema';
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
  detectedFormat?: string | null;
  mimeType?: string | null;
  colorMode?: string | null;
  metadataStatus?: 'PENDING' | 'ANALYZED' | 'FAILED';
  metadataError?: string | null;
  status?: ImageStatus;
  isDuplicate?: boolean;
  duplicateOfId?: string | null;
  mediaKind?: 'IMAGE' | 'VIDEO';
  durationMs?: number | null;
  fps?: number | null;
  frameCount?: number | null;
}

export interface SourceImageDuplicateInput {
  workspaceId: string;
  duplicateOfImageId: string | null;
  originalFilename: string;
  originalPath: string;
  extension: string;
  detectedFormat: string;
  mimeType: string;
  colorMode: string | null;
  width: number;
  height: number;
  fileSize: number;
  checksum: string;
  modifiedAt: number;
}

/** Idempotently refresh source duplicate metadata without creating image rows. */
export function upsertSourceImageDuplicates(inputs: SourceImageDuplicateInput[]): void {
  if (inputs.length === 0) return;
  db.transaction((tx) => {
    for (const input of inputs) {
      tx.insert(sourceImageDuplicates)
        .values({ id: newId('dup'), ...input })
        .onConflictDoUpdate({
          target: [sourceImageDuplicates.workspaceId, sourceImageDuplicates.originalPath],
          set: {
            duplicateOfImageId: input.duplicateOfImageId,
            originalFilename: input.originalFilename,
            extension: input.extension,
            detectedFormat: input.detectedFormat,
            mimeType: input.mimeType,
            colorMode: input.colorMode,
            width: input.width,
            height: input.height,
            fileSize: input.fileSize,
            checksum: input.checksum,
            modifiedAt: input.modifiedAt,
          },
        })
        .run();
    }
  });
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
        detectedFormat: input.detectedFormat ?? null,
        mimeType: input.mimeType ?? null,
        colorMode: input.colorMode ?? null,
        metadataStatus: input.metadataStatus ?? 'PENDING',
        metadataError: input.metadataError ?? null,
        fileSize: input.fileSize,
        width: input.width,
        height: input.height,
        checksum: input.checksum,
        modifiedAt: input.modifiedAt,
        mediaKind: input.mediaKind ?? 'IMAGE',
        durationMs: input.durationMs ?? null,
        fps: input.fps ?? null,
        frameCount: input.frameCount ?? null,
        status: input.status ?? 'PENDING',
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

export function getImagesNeedingMetadata(
  workspaceId: string,
  afterDatasetIndex: number,
  retryFailed: boolean,
  limit: number,
  verifyAll = false,
): ImageRow[] {
  return db
    .select()
    .from(images)
    .where(
      and(
        eq(images.workspaceId, workspaceId),
        gt(images.datasetIndex, afterDatasetIndex),
        verifyAll
          ? sql`1 = 1`
          : retryFailed
            ? sql`${images.metadataStatus} IN ('PENDING', 'FAILED')`
            : eq(images.metadataStatus, 'PENDING'),
      ),
    )
    .orderBy(asc(images.datasetIndex))
    .limit(limit)
    .all();
}

export function updateImageMetadata(
  id: string,
  input: {
    detectedFormat: string | null;
    mimeType: string | null;
    colorMode: string | null;
    metadataStatus: 'PENDING' | 'ANALYZED' | 'FAILED';
    metadataError: string | null;
    width?: number;
    height?: number;
    fileSize?: number;
    modifiedAt?: number;
    checksum?: string;
  },
): void {
  db.update(images)
    .set({ ...input, updatedAt: Date.now() })
    .where(eq(images.id, id))
    .run();
}

export function metadataStatusCounts(workspaceId: string): {
  total: number;
  pending: number;
  analyzed: number;
  failed: number;
} {
  const rows = db
    .select({ status: images.metadataStatus, count: sql<number>`count(*)` })
    .from(images)
    .where(eq(images.workspaceId, workspaceId))
    .groupBy(images.metadataStatus)
    .all();
  const result = { total: 0, pending: 0, analyzed: 0, failed: 0 };
  for (const row of rows) {
    result.total += row.count;
    if (row.status === 'PENDING') result.pending = row.count;
    else if (row.status === 'ANALYZED') result.analyzed = row.count;
    else if (row.status === 'FAILED') result.failed = row.count;
  }
  return result;
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

/**
 * Neighboring images by dataset order, for Previous/Next navigation in the
 * annotation workbench. Neighbors are resolved by `datasetIndex` (the stable,
 * monotonic dataset order) — never by row insertion or file counts — so paging
 * is deterministic and independent of annotation status. `ordinal` is the
 * 1-based position of `datasetIndex` among this workspace's images.
 */
export function neighborImages(
  workspaceId: string,
  datasetIndex: number,
): { prevId: string | null; nextId: string | null; ordinal: number } {
  const prev = db
    .select({ id: images.id })
    .from(images)
    .where(and(eq(images.workspaceId, workspaceId), lt(images.datasetIndex, datasetIndex)))
    .orderBy(desc(images.datasetIndex))
    .limit(1)
    .get();
  const next = db
    .select({ id: images.id })
    .from(images)
    .where(and(eq(images.workspaceId, workspaceId), gt(images.datasetIndex, datasetIndex)))
    .orderBy(asc(images.datasetIndex))
    .limit(1)
    .get();
  const ordinalRow = db
    .select({ n: sql<number>`count(*)` })
    .from(images)
    .where(and(eq(images.workspaceId, workspaceId), lte(images.datasetIndex, datasetIndex)))
    .get();
  return { prevId: prev?.id ?? null, nextId: next?.id ?? null, ordinal: ordinalRow?.n ?? 0 };
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
  db.update(images).set({ status, updatedAt: Date.now() }).where(eq(images.id, id)).run();
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
  return Boolean(
    db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).get(),
  );
}
