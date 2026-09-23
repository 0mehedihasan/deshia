import { annotationRepo, eventRepo, imageRepo } from '@/db/repositories';
import type { AnnotationState, ImageStatus } from '@/types/domain';
import type { ImageRow } from '@/db/schema';

/**
 * Crash-recovery detection.
 *
 * DeshiA never silently loses annotation work. Draft state is persisted on every
 * autosave (annotations + boxes + append-only events). On startup we detect any
 * image left mid-annotation and offer to resume exactly where the user was.
 */

export interface RecoverableImage {
  image: ImageRow;
  draft: AnnotationState;
  lastSavedAt: number;
}

/** Whether an image has a resumable draft (IN_PROGRESS with a DRAFT annotation). */
export function isRecoverable(image: ImageRow): boolean {
  if (image.status !== 'IN_PROGRESS') return false;
  const draft = annotationRepo.getAnnotationByImage(image.id);
  return Boolean(draft && draft.status === 'DRAFT');
}

/**
 * Find all images in a workspace with resumable drafts, most-recently-saved
 * first. Empty when there is nothing to recover.
 */
export function findRecoverable(workspaceId: string): RecoverableImage[] {
  const out: RecoverableImage[] = [];
  for (const image of imageRepo.listImages(workspaceId)) {
    if (image.status !== 'IN_PROGRESS') continue;
    const draft = annotationRepo.getAnnotationByImage(image.id);
    if (!draft || draft.status !== 'DRAFT') continue;
    const lastEvent = eventRepo.latestEventOfKind(image.id, 'DRAFT_SAVED');
    out.push({ image, draft, lastSavedAt: lastEvent?.createdAt ?? draft.updatedAt });
  }
  return out.sort((a, b) => b.lastSavedAt - a.lastSavedAt);
}

/**
 * The next image the workspace should present: the most recent resumable draft
 * if one exists, otherwise the first PENDING image.
 */
export function nextImageToPresent(workspaceId: string): {
  image: ImageRow;
  resuming: boolean;
} | undefined {
  const recoverable = findRecoverable(workspaceId);
  if (recoverable[0]) {
    return { image: recoverable[0].image, resuming: true };
  }
  const pending = imageRepo.firstImageWithStatus(workspaceId, 'PENDING' satisfies ImageStatus);
  return pending ? { image: pending, resuming: false } : undefined;
}
