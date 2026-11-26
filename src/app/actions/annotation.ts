'use server';

import { revalidatePath } from 'next/cache';
import { ensureDatabaseReady } from '@/db/bootstrap';
import {
  annotationRepo,
  eventRepo,
  exportJobRepo,
  imageRepo,
  objectRepo,
  schemaRepo,
  workspaceRepo,
} from '@/db/repositories';
import { exportImage } from '@/core/exporter/submit';
import { computeOrphanPaths, removeOrphanOutputs } from '@/core/exporter/cleanup';
import { nextImageToPresent } from '@/core/recovery/detect';
import { getBuiltInSchema, RICKSHAW_SCHEMA } from '@/schemas';
import type {
  AnnotationObject,
  AnnotationState,
  NormalizedBox,
  RedactionCircle,
  Visibility,
} from '@/types/domain';
import { requireUser } from '@/core/auth/session';

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
  boxes: Array<{
    componentKey: string;
    box: NormalizedBox;
    visibility: Visibility;
    vehicleInstanceId?: string | null;
  }>;
  /** Independent schema-driven objects (many per image). */
  objects?: AnnotationObject[];
  /** Client's last accepted save revision; mismatch means another writer won. */
  expectedRevision?: number;
  /** Circular face/privacy regions to blur into every exported copy. */
  redactions: RedactionCircle[];
}

export type SaveDraftResult =
  | { ok: true; savedAt: number; revision: number }
  | { ok: false; error: string; conflict?: boolean; state?: AnnotationState };

/** Persist the generalized object layer in the same request as the draft. */
function persistObjects(payload: DraftPayload, schemaId: string, schemaVersion: number): void {
  objectRepo.saveObjects({
    imageId: payload.imageId,
    workspaceId: payload.workspaceId,
    schemaId,
    schemaVersion,
    objects: payload.objects ?? [],
  });
}

export async function saveDraftAction(payload: DraftPayload): Promise<SaveDraftResult> {
  try {
    requireUser();
    ensureDatabaseReady();
    const ws = workspaceRepo.getWorkspace(payload.workspaceId);
    if (!ws) return { ok: false, error: 'Workspace not found.' };
    const current = annotationRepo.getAnnotationByImage(payload.imageId);
    if (
      typeof payload.expectedRevision === 'number' &&
      current &&
      current.saveRevision !== payload.expectedRevision
    ) {
      return {
        ok: false,
        error: 'This annotation was saved elsewhere. Choose which version to keep.',
        conflict: true,
        state: {
          ...current,
          objects: objectRepo.getObjectsForImage(payload.imageId),
        },
      };
    }
    const saved = annotationRepo.saveDraft({
      imageId: payload.imageId,
      workspaceId: payload.workspaceId,
      schemaId: ws.schemaId,
      schemaVersion: ws.schemaVersion,
      classKey: payload.classKey,
      viewKey: payload.viewKey,
      componentVisibility: payload.componentVisibility,
      boxes: payload.boxes,
      redactions: payload.redactions,
    });
    persistObjects(payload, ws.schemaId, ws.schemaVersion);
    return { ok: true, savedAt: Date.now(), revision: saved.saveRevision };
  } catch (err) {
    // Draft is preserved in memory by the client; surface the failure instead
    // of letting the promise reject (which would freeze the autosave UI).
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
  try {
    requireUser();
    ensureDatabaseReady();

    const ws = workspaceRepo.getWorkspace(payload.workspaceId);
    if (!ws) return { ok: false, errors: ['Workspace not found.'] };
    const customDefinition = schemaRepo.getDefinition(ws.schemaId);
    // Objects mode validates against the recursive definition; the flat schema
    // is only used by the legacy component export path.
    const schema = getBuiltInSchema(ws.schemaId) ?? RICKSHAW_SCHEMA;
    const image = imageRepo.getImage(payload.imageId);
    if (!image) return { ok: false, errors: ['Image not found.'] };

    // Snapshot the previous successful export BEFORE writing new files. If this
    // submit lands in a different class/view folder, we use this to delete the
    // now-stale copies afterward (see the post-commit cleanup below).
    const prevExport = exportJobRepo.latestSucceededExportForImage(payload.imageId);

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
        redactions: payload.redactions,
      });
      persistObjects(payload, ws.schemaId, ws.schemaVersion);
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
      recursiveSchema: customDefinition,
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
      return {
        ok: false,
        errors: [`Files written but DB update failed: ${(err as Error).message}`],
      };
    }

    // Post-commit bookkeeping. The submission already succeeded, so a failure
    // here must not turn a good submit into an error — degrade to "no next".
    let nextImageId: string | null = null;
    try {
      // Remove any outputs orphaned by a class/view change on re-submission.
      // Filenames key off datasetIndex, so a same-class/view re-submit overwrites
      // in place; only a folder change strands the old copies. Best-effort — the
      // submit is already committed, so cleanup never fails it. The deletion is
      // recorded in the append-only event log for auditability.
      if (prevExport) {
        const orphans = computeOrphanPaths(prevExport.outputs, result.outputs.relativePaths);
        if (orphans.length > 0) {
          const removed = await removeOrphanOutputs(ws.outputDir, orphans);
          if (removed.length > 0) {
            eventRepo.appendEvent({
              imageId: payload.imageId,
              kind: 'ORPHANS_REMOVED',
              payload: { removed },
            });
          }
        }
      }
      workspaceRepo.touchWorkspace(payload.workspaceId);
      revalidatePath(`/workspace/${payload.workspaceId}`);
      nextImageId = nextImageToPresent(payload.workspaceId)?.image.id ?? null;
    } catch {
      nextImageId = null;
    }

    return { ok: true, outputs: result.outputs.relativePaths, nextImageId };
  } catch (err) {
    // Last-resort guard: a server action that rejects makes the client fetch
    // fail ("Load failed") and can wedge the UI. Always resolve with a result.
    return { ok: false, errors: [(err as Error).message || 'Submit failed unexpectedly.'] };
  }
}

export async function skipImageAction(
  workspaceId: string,
  imageId: string,
): Promise<{ ok: boolean; nextImageId: string | null; error?: string }> {
  try {
    requireUser();
    ensureDatabaseReady();
    const image = imageRepo.getImage(imageId);
    if (!image) return { ok: false, nextImageId: null, error: 'Image not found.' };
    imageRepo.setImageStatus(imageId, 'SKIPPED');
    eventRepo.appendEvent({ imageId, kind: 'SKIPPED', payload: {} });
    revalidatePath(`/workspace/${workspaceId}`);
    const next = nextImageToPresent(workspaceId);
    return { ok: true, nextImageId: next?.image.id ?? null };
  } catch (err) {
    return { ok: false, nextImageId: null, error: (err as Error).message };
  }
}
