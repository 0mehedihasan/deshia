import { notFound } from 'next/navigation';
import { ensureDatabaseReady } from '@/db/bootstrap';
import {
  annotationRepo,
  imageRepo,
  objectRepo,
  schemaRepo,
  workspaceRepo,
} from '@/db/repositories';
import { nextImageToPresent } from '@/core/recovery/detect';
import { getBuiltInSchema } from '@/schemas';
import { AnnotationWorkbench } from '@/features/annotation/annotation-workbench';
import type { AnnotationState, ImageStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

export default function AnnotatePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { image?: string };
}) {
  ensureDatabaseReady();
  const ws = workspaceRepo.getWorkspace(params.id);
  if (!ws) notFound();

  const schema = getBuiltInSchema(ws.schemaId);
  if (!schema) notFound();

  // Target image: explicit query param, else the next image to present.
  const targetId = searchParams.image ?? nextImageToPresent(ws.id)?.image.id ?? null;
  const image = targetId ? imageRepo.getImage(targetId) : undefined;

  const existing: AnnotationState | undefined = image
    ? (() => {
        const state = annotationRepo.getAnnotationByImage(image.id);
        if (!state) return undefined;
        return { ...state, objects: objectRepo.getObjectsForImage(image.id) };
      })()
    : undefined;

  const customSchema = schemaRepo.getDefinition(ws.schemaId);
  const counts = imageRepo.statusCounts(ws.id);

  // Dataset-order neighbors for Previous/Next paging (independent of status).
  const neighbors = image
    ? imageRepo.neighborImages(ws.id, image.datasetIndex)
    : { prevId: null, nextId: null, ordinal: 0 };

  return (
    <AnnotationWorkbench
      workspaceId={ws.id}
      workspaceName={ws.name}
      schema={schema}
      counts={counts}
      prevImageId={neighbors.prevId}
      nextImageId={neighbors.nextId}
      position={neighbors.ordinal}
      total={counts.total}
      image={
        image
          ? {
              id: image.id,
              datasetIndex: image.datasetIndex,
              filename: image.originalFilename,
              width: image.width,
              height: image.height,
              status: image.status as ImageStatus,
              extension: image.extension,
              detectedFormat: image.detectedFormat,
              mimeType: image.mimeType,
              colorMode: image.colorMode,
              metadataStatus: image.metadataStatus as 'PENDING' | 'ANALYZED' | 'FAILED',
              metadataError: image.metadataError,
              mediaKind: image.mediaKind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
              frameCount: image.frameCount,
              fps: image.fps,
              durationMs: image.durationMs,
              fileSize: image.fileSize,
              checksum: image.checksum,
              importedAt: image.createdAt,
            }
          : null
      }
      initialState={existing ?? null}
      recursiveSchema={customSchema}
    />
  );
}
