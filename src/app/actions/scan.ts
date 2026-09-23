'use server';

import { revalidatePath } from 'next/cache';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { imageRepo, workspaceRepo } from '@/db/repositories';
import { scanDirectory } from '@/core/scanner/scan';

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
    const toInsert = [];
    for (const e of result.entries) {
      if (e.kind !== 'SUPPORTED') continue; // duplicates/unsupported/errors excluded
      if (e.checksum && existing.has(e.checksum)) {
        skippedExisting += 1;
        continue;
      }
      if (e.checksum && e.width && e.height && e.extension) {
        existing.add(e.checksum);
        toInsert.push({
          workspaceId,
          originalFilename: e.filename,
          originalPath: e.absolutePath,
          extension: e.extension,
          fileSize: e.fileSize,
          width: e.width,
          height: e.height,
          checksum: e.checksum,
          modifiedAt: e.modifiedAt,
        });
      }
    }

    const inserted = imageRepo.insertImages(toInsert);
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
