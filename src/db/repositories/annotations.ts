import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  annotationEvents,
  annotations,
  boundingBoxes,
  images,
  type AnnotationRow,
  type BoundingBoxRow,
} from '@/db/schema';
import type {
  AnnotationBox,
  AnnotationState,
  AnnotationStatus,
  Visibility,
} from '@/types/domain';
import { newId } from './ids';

/**
 * Annotation repository — the data-safety-critical path.
 *
 * Guarantees (see .claude/CLAUDE.md §2, §6, §11):
 *  - Every mutation is a single transaction (annotation + boxes + audit event).
 *  - `annotation_events` is append-only; history is never destroyed.
 *  - Marking an image ANNOTATED is done ONLY by the submission transaction
 *    after files are verified — never here on a draft save.
 */

export interface DraftInput {
  imageId: string;
  workspaceId: string;
  schemaId: string;
  schemaVersion: number;
  classKey: string | null;
  viewKey: string | null;
  componentVisibility: Record<string, Visibility>;
  boxes: Array<Pick<AnnotationBox, 'componentKey' | 'box' | 'visibility'>>;
}

function parseVisibility(json: string): Record<string, Visibility> {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, Visibility>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function rowToState(annotation: AnnotationRow, boxes: BoundingBoxRow[]): AnnotationState {
  return {
    imageId: annotation.imageId,
    schemaId: annotation.schemaId,
    schemaVersion: annotation.schemaVersion,
    classKey: annotation.classKey,
    viewKey: annotation.viewKey,
    componentVisibility: parseVisibility(annotation.componentVisibility),
    status: annotation.status as AnnotationStatus,
    annotationVersion: annotation.annotationVersion,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
    boxes: boxes.map((b) => ({
      id: b.id,
      componentKey: b.componentKey,
      visibility: b.visibility as Visibility,
      box: { xMin: b.xMin, yMin: b.yMin, xMax: b.xMax, yMax: b.yMax },
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
  };
}

export function getAnnotationByImage(imageId: string): AnnotationState | undefined {
  const annotation = db.select().from(annotations).where(eq(annotations.imageId, imageId)).get();
  if (!annotation) return undefined;
  const boxes = db
    .select()
    .from(boundingBoxes)
    .where(eq(boundingBoxes.annotationId, annotation.id))
    .all();
  return rowToState(annotation, boxes);
}

/**
 * Persist a draft atomically: upsert the annotation, replace its boxes, append
 * a DRAFT_SAVED event, and move the image to IN_PROGRESS (never ANNOTATED).
 */
export function saveDraft(input: DraftInput): AnnotationState {
  return db.transaction((tx) => {
    const ts = Date.now();
    const existing = tx.select().from(annotations).where(eq(annotations.imageId, input.imageId)).get();

    let annotationId: string;
    if (existing) {
      annotationId = existing.id;
      tx.update(annotations)
        .set({
          classKey: input.classKey,
          viewKey: input.viewKey,
          schemaId: input.schemaId,
          schemaVersion: input.schemaVersion,
          componentVisibility: JSON.stringify(input.componentVisibility),
          status: 'DRAFT',
          updatedAt: ts,
        })
        .where(eq(annotations.id, annotationId))
        .run();
      tx.delete(boundingBoxes).where(eq(boundingBoxes.annotationId, annotationId)).run();
    } else {
      annotationId = newId('ann');
      tx.insert(annotations)
        .values({
          id: annotationId,
          imageId: input.imageId,
          workspaceId: input.workspaceId,
          classKey: input.classKey,
          viewKey: input.viewKey,
          schemaId: input.schemaId,
          schemaVersion: input.schemaVersion,
          annotationVersion: 1,
          status: 'DRAFT',
          componentVisibility: JSON.stringify(input.componentVisibility),
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
    }

    for (const b of input.boxes) {
      tx.insert(boundingBoxes)
        .values({
          id: newId('box'),
          annotationId,
          componentKey: b.componentKey,
          xMin: b.box.xMin,
          yMin: b.box.yMin,
          xMax: b.box.xMax,
          yMax: b.box.yMax,
          visibility: b.visibility,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
    }

    // Append-only audit snapshot.
    tx.insert(annotationEvents)
      .values({
        id: newId('evt'),
        imageId: input.imageId,
        annotationId,
        kind: 'DRAFT_SAVED',
        payload: JSON.stringify({
          classKey: input.classKey,
          viewKey: input.viewKey,
          componentVisibility: input.componentVisibility,
          boxes: input.boxes,
        }),
        createdAt: ts,
      })
      .run();

    // Draft progress: PENDING → IN_PROGRESS (never ANNOTATED here).
    const img = tx.select().from(images).where(eq(images.id, input.imageId)).get();
    if (img && img.status === 'PENDING') {
      tx.update(images).set({ status: 'IN_PROGRESS', updatedAt: ts }).where(eq(images.id, input.imageId)).run();
    }

    const saved = tx.select().from(annotations).where(eq(annotations.id, annotationId)).get()!;
    const boxes = tx.select().from(boundingBoxes).where(eq(boundingBoxes.annotationId, annotationId)).all();
    return rowToState(saved, boxes);
  });
}

/**
 * Mark an annotation SUBMITTED and bump its version, appending an audit event.
 * The image status transition to ANNOTATED is performed by the submission
 * transaction (submit.ts) only after files are verified on disk.
 */
export function markSubmitted(imageId: string): AnnotationState {
  return db.transaction((tx) => {
    const ts = Date.now();
    const annotation = tx.select().from(annotations).where(eq(annotations.imageId, imageId)).get();
    if (!annotation) {
      throw new Error(`No annotation to submit for image ${imageId}`);
    }
    tx.update(annotations)
      .set({
        status: 'SUBMITTED',
        annotationVersion: annotation.annotationVersion + 1,
        updatedAt: ts,
      })
      .where(eq(annotations.id, annotation.id))
      .run();
    tx.insert(annotationEvents)
      .values({
        id: newId('evt'),
        imageId,
        annotationId: annotation.id,
        kind: 'SUBMITTED',
        payload: JSON.stringify({ annotationVersion: annotation.annotationVersion + 1 }),
        createdAt: ts,
      })
      .run();
    const saved = tx.select().from(annotations).where(eq(annotations.id, annotation.id)).get()!;
    const boxes = tx.select().from(boundingBoxes).where(eq(boundingBoxes.annotationId, annotation.id)).all();
    return rowToState(saved, boxes);
  });
}
