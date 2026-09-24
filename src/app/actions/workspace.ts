'use server';

import { stat } from 'node:fs/promises';
import { revalidatePath } from 'next/cache';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { workspaceRepo } from '@/db/repositories';
import { getBuiltInSchema, RICKSHAW_SCHEMA } from '@/schemas';
import { ensureWorkspaceOutputScaffold } from '@/core/exporter/output-tree';
import { DELETE_CONFIRM_WORD } from './workspace-constants';

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

export interface RenameWorkspaceFormInput {
  id: string;
  name: string;
}

export type RenameWorkspaceResult = { ok: true } | { ok: false; error: string };

export async function renameWorkspaceAction(
  input: RenameWorkspaceFormInput,
): Promise<RenameWorkspaceResult> {
  try {
    ensureDatabaseReady();
    const id = input.id.trim();
    const name = input.name.trim();
    if (!id) return { ok: false, error: 'Missing workspace id.' };
    if (!name) return { ok: false, error: 'Workspace name is required.' };

    const updated = workspaceRepo.renameWorkspace(id, name);
    if (!updated) return { ok: false, error: 'Workspace not found.' };
    revalidatePath('/');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface DeleteWorkspaceFormInput {
  id: string;
  /** Must equal DELETE_CONFIRM_WORD (case-insensitive) — a type-to-confirm guard. */
  confirmText: string;
}

export type DeleteWorkspaceResult = { ok: true } | { ok: false; error: string };

export async function deleteWorkspaceAction(
  input: DeleteWorkspaceFormInput,
): Promise<DeleteWorkspaceResult> {
  try {
    ensureDatabaseReady();
    const id = input.id.trim();
    if (!id) return { ok: false, error: 'Missing workspace id.' };

    // Re-check the type-to-confirm guard on the server too — never trust the
    // client to have enforced it (a mistyped/scripted call must still be safe).
    if (input.confirmText.trim().toLowerCase() !== DELETE_CONFIRM_WORD) {
      return { ok: false, error: `Type "${DELETE_CONFIRM_WORD}" to confirm deletion.` };
    }

    // DB-only delete: on-disk source images and the DeshiA_Output folder are
    // deliberately preserved (CLAUDE.md golden rule #2). FK cascade removes all
    // of this workspace's images/annotations/boxes/events/export jobs.
    const removed = workspaceRepo.deleteWorkspace(id);
    if (!removed) return { ok: false, error: 'Workspace not found.' };
    revalidatePath('/');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
