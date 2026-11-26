import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { annotations, boundingBoxes, images, sourceImageDuplicates } from '@/db/schema';

/** Narrow analytics projection; avoids hydrating annotation history or UI state. */
export function getWorkspaceAnalyticsRows(workspaceId: string) {
  const imageRows = db
    .select({
      id: images.id,
      datasetIndex: images.datasetIndex,
      filename: images.originalFilename,
      extension: images.extension,
      detectedFormat: images.detectedFormat,
      mimeType: images.mimeType,
      colorMode: images.colorMode,
      metadataStatus: images.metadataStatus,
      metadataError: images.metadataError,
      fileSize: images.fileSize,
      checksum: images.checksum,
      originalPath: images.originalPath,
      createdAt: images.createdAt,
      width: images.width,
      height: images.height,
      status: images.status,
      classKey: annotations.classKey,
      viewKey: annotations.viewKey,
    })
    .from(images)
    .leftJoin(annotations, eq(images.id, annotations.imageId))
    .where(eq(images.workspaceId, workspaceId))
    .all();
  const boxRows = db
    .select({
      imageId: annotations.imageId,
      componentKey: boundingBoxes.componentKey,
      vehicleInstanceId: boundingBoxes.vehicleInstanceId,
      xMin: boundingBoxes.xMin,
      yMin: boundingBoxes.yMin,
      xMax: boundingBoxes.xMax,
      yMax: boundingBoxes.yMax,
      visibility: boundingBoxes.visibility,
    })
    .from(boundingBoxes)
    .innerJoin(annotations, eq(boundingBoxes.annotationId, annotations.id))
    .where(eq(annotations.workspaceId, workspaceId))
    .all();
  const duplicateRows = db
    .select({
      id: sourceImageDuplicates.id,
      filename: sourceImageDuplicates.originalFilename,
      originalPath: sourceImageDuplicates.originalPath,
      extension: sourceImageDuplicates.extension,
      detectedFormat: sourceImageDuplicates.detectedFormat,
      mimeType: sourceImageDuplicates.mimeType,
      colorMode: sourceImageDuplicates.colorMode,
      fileSize: sourceImageDuplicates.fileSize,
      checksum: sourceImageDuplicates.checksum,
      modifiedAt: sourceImageDuplicates.modifiedAt,
      width: sourceImageDuplicates.width,
      height: sourceImageDuplicates.height,
      duplicateOfImageId: sourceImageDuplicates.duplicateOfImageId,
      createdAt: sourceImageDuplicates.discoveredAt,
    })
    .from(sourceImageDuplicates)
    .where(eq(sourceImageDuplicates.workspaceId, workspaceId))
    .all();
  return { images: imageRows, boxes: boxRows, duplicates: duplicateRows };
}
