'use server';

import { revalidatePath } from 'next/cache';
import { ensureDatabaseReady } from '@/db/bootstrap';
import {
  annotationRepo,
  eventRepo,
  exportJobRepo,
  imageRepo,
  workspaceRepo,
} from '@/db/repositories';
import { exportImage } from '@/core/exporter/submit';
import { nextImageToPresent } from '@/core/recovery/detect';
import { getBuiltInSchema } from '@/schemas';
import type { NormalizedBox, Visibility } from '@/types/domain';

/**
 * Annotation application service — the data-safety-critical path.
 *
 * The UI (client store) hands us a serializable draft payload. We persist it
 * through the repository layer (never raw SQL in the UI) and, for submission,
 * run the strict transaction in .claude/CLAUDE.md §11: an image is marked
 * ANNOTATED only after every output file is written and verified on disk.
 */

export interface DraftPayload {
  imageId: string;
  workspaceId: string;
  classKey: string | null;
  viewKey: string | null;
  componentVisibility: Record<string, Visibility>;
  boxes: Array<{ componentKey: string; box: NormalizedBox; visibility: Visibility }>;
}

export type SaveDraftResult = { ok: true; savedAt: number } | { ok: false; error: string };

export async function saveDraftAction(payload: DraftPayload): Promise<SaveDraftResult> {
  ensureDatabaseReady();
  const ws = workspaceRepo.getWorkspace(payload.workspaceId);
  if (!ws) return { ok: false, error: 'Workspace not found.' };
  try {
    annotationRepo.saveDraft({
      imageId: payload.imageId,
      workspaceId: payload.workspaceId,
      schemaId: ws.schemaId,
      schemaVersion: ws.schemaVersion,
      classKey: payload.classKey,
      viewKey: payload.viewKey,
      componentVisibility: payload.componentVisibility,
      boxes: payload.boxes,
    });
    return { ok: true, savedAt: Date.now() };
  } catch (err) {
    // Draft is preserved in memory by the client; surface the failure.
    return { ok: false, error: (err as Error).message };
  }
}

export type SubmitResult =
  | { ok: true; outputs: string[]; nextImageId: string | null }
  | { ok: false; errors: string[] };

/**
 * Submit an image. Order (strict): persist draft → generate XML → copy RAW →
 * copy annotated (clean) → verify files → mark SUBMITTED + ANNOTATED. Any
 * failure preserves the draft and leaves the image un-annotated for retry.
 */
export async function submitImageAction(payload: DraftPayload): Promise<SubmitResult> {
  ensureDatabaseReady();

  const ws = workspaceRepo.getWorkspace(payload.workspaceId);
  if (!ws) return { ok: false, errors: ['Workspace not found.'] };
  const schema = getBuiltInSchema(ws.schemaId);
  if (!schema) return { ok: false, errors: [`Unknown schema "${ws.schemaId}".`] };
  const image = imageRepo.getImage(payload.imageId);
  if (!image) return { ok: false, errors: ['Image not found.'] };

  // 1–2. Persist the draft first so nothing is lost even if export fails.
  let state;
  try {
    state = annotationRepo.saveDraft({
      imageId: payload.imageId,
      workspaceId: payload.workspaceId,
      schemaId: ws.schemaId,
      schemaVersion: ws.schemaVersion,
      classKey: payload.classKey,
      viewKey: payload.viewKey,
      componentVisibility: payload.componentVisibility,
      boxes: payload.boxes,
    });
  } catch (err) {
    return { ok: false, errors: [`Could not persist draft: ${(err as Error).message}`] };
  }

  const job = exportJobRepo.createExportJob({
    workspaceId: payload.workspaceId,
    imageId: payload.imageId,
  });

  // 3–6. Filesystem export + verification (no DB mutation inside).
  const result = await exportImage({
    schema,
    outputDir: ws.outputDir,
    image: {
      id: image.id,
      datasetIndex: image.datasetIndex,
      originalPath: image.originalPath,
      extension: image.extension,
      width: image.width,
      height: image.height,
    },
    state,
  });

  if (!result.ok) {
    exportJobRepo.markExportFailed(job.id, result.errors.join('; '));
    eventRepo.appendEvent({
      imageId: payload.imageId,
      kind: 'EXPORT_FAILED',
      payload: { errors: result.errors },
    });
    return { ok: false, errors: result.errors };
  }

  // 7–8. Only now — files verified on disk — commit the ANNOTATED status.
  try {
    annotationRepo.markSubmitted(payload.imageId);
    imageRepo.setImageStatus(payload.imageId, result.nextStatus);
    exportJobRepo.markExportSucceeded(job.id, result.outputs.relativePaths);
  } catch (err) {
    exportJobRepo.markExportFailed(job.id, (err as Error).message);
    return { ok: false, errors: [`Files written but DB update failed: ${(err as Error).message}`] };
  }

  workspaceRepo.touchWorkspace(payload.workspaceId);
  revalidatePath(`/workspace/${payload.workspaceId}`);

  const next = nextImageToPresent(payload.workspaceId);
  return {
    ok: true,
    outputs: result.outputs.relativePaths,
    nextImageId: next?.image.id ?? null,
  };
}

export async function skipImageAction(
  workspaceId: string,
  imageId: string,
): Promise<{ ok: boolean; nextImageId: string | null; error?: string }> {
  ensureDatabaseReady();
  const image = imageRepo.getImage(imageId);
  if (!image) return { ok: false, nextImageId: null, error: 'Image not found.' };
  try {
    imageRepo.setImageStatus(imageId, 'SKIPPED');
    eventRepo.appendEvent({ imageId, kind: 'SKIPPED', payload: {} });
    revalidatePath(`/workspace/${workspaceId}`);
    const next = nextImageToPresent(workspaceId);
    return { ok: true, nextImageId: next?.image.id ?? null };
  } catch (err) {
    return { ok: false, nextImageId: null, error: (err as Error).message };
  }
}
