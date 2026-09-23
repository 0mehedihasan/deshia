import { notFound } from 'next/navigation';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { imageRepo, workspaceRepo } from '@/db/repositories';
import { nextImageToPresent } from '@/core/recovery/detect';
import { getBuiltInSchema } from '@/schemas';
import { Dashboard, type DashboardImage } from '@/features/dashboard/dashboard';

export const dynamic = 'force-dynamic';

export default function WorkspacePage({ params }: { params: { id: string } }) {
  ensureDatabaseReady();
  const ws = workspaceRepo.getWorkspace(params.id);
  if (!ws) notFound();

  const counts = imageRepo.statusCounts(ws.id);
  const images: DashboardImage[] = imageRepo.listImages(ws.id).map((i) => ({
    id: i.id,
    datasetIndex: i.datasetIndex,
    filename: i.originalFilename,
    status: i.status as DashboardImage['status'],
    width: i.width,
    height: i.height,
    fileSize: i.fileSize,
  }));
  const next = nextImageToPresent(ws.id);
  const schema = getBuiltInSchema(ws.schemaId);

  return (
    <Dashboard
      workspace={{
        id: ws.id,
        name: ws.name,
        sourceDir: ws.sourceDir,
        outputDir: ws.outputDir,
        schemaId: ws.schemaId,
        schemaName: schema?.name ?? ws.schemaId,
        schemaVersion: ws.schemaVersion,
      }}
      counts={counts}
      images={images}
      next={next ? { imageId: next.image.id, resuming: next.resuming } : null}
    />
  );
}
