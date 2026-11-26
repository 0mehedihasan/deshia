'use server';

import { revalidatePath } from 'next/cache';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { imageRepo, workspaceRepo } from '@/db/repositories';
import { scanDirectory } from '@/core/scanner/scan';
import { inventoryOutput } from '@/core/exporter/output-inventory';
import type { OutputClassCounts, OutputViewCounts } from '@/core/exporter/output-inventory';
import { getBuiltInSchema, RICKSHAW_SCHEMA } from '@/schemas';
import { requireUser } from '@/core/auth/session';

/**
 * Dataset scan application service.
 *
 * Recursively scans the workspace's read-only source folder, then imports every
 * newly-seen supported image (deduplicated by content checksum). Re-scanning is
 * safe: images already imported (matched by checksum) are skipped, so dataset
 * indices stay stable and no row is duplicated.
 */

export interface ScanImportSummary {
  ok: boolean;
  error?: string;
  scanned: number;
  supported: number;
  duplicates: number;
  unsupported: number;
  errors: number;
  imported: number;
  skippedExisting: number;
}

export async function scanAndImportAction(workspaceId: string): Promise<ScanImportSummary> {
  try {
    requireUser();
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      scanned: 0,
      supported: 0,
      duplicates: 0,
      unsupported: 0,
      errors: 0,
      imported: 0,
      skippedExisting: 0,
    };
  }
  ensureDatabaseReady();

  const empty: ScanImportSummary = {
    ok: false,
    scanned: 0,
    supported: 0,
    duplicates: 0,
    unsupported: 0,
    errors: 0,
    imported: 0,
    skippedExisting: 0,
  };

  const ws = workspaceRepo.getWorkspace(workspaceId);
  if (!ws) return { ...empty, error: 'Workspace not found.' };

  try {
    const result = await scanDirectory(ws.sourceDir);

    // Checksums already imported for this workspace — used to skip re-imports.
    const existing = new Set(imageRepo.listImages(workspaceId).map((i) => i.checksum));

    let skippedExisting = 0;
    const imageIdByPath = new Map(
      imageRepo.listImages(workspaceId).map((image) => [image.originalPath, image.id]),
    );
    const duplicateInputs = result.entries.flatMap((entry) => {
      if (
        entry.kind !== 'DUPLICATE' ||
        !entry.duplicateOf ||
        !entry.extension ||
        !entry.detectedFormat ||
        !entry.mimeType ||
        !entry.width ||
        !entry.height ||
        !entry.checksum
      )
        return [];
      const duplicateOfImageId = imageIdByPath.get(entry.duplicateOf) ?? null;
      // A prior source scan may have imported the canonical file under a different
      // row/path after relocation. The duplicate record remains useful regardless.
      return [
        {
          workspaceId,
          duplicateOfImageId,
          originalFilename: entry.filename,
          originalPath: entry.absolutePath,
          extension: entry.extension,
          detectedFormat: entry.detectedFormat,
          mimeType: entry.mimeType,
          colorMode: entry.colorMode ?? null,
          width: entry.width,
          height: entry.height,
          fileSize: entry.fileSize,
          checksum: entry.checksum,
          modifiedAt: entry.modifiedAt,
        },
      ];
    });
    const toInsert = [];
    for (const e of result.entries) {
      if (e.kind === 'DUPLICATE' || e.kind === 'UNSUPPORTED') continue;
      if (e.checksum && existing.has(e.checksum)) {
        skippedExisting += 1;
        continue;
      }
      if (e.checksum && e.extension && e.mediaKind === 'VIDEO') {
        existing.add(e.checksum);
        toInsert.push({
          workspaceId,
          originalFilename: e.filename,
          originalPath: e.absolutePath,
          extension: e.extension,
          detectedFormat: e.detectedFormat ?? `video/${e.extension}`,
          mimeType: e.mimeType ?? null,
          colorMode: null,
          metadataStatus:
            (e.width ?? 0) > 0 && (e.height ?? 0) > 0
              ? ('ANALYZED' as const)
              : ('PENDING' as const),
          metadataError: e.error ?? null,
          fileSize: e.fileSize,
          width: e.width ?? 0,
          height: e.height ?? 0,
          checksum: e.checksum,
          modifiedAt: e.modifiedAt,
          mediaKind: 'VIDEO' as const,
          durationMs: e.durationMs ?? null,
          fps: e.fps ?? null,
          frameCount: e.frameCount ?? null,
        });
      } else if (e.checksum && e.width && e.height && e.extension) {
        existing.add(e.checksum);
        toInsert.push({
          workspaceId,
          originalFilename: e.filename,
          originalPath: e.absolutePath,
          extension: e.extension,
          detectedFormat: e.detectedFormat ?? null,
          mimeType: e.mimeType ?? null,
          colorMode: e.colorMode ?? null,
          metadataStatus: 'ANALYZED' as const,
          metadataError: null,
          fileSize: e.fileSize,
          width: e.width,
          height: e.height,
          checksum: e.checksum,
          modifiedAt: e.modifiedAt,
        });
      } else if (e.kind === 'ERROR' && e.extension) {
        if (e.checksum && existing.has(e.checksum)) {
          skippedExisting += 1;
          continue;
        }
        if (e.checksum) existing.add(e.checksum);
        toInsert.push({
          workspaceId,
          originalFilename: e.filename,
          originalPath: e.absolutePath,
          extension: e.extension,
          detectedFormat: null,
          mimeType: null,
          colorMode: null,
          metadataStatus: 'FAILED' as const,
          metadataError:
            e.error?.split(e.absolutePath).join(e.filename) ?? 'Metadata extraction failed.',
          fileSize: e.fileSize,
          width: 0,
          height: 0,
          checksum: e.checksum ?? '',
          modifiedAt: e.modifiedAt,
          status: 'ERROR' as const,
        });
      }
    }

    const inserted = imageRepo.insertImages(toInsert);
    imageRepo.upsertSourceImageDuplicates(duplicateInputs);
    workspaceRepo.touchWorkspace(workspaceId);
    revalidatePath(`/workspace/${workspaceId}`);

    return {
      ok: true,
      scanned: result.entries.length,
      supported: result.supported,
      duplicates: result.duplicates,
      unsupported: result.unsupported,
      errors: result.errors,
      imported: inserted.length,
      skippedExisting,
    };
  } catch (err) {
    return { ...empty, error: (err as Error).message };
  }
}

/**
 * Output-path scan summary — the read-only counterpart to the source scan.
 *
 * Reports what has actually been written to the workspace's DeshiA_Output tree
 * (RAW / ANNOTATED images + annotation files / VISUALIZATIONS) so the annotator
 * can confirm the exported dataset on disk, independent of the DB status counts.
 * Reads only; never writes and never touches the read-only source tree.
 */
export interface OutputScanSummary {
  ok: boolean;
  error?: string;
  /** Whether a DeshiA_Output tree exists under the workspace output folder. */
  exists: boolean;
  outputRoot: string;
  rawImages: number;
  annotatedImages: number;
  annotationFiles: number;
  visualizations: number;
  hasClassesTxt: boolean;
  totalBytes: number;
  /** Per-class → per-view breakdown, in schema declaration order. */
  classes: OutputClassCounts[];
}

// Re-exported so the dashboard can type the breakdown from one place.
export type { OutputClassCounts, OutputViewCounts };

export async function scanOutputAction(workspaceId: string): Promise<OutputScanSummary> {
  try {
    requireUser();
  } catch {
    return {
      ok: false,
      error: 'Sign in required.',
      exists: false,
      outputRoot: '',
      rawImages: 0,
      annotatedImages: 0,
      annotationFiles: 0,
      visualizations: 0,
      hasClassesTxt: false,
      totalBytes: 0,
      classes: [],
    };
  }
  ensureDatabaseReady();

  const empty: OutputScanSummary = {
    ok: false,
    exists: false,
    outputRoot: '',
    rawImages: 0,
    annotatedImages: 0,
    annotationFiles: 0,
    visualizations: 0,
    hasClassesTxt: false,
    totalBytes: 0,
    classes: [],
  };

  const ws = workspaceRepo.getWorkspace(workspaceId);
  if (!ws) return { ...empty, error: 'Workspace not found.' };

  try {
    const schema = getBuiltInSchema(ws.schemaId) ?? RICKSHAW_SCHEMA;
    const inv = await inventoryOutput(ws.outputDir, schema);
    return {
      ok: true,
      exists: inv.exists,
      outputRoot: inv.root,
      rawImages: inv.rawImages,
      annotatedImages: inv.annotatedImages,
      annotationFiles: inv.annotationFiles,
      visualizations: inv.visualizations,
      hasClassesTxt: inv.hasClassesTxt,
      totalBytes: inv.totalBytes,
      classes: inv.classes,
    };
  } catch (err) {
    return { ...empty, error: (err as Error).message };
  }
}
