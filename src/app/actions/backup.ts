'use server';

import { copyFile, cp, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { sqlite } from '@/db/client';
import { imageRepo, workspaceRepo } from '@/db/repositories';
import { isInside, outputRoot } from '@/core/filesystem/paths';
import { sha256OfFile } from '@/core/scanner/checksum';
import { requireUser } from '@/core/auth/session';

/**
 * Local snapshot export. A single-user desktop app has no server to back up,
 * so we produce a portable folder: the SQLite database (checkpointed first),
 * the workspace output tree, and a manifest with checksums. Restoring is a
 * deliberate manual step with DeshiA closed — this action never overwrites the
 * live database, so a backup cannot destroy current work.
 */

export interface BackupResult {
  ok: boolean;
  path?: string;
  error?: string;
}

export async function backupWorkspaceAction(
  workspaceId: string,
  targetDir: string,
): Promise<BackupResult> {
  try {
    requireUser();
    ensureDatabaseReady();
    const ws = workspaceRepo.getWorkspace(workspaceId);
    if (!ws) return { ok: false, error: 'Workspace not found.' };
    if (!path.isAbsolute(targetDir)) return { ok: false, error: 'Choose an absolute folder path.' };
    const info = await stat(targetDir).catch(() => null);
    if (!info?.isDirectory()) return { ok: false, error: 'The chosen folder does not exist.' };
    if (isInside(ws.sourceDir, targetDir) || targetDir === ws.sourceDir) {
      return {
        ok: false,
        error: 'A snapshot cannot be written inside the read-only source folder.',
      };
    }
    const outputs = outputRoot(ws.outputDir);
    if (isInside(outputs, targetDir) || targetDir === outputs) {
      return { ok: false, error: 'Choose a folder outside the workspace output tree.' };
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(targetDir, `deshia-backup-${stamp}`);
    await mkdir(backupDir, { recursive: true });

    // Flush WAL before copying so the snapshot is self-contained.
    sqlite.pragma('wal_checkpoint(TRUNCATE)');
    const dbPath = path.resolve(process.env.DESHIA_DB_PATH ?? './.deshia/deshia.db');
    const dbCopy = path.join(backupDir, 'deshia.db');
    await copyFile(dbPath, dbCopy);

    let outputsCopied = false;
    const outputInfo = await stat(outputs).catch(() => null);
    if (outputInfo?.isDirectory()) {
      await cp(outputs, path.join(backupDir, 'DeshiA_Output'), { recursive: true });
      outputsCopied = true;
    }

    const manifest = {
      format: 'deshia-workspace-backup',
      version: 1,
      createdAt: Date.now(),
      workspace: {
        id: ws.id,
        name: ws.name,
        schemaId: ws.schemaId,
        schemaVersion: ws.schemaVersion,
      },
      counts: imageRepo.statusCounts(ws.id),
      database: { file: 'deshia.db', sha256: await sha256OfFile(dbCopy) },
      outputs: outputsCopied ? { directory: 'DeshiA_Output' } : { directory: null },
      restore:
        'Close DeshiA, then copy deshia.db over the application database and restore DeshiA_Output beside it.',
    };
    await writeFile(
      path.join(backupDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );
    return { ok: true, path: backupDir };
  } catch (err) {
    return { ok: false, error: (err as Error).message || 'Backup failed.' };
  }
}
