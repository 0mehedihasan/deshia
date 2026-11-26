'use server';

import { ensureDatabaseReady } from '@/db/bootstrap';
import { analyticsRepo, imageRepo, workspaceRepo } from '@/db/repositories';
import { getBuiltInSchema } from '@/schemas';
import {
  calculateDatasetStatistics,
  type StatisticsBox,
  type StatisticsImage,
} from '@/core/analytics/statistics';
import { validateExportFormats } from '@/core/analytics/export-validation';
import { writeStatisticsSnapshot } from '@/core/analytics/snapshot';
import { analyzeSourceImage } from '@/core/scanner/metadata';
import {
  calculateImageMetadataStatistics,
  generateImageMetadataCsv,
  generateImageMetadataJson,
  generateImageMetadataMarkdown,
  type ImageMetadataRecord,
} from '@/core/scanner/statistics';

export async function generateStatisticsSnapshot(
  workspaceId: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    ensureDatabaseReady();
    const ws = workspaceRepo.getWorkspace(workspaceId);
    if (!ws) return { ok: false, error: 'Workspace not found.' };
    const schema = getBuiltInSchema(ws.schemaId);
    if (!schema) return { ok: false, error: 'Workspace schema is unavailable.' };
    const rows = analyticsRepo.getWorkspaceAnalyticsRows(ws.id);
    const snapshot = {
      timestamp: new Date().toISOString(),
      datasetId: ws.id,
      datasetVersion: ws.schemaVersion,
      statistics: calculateDatasetStatistics(
        rows.images as StatisticsImage[],
        rows.boxes as StatisticsBox[],
        schema,
      ),
      exportValidation: await validateExportFormats(
        ws.outputDir,
        rows.images,
        rows.boxes as StatisticsBox[],
        schema,
      ),
    };
    const snapshotPath = await writeStatisticsSnapshot(ws.outputDir, snapshot);
    return { ok: true, path: snapshotPath };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

const METADATA_BATCH_SIZE = 40;

export async function analyzeExistingImagesAction(
  workspaceId: string,
  afterDatasetIndex = -1,
  retryFailed = false,
  verifyAll = false,
): Promise<{
  ok: boolean;
  error?: string;
  processed: number;
  analyzed: number;
  failed: number;
  nextCursor: number;
  done: boolean;
  total: number;
}> {
  ensureDatabaseReady();
  const ws = workspaceRepo.getWorkspace(workspaceId);
  if (!ws)
    return {
      ok: false,
      error: 'Workspace not found.',
      processed: 0,
      analyzed: 0,
      failed: 0,
      nextCursor: afterDatasetIndex,
      done: true,
      total: 0,
    };
  const counts = imageRepo.metadataStatusCounts(workspaceId);
  const batch = imageRepo.getImagesNeedingMetadata(
    workspaceId,
    afterDatasetIndex,
    retryFailed,
    METADATA_BATCH_SIZE,
    verifyAll,
  );
  let analyzed = 0;
  let failed = 0;
  let nextCursor = afterDatasetIndex;
  for (const image of batch) {
    nextCursor = image.datasetIndex;
    try {
      const source = await analyzeSourceImage(image.originalPath, image.checksum);
      const { metadata } = source;
      imageRepo.updateImageMetadata(image.id, {
        detectedFormat: metadata.detectedFormat,
        mimeType: metadata.mimeType,
        colorMode: metadata.colorMode,
        metadataStatus: 'ANALYZED',
        metadataError: null,
        width: metadata.width,
        height: metadata.height,
        fileSize: source.fileSize,
        modifiedAt: source.modifiedAt,
        checksum: source.checksum,
      });
      analyzed += 1;
    } catch (error) {
      imageRepo.updateImageMetadata(image.id, {
        detectedFormat: null,
        mimeType: null,
        colorMode: null,
        metadataStatus: 'FAILED',
        metadataError: (error instanceof Error ? error.message : String(error))
          .split(image.originalPath)
          .join(image.originalFilename),
      });
      failed += 1;
    }
  }
  const more =
    imageRepo.getImagesNeedingMetadata(workspaceId, nextCursor, retryFailed, 1, verifyAll).length >
    0;
  return {
    ok: true,
    processed: batch.length,
    analyzed,
    failed,
    nextCursor,
    done: !more,
    total: counts.total,
  };
}

export async function exportImageMetadataAction(
  workspaceId: string,
  format: 'CSV' | 'JSON' | 'MARKDOWN',
): Promise<{
  ok: boolean;
  filename?: string;
  mimeType?: string;
  content?: string;
  error?: string;
}> {
  ensureDatabaseReady();
  const ws = workspaceRepo.getWorkspace(workspaceId);
  if (!ws) return { ok: false, error: 'Workspace not found.' };
  const rows = analyticsRepo.getWorkspaceAnalyticsRows(ws.id);
  const statistics = calculateImageMetadataStatistics(
    rows.images as ImageMetadataRecord[],
    ws.sourceDir,
    rows.duplicates,
  );
  const generatedAt = new Date().toISOString();
  const dataset = { id: ws.id, name: ws.name, version: ws.schemaVersion };
  if (format === 'CSV')
    return {
      ok: true,
      filename: 'deshia_image_metadata.csv',
      mimeType: 'text/csv',
      content: generateImageMetadataCsv(statistics.images),
    };
  if (format === 'MARKDOWN')
    return {
      ok: true,
      filename: 'deshia_image_resolution_report.md',
      mimeType: 'text/markdown',
      content: generateImageMetadataMarkdown(dataset, generatedAt, statistics),
    };
  return {
    ok: true,
    filename: 'deshia_image_metadata.json',
    mimeType: 'application/json',
    content: generateImageMetadataJson(dataset, generatedAt, statistics),
  };
}
