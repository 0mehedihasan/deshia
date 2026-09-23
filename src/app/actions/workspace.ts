'use server';

import { stat } from 'node:fs/promises';
import { revalidatePath } from 'next/cache';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { workspaceRepo } from '@/db/repositories';
import { getBuiltInSchema, RICKSHAW_SCHEMA } from '@/schemas';
import { ensureWorkspaceOutputScaffold } from '@/core/exporter/output-tree';

/**
 * Workspace application service (server actions).
 *
 * Orchestrates workspace creation and listing. Validation of the source/output
 * directories happens here (the UI never touches the filesystem directly);
 * persistence goes through the repository layer only.
 */

export interface CreateWorkspaceFormInput {
  name: string;
  sourceDir: string;
  outputDir: string;
  schemaId?: string;
}

export type CreateWorkspaceResult =
  | { ok: true; workspaceId: string }
  | { ok: false; error: string };

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export async function createWorkspaceAction(
  input: CreateWorkspaceFormInput,
): Promise<CreateWorkspaceResult> {
  ensureDatabaseReady();

  const name = input.name.trim();
  const sourceDir = input.sourceDir.trim();
  const outputDir = input.outputDir.trim();

  if (!name) return { ok: false, error: 'Workspace name is required.' };
  if (!sourceDir) return { ok: false, error: 'A source image folder is required.' };
  if (!outputDir) return { ok: false, error: 'An output folder is required.' };

  if (!(await isDirectory(sourceDir))) {
    return { ok: false, error: `Source folder does not exist or is not a directory:\n${sourceDir}` };
  }
  if (!(await isDirectory(outputDir))) {
    return { ok: false, error: `Output folder does not exist or is not a directory:\n${outputDir}` };
  }
  if (sourceDir === outputDir) {
    return { ok: false, error: 'Source and output folders must be different (source is read-only).' };
  }

  const schema = getBuiltInSchema(input.schemaId ?? RICKSHAW_SCHEMA.id) ?? RICKSHAW_SCHEMA;

  // Auto-create the DeshiA_Output tree now so the target layout is visible in
  // the chosen folder immediately (CLAUDE.md §10) — not only after the first
  // export. If we cannot write here, fail before creating the workspace row so
  // the user gets an actionable error instead of a broken workspace.
  try {
    await ensureWorkspaceOutputScaffold(outputDir, schema);
  } catch (err) {
    return {
      ok: false,
      error: `Could not create the output folder structure under:\n${outputDir}\n\n${(err as Error).message}`,
    };
  }

  try {
    const ws = workspaceRepo.createWorkspace({
      name,
      sourceDir,
      outputDir,
      schemaId: schema.id,
      schemaVersion: schema.version,
    });
    revalidatePath('/');
    return { ok: true, workspaceId: ws.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
