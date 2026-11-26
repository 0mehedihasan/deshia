import { notFound } from 'next/navigation';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { analyticsRepo, imageRepo, objectRepo, workspaceRepo } from '@/db/repositories';
import { computeObjectStatistics } from '@/core/analytics/object-statistics';
import { getBuiltInSchema } from '@/schemas';
import {
  calculateDatasetStatistics,
  type StatisticsBox,
  type StatisticsImage,
} from '@/core/analytics/statistics';
import { StatisticsDashboard } from '@/features/analytics/statistics-dashboard';
import { validateExportFormats } from '@/core/analytics/export-validation';
import {
  calculateImageMetadataStatistics,
  type ImageMetadataRecord,
} from '@/core/scanner/statistics';

export const dynamic = 'force-dynamic';

export default async function StatisticsPage({ params }: { params: { id: string } }) {
  ensureDatabaseReady();
  const workspace = workspaceRepo.getWorkspace(params.id);
  if (!workspace) notFound();
  const schema = getBuiltInSchema(workspace.schemaId);
  if (!schema) notFound();
  const rows = analyticsRepo.getWorkspaceAnalyticsRows(workspace.id);
  const statistics = calculateDatasetStatistics(
    rows.images as StatisticsImage[],
    rows.boxes as StatisticsBox[],
    schema,
  );
  const exportValidation = await validateExportFormats(
    workspace.outputDir,
    rows.images,
    rows.boxes as StatisticsBox[],
    schema,
  );
  const metadata = calculateImageMetadataStatistics(
    rows.images as ImageMetadataRecord[],
    workspace.sourceDir,
    rows.duplicates,
  );
  const { images: _imageRows, ...metadataSummary } = metadata;
  const objectMaps = objectRepo.getObjectsForImages(
    imageRepo.listImages(workspace.id).map((image) => image.id),
  );
  const objectStats = computeObjectStatistics([...objectMaps.values()].flat());
  return (
    <StatisticsDashboard
      workspace={{
        id: workspace.id,
        name: workspace.name,
        outputDir: workspace.outputDir,
        schemaVersion: workspace.schemaVersion,
      }}
      statistics={statistics}
      exportValidation={exportValidation}
      metadata={metadataSummary}
      objectStats={objectStats}
    />
  );
}
