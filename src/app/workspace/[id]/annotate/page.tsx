import { notFound } from 'next/navigation';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { annotationRepo, imageRepo, workspaceRepo } from '@/db/repositories';
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
    ? annotationRepo.getAnnotationByImage(image.id)
    : undefined;

  const counts = imageRepo.statusCounts(ws.id);

  return (
    <AnnotationWorkbench
      workspaceId={ws.id}
      workspaceName={ws.name}
      schema={schema}
      counts={counts}
      image={
        image
          ? {
              id: image.id,
              datasetIndex: image.datasetIndex,
              filename: image.originalFilename,
              width: image.width,
              height: image.height,
              status: image.status as ImageStatus,
            }
          : null
      }
      initialState={existing ?? null}
    />
  );
}
