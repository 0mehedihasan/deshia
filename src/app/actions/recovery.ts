'use server';

import { revalidatePath } from 'next/cache';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { eventRepo, imageRepo, objectRepo, workspaceRepo } from '@/db/repositories';
import { parseObjects } from '@/core/annotation/objects';
import type { AnnotationObject } from '@/types/domain';

/**
 * Single-user recovery: the append-only event log is readable here so the UI
 * can show prior object snapshots and restore one as a new revision (history is
 * never destructively rewritten).
 */

export interface RevisionEntry {
  id: string;
  kind: string;
  createdAt: number;
  objectCount: number;
}

export async function listRevisionsAction(
  imageId: string,
): Promise<{ ok: true; entries: RevisionEntry[] } | { ok: false; error: string }> {
  try {
    ensureDatabaseReady();
    const entries = eventRepo
      .listEventsForImage(imageId)
      .filter((e) => e.kind === 'OBJECTS_SAVED')
      .slice(0, 20)
      .flatMap((e) => {
        try {
          const payload = JSON.parse(e.payload) as { count?: number };
          return [
            {
              id: e.id,
              kind: e.kind,
              createdAt: e.createdAt,
              objectCount: typeof payload?.count === 'number' ? payload.count : 0,
            },
          ];
        } catch {
          return [];
        }
      });
    return { ok: true, entries };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function restoreRevisionAction(
  imageId: string,
  eventId: string,
): Promise<{ ok: true; objects: AnnotationObject[] } | { ok: false; error: string }> {
  try {
    ensureDatabaseReady();
    const event = eventRepo.listEventsForImage(imageId).find((e) => e.id === eventId);
    if (!event) return { ok: false, error: 'Revision not found.' };
    if (event.kind !== 'OBJECTS_SAVED')
      return { ok: false, error: 'Revision has no object snapshot.' };
    const payload = JSON.parse(event.payload) as { objects?: string };
    const objects = parseObjects(payload.objects);
    const image = imageRepo.getImage(imageId);
    if (!image) return { ok: false, error: 'Image not found.' };
    const ws = workspaceRepo.getWorkspace(image.workspaceId);
    if (!ws) return { ok: false, error: 'Workspace not found.' };
    objectRepo.saveObjects({
      imageId,
      workspaceId: ws.id,
      schemaId: ws.schemaId,
      schemaVersion: ws.schemaVersion,
      objects,
    });
    eventRepo.appendEvent({
      imageId,
      kind: 'RECOVERED',
      payload: { fromEventId: eventId, objectCount: objects.length },
    });
    revalidatePath(`/workspace/${ws.id}/annotate`);
    return { ok: true, objects };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
