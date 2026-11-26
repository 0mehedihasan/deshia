import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  annotationEvents,
  annotationObjects,
  type AnnotationObjectRow,
  type NewAnnotationObjectRow,
} from '@/db/schema';
import { geometryTypeOf, parseGeometry, serializeObjects } from '@/core/annotation/objects';
import type { AnnotationObject } from '@/types/domain';
import { newId } from './ids';

/**
 * Repository for the generalized (many-objects-per-image) annotation model.
 *
 * Draft saves replace the whole object set for one image in a single
 * transaction and append an audit row — the same append-only discipline as the
 * component-box model. Failed transactions leave the previous set intact.
 */

function rowToObject(row: AnnotationObjectRow): AnnotationObject | null {
  let geometry: ReturnType<typeof parseGeometry> = null;
  let attributes: Record<string, string | number | boolean | string[] | null> = {};
  try {
    geometry = parseGeometry(JSON.parse(row.geometryJson));
    const parsedAttributes: unknown = JSON.parse(row.attributesJson);
    if (
      parsedAttributes &&
      typeof parsedAttributes === 'object' &&
      !Array.isArray(parsedAttributes)
    ) {
      attributes = parsedAttributes as typeof attributes;
    }
  } catch {
    // Corrupt rows are skipped rather than crashing the whole annotation view.
    return null;
  }
  if (!geometry) return null;
  return {
    id: row.id,
    labelId: row.labelId,
    labelName: row.labelName,
    geometry,
    attributes,
    occluded: row.occluded,
    zOrder: row.zOrder,
    visible: row.visible,
    locked: row.locked,
    trackId: row.trackId,
    frameNumber: row.frameNumber,
    outside: row.outside,
    source: row.source === 'AI' ? 'AI' : 'MANUAL',
    score: row.score,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Read all objects of one image, in stable stacking order. */
export function getObjectsForImage(imageId: string): AnnotationObject[] {
  const rows = db
    .select()
    .from(annotationObjects)
    .where(eq(annotationObjects.imageId, imageId))
    .orderBy(annotationObjects.zOrder, annotationObjects.id)
    .all();
  return rows.flatMap((row) => {
    const obj = rowToObject(row);
    return obj ? [obj] : [];
  });
}

/** Read objects for multiple images in one query (used by exports/reports). */
export function getObjectsForImages(imageIds: readonly string[]): Map<string, AnnotationObject[]> {
  const result = new Map<string, AnnotationObject[]>();
  if (imageIds.length === 0) return result;
  for (const imageId of imageIds) result.set(imageId, []);
  // SQLite parameter limit is high, but chunk to stay safe for large exports.
  for (let i = 0; i < imageIds.length; i += 200) {
    const chunk = imageIds.slice(i, i + 200);
    const rows = db
      .select()
      .from(annotationObjects)
      .where(inArray(annotationObjects.imageId, chunk))
      .all();
    for (const row of rows) {
      const obj = rowToObject(row);
      if (!obj) continue;
      const list = result.get(row.imageId);
      if (list) list.push(obj);
    }
  }
  return result;
}

/** Distinct track ids present in a workspace, with counts for the track panel. */
export function listTracks(
  workspaceId: string,
  schemaId: string,
  schemaVersion: number,
): Array<{ trackId: string; count: number; labelId: string; geometryType: string }> {
  const rows = db
    .select()
    .from(annotationObjects)
    .where(
      and(
        eq(annotationObjects.workspaceId, workspaceId),
        eq(annotationObjects.schemaId, schemaId),
        eq(annotationObjects.schemaVersion, schemaVersion),
      ),
    )
    .all();
  const tracks = new Map<
    string,
    { trackId: string; count: number; labelId: string; geometryType: string }
  >();
  for (const row of rows) {
    if (!row.trackId) continue;
    const existing = tracks.get(row.trackId);
    if (existing) existing.count += 1;
    else
      tracks.set(row.trackId, {
        trackId: row.trackId,
        count: 1,
        labelId: row.labelId,
        geometryType: row.geometryType,
      });
  }
  return [...tracks.values()];
}

/**
 * Replace all objects for one image. Objects are persisted verbatim; validation
 * happens in the domain layer before this call (and again on submit).
 */
export function saveObjects(input: {
  imageId: string;
  workspaceId: string;
  schemaId: string;
  schemaVersion: number;
  objects: readonly AnnotationObject[];
}): void {
  db.transaction((tx) => {
    tx.delete(annotationObjects).where(eq(annotationObjects.imageId, input.imageId)).run();
    for (const obj of input.objects) {
      const row: NewAnnotationObjectRow = {
        id: obj.id,
        imageId: input.imageId,
        workspaceId: input.workspaceId,
        schemaId: input.schemaId,
        schemaVersion: input.schemaVersion,
        labelId: obj.labelId,
        labelName: obj.labelName,
        geometryType: geometryTypeOf(obj.geometry),
        geometryJson: JSON.stringify(obj.geometry),
        attributesJson: JSON.stringify(obj.attributes),
        occluded: obj.occluded,
        zOrder: obj.zOrder,
        visible: obj.visible,
        locked: obj.locked,
        trackId: obj.trackId,
        frameNumber: obj.frameNumber,
        outside: obj.outside,
        source: obj.source,
        score: obj.score,
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt,
      };
      tx.insert(annotationObjects).values(row).run();
    }
    tx.insert(annotationEvents)
      .values({
        id: newId('evt'),
        imageId: input.imageId,
        annotationId: null,
        kind: 'OBJECTS_SAVED',
        payload: JSON.stringify({
          count: input.objects.length,
          objects: serializeObjects(input.objects),
        }),
      })
      .run();
  });
}

/** Delete all objects of an image (used when discarding a draft). */
export function deleteObjectsForImage(imageId: string): void {
  db.transaction((tx) => {
    tx.delete(annotationObjects).where(eq(annotationObjects.imageId, imageId)).run();
    tx.insert(annotationEvents)
      .values({
        id: newId('evt'),
        imageId,
        kind: 'OBJECTS_DELETED',
        payload: '{}',
      })
      .run();
  });
}
