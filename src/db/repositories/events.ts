import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { annotationEvents, type AnnotationEventRow } from '@/db/schema';
import { newId } from './ids';

/**
 * Append-only annotation-event repository. This is the recovery/audit trail —
 * rows are only ever inserted or read, never updated or deleted.
 */

export function appendEvent(input: {
  imageId: string;
  annotationId?: string | null;
  kind: string;
  payload?: unknown;
}): AnnotationEventRow {
  return db
    .insert(annotationEvents)
    .values({
      id: newId('evt'),
      imageId: input.imageId,
      annotationId: input.annotationId ?? null,
      kind: input.kind,
      payload: JSON.stringify(input.payload ?? {}),
    })
    .returning()
    .get();
}

export function listEventsForImage(imageId: string): AnnotationEventRow[] {
  return db
    .select()
    .from(annotationEvents)
    .where(eq(annotationEvents.imageId, imageId))
    .orderBy(desc(annotationEvents.createdAt))
    .all();
}

export function latestEventOfKind(imageId: string, kind: string): AnnotationEventRow | undefined {
  return db
    .select()
    .from(annotationEvents)
    .where(and(eq(annotationEvents.imageId, imageId), eq(annotationEvents.kind, kind)))
    .orderBy(desc(annotationEvents.createdAt))
    .limit(1)
    .get();
}
