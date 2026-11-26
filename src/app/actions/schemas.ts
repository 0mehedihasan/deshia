'use server';

import { revalidatePath } from 'next/cache';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { schemaRepo, workspaceRepo } from '@/db/repositories';
import { parseRecursiveSchemaJson, serializeRecursiveSchema } from '@/schemas/nodes-validate';
import type { RecursiveSchema } from '@/schemas/nodes';
import { requireUser } from '@/core/auth/session';

/**
 * Schema application services. A single user edits ontologies locally; every
 * mutation goes through the repository layer and is validated before storage.
 * Published versions are immutable, so annotations keep a stable reference.
 */

export type SchemaActionResult = { ok: true; id?: string } | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: (err as Error)?.message || fallback };
}

/** Load a schema definition for the editor (never throws). */
export async function loadSchemaAction(schemaId: string): Promise<
  | {
      ok: true;
      definition: RecursiveSchema | null;
      versionId: string | null;
      status: 'DRAFT' | 'PUBLISHED' | null;
    }
  | { ok: false; error: string }
> {
  try {
    requireUser(['ADMIN', 'ANNOTATOR', 'REVIEWER']);
    ensureDatabaseReady();
    const version = schemaRepo.getActiveVersion(schemaId);
    const definition = schemaRepo.getDefinition(schemaId);
    return {
      ok: true,
      definition,
      versionId: version?.id ?? null,
      status: version ? (version.status as 'DRAFT' | 'PUBLISHED') : null,
    };
  } catch (err) {
    return fail(err, 'Could not load schema.');
  }
}

export async function createSchemaAction(input: {
  workspaceId: string;
  name: string;
  definition: RecursiveSchema;
}): Promise<SchemaActionResult> {
  try {
    requireUser(['ADMIN', 'ANNOTATOR', 'REVIEWER']);
    ensureDatabaseReady();
    const check = parseRecursiveSchemaJson(serializeRecursiveSchema(input.definition));
    if (!check.ok) return { ok: false, error: check.errors.join('; ') };
    const row = schemaRepo.createSchema({
      name: input.name.trim() || check.schema.name,
      description: check.schema.description ?? null,
      definition: check.schema,
    });
    workspaceRepo.setWorkspaceSchema(input.workspaceId, row.id, row.currentVersion);
    revalidatePath(`/workspace/${input.workspaceId}/schema`);
    revalidatePath(`/workspace/${input.workspaceId}/annotate`);
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err, 'Could not create schema.');
  }
}

export async function updateSchemaDraftAction(input: {
  workspaceId: string;
  versionId: string;
  definition: RecursiveSchema;
}): Promise<SchemaActionResult> {
  try {
    requireUser(['ADMIN', 'ANNOTATOR', 'REVIEWER']);
    ensureDatabaseReady();
    const check = parseRecursiveSchemaJson(serializeRecursiveSchema(input.definition));
    if (!check.ok) return { ok: false, error: check.errors.join('; ') };
    schemaRepo.updateDraft(input.versionId, check.schema);
    revalidatePath(`/workspace/${input.workspaceId}/schema`);
    revalidatePath(`/workspace/${input.workspaceId}/annotate`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save schema draft.');
  }
}

export async function publishSchemaAction(input: {
  workspaceId: string;
  versionId: string;
}): Promise<SchemaActionResult> {
  try {
    requireUser(['ADMIN', 'ANNOTATOR', 'REVIEWER']);
    ensureDatabaseReady();
    schemaRepo.publishVersion(input.versionId);
    revalidatePath(`/workspace/${input.workspaceId}/schema`);
    revalidatePath(`/workspace/${input.workspaceId}/annotate`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not publish schema.');
  }
}

export async function createSchemaDraftAction(input: {
  workspaceId: string;
  schemaId: string;
}): Promise<SchemaActionResult> {
  try {
    requireUser(['ADMIN', 'ANNOTATOR', 'REVIEWER']);
    ensureDatabaseReady();
    const version = schemaRepo.createDraft(input.schemaId);
    revalidatePath(`/workspace/${input.workspaceId}/schema`);
    return { ok: true, id: version.id };
  } catch (err) {
    return fail(err, 'Could not create a new schema draft.');
  }
}

export async function renameSchemaAction(input: {
  workspaceId: string;
  schemaId: string;
  name: string;
}): Promise<SchemaActionResult> {
  try {
    requireUser(['ADMIN', 'ANNOTATOR', 'REVIEWER']);
    ensureDatabaseReady();
    if (!input.name.trim()) return { ok: false, error: 'Name cannot be empty.' };
    schemaRepo.renameSchema(input.schemaId, input.name.trim());
    revalidatePath(`/workspace/${input.workspaceId}/schema`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not rename schema.');
  }
}

/** Delete a schema that has no published version and is not in use. */
export async function deleteSchemaAction(input: {
  workspaceId: string;
  schemaId: string;
}): Promise<SchemaActionResult> {
  try {
    requireUser(['ADMIN', 'ANNOTATOR', 'REVIEWER']);
    ensureDatabaseReady();
    const using = workspaceRepo
      .listWorkspaces()
      .filter((ws) => ws.schemaId === input.schemaId && ws.id !== input.workspaceId);
    if (using.length > 0) return { ok: false, error: 'Another workspace uses this schema.' };
    const active = schemaRepo.getActiveVersion(input.schemaId);
    if (active?.status === 'PUBLISHED') {
      return { ok: false, error: 'Published schemas are immutable and cannot be deleted.' };
    }
    schemaRepo.deleteSchema(input.schemaId);
    revalidatePath(`/workspace/${input.workspaceId}/schema`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not delete schema.');
  }
}

export async function activateSchemaAction(input: {
  workspaceId: string;
  schemaId: string;
  version: number;
}): Promise<SchemaActionResult> {
  try {
    requireUser(['ADMIN', 'ANNOTATOR', 'REVIEWER']);
    ensureDatabaseReady();
    workspaceRepo.setWorkspaceSchema(input.workspaceId, input.schemaId, input.version);
    revalidatePath(`/workspace/${input.workspaceId}/annotate`);
    revalidatePath(`/workspace/${input.workspaceId}/schema`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not activate schema.');
  }
}

export async function importSchemaAction(input: {
  workspaceId: string;
  json: string;
}): Promise<SchemaActionResult> {
  try {
    requireUser(['ADMIN', 'ANNOTATOR', 'REVIEWER']);
    ensureDatabaseReady();
    const check = parseRecursiveSchemaJson(input.json);
    if (!check.ok) return { ok: false, error: check.errors.join('; ') };
    const row = schemaRepo.importSchema(check.schema);
    workspaceRepo.setWorkspaceSchema(input.workspaceId, row.id, row.currentVersion);
    revalidatePath(`/workspace/${input.workspaceId}/schema`);
    revalidatePath(`/workspace/${input.workspaceId}/annotate`);
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err, 'Could not import schema.');
  }
}
