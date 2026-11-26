import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { schemaVersions, schemas, type SchemaRow, type SchemaVersionRow } from '@/db/schema';
import { validateRecursiveSchema } from '@/schemas/nodes-validate';
import type { RecursiveSchema } from '@/schemas/nodes';
import { newId } from './ids';

/**
 * Repository for user-authored recursive schemas.
 *
 * Published versions are immutable (SQLite triggers in migration 0006 keep even
 * cascades from rewriting them). Drafts can be edited until publish; a new
 * draft copies the latest definition so historical annotations keep resolving
 * against the version they were stamped with.
 */

export interface SchemaSummary {
  id: string;
  name: string;
  description: string | null;
  currentVersion: number;
  activeVersionId: string | null;
  activeStatus: 'DRAFT' | 'PUBLISHED' | null;
  labelCount: number;
}

export interface VersionSummary {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  createdAt: number;
  publishedAt: number | null;
}

function definitionOf(row: SchemaVersionRow): RecursiveSchema | null {
  try {
    const parsed = validateRecursiveSchema(JSON.parse(row.definitionJson));
    return parsed.ok ? parsed.schema : null;
  } catch {
    return null;
  }
}

function countLabels(definition: RecursiveSchema | null): number {
  if (!definition) return 0;
  const walk = (nodes: RecursiveSchema['roots']): number =>
    nodes.reduce(
      (total, node) =>
        total + (node.kind === 'label' || node.annotatable ? 1 : 0) + walk(node.children),
      0,
    );
  return walk(definition.roots);
}

/** All schemas with their active (published, else latest draft) version. */
export function listSchemas(): SchemaSummary[] {
  const rows = db.select().from(schemas).orderBy(desc(schemas.updatedAt)).all();
  return rows.flatMap((row) => {
    const active = getActiveVersion(row.id);
    return [
      {
        id: row.id,
        name: row.name,
        description: row.description,
        currentVersion: row.currentVersion,
        activeVersionId: active?.id ?? null,
        activeStatus: active ? (active.status as 'DRAFT' | 'PUBLISHED') : null,
        labelCount: countLabels(active ? definitionOf(active) : null),
      },
    ];
  });
}

export function getSchema(id: string): SchemaRow | undefined {
  return db.select().from(schemas).where(eq(schemas.id, id)).get();
}

export function listVersions(schemaId: string): VersionSummary[] {
  return db
    .select()
    .from(schemaVersions)
    .where(eq(schemaVersions.schemaId, schemaId))
    .orderBy(desc(schemaVersions.version))
    .all()
    .map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status as 'DRAFT' | 'PUBLISHED',
      createdAt: v.createdAt,
      publishedAt: v.publishedAt,
    }));
}

/** Prefer the newest PUBLISHED version; fall back to the newest DRAFT. */
export function getActiveVersion(schemaId: string): SchemaVersionRow | undefined {
  const published = db
    .select()
    .from(schemaVersions)
    .where(and(eq(schemaVersions.schemaId, schemaId), eq(schemaVersions.status, 'PUBLISHED')))
    .orderBy(desc(schemaVersions.version))
    .limit(1)
    .get();
  if (published) return published;
  return db
    .select()
    .from(schemaVersions)
    .where(and(eq(schemaVersions.schemaId, schemaId), eq(schemaVersions.status, 'DRAFT')))
    .orderBy(desc(schemaVersions.version))
    .limit(1)
    .get();
}

export function getVersion(versionId: string): SchemaVersionRow | undefined {
  return db.select().from(schemaVersions).where(eq(schemaVersions.id, versionId)).get();
}

/** Resolve a schema id to its active definition (never throws on corrupt JSON). */
export function getDefinition(schemaId: string): RecursiveSchema | null {
  const active = getActiveVersion(schemaId);
  return active ? definitionOf(active) : null;
}

export function getDefinitionByVersion(versionId: string): RecursiveSchema | null {
  const row = getVersion(versionId);
  return row ? definitionOf(row) : null;
}

/** Create a schema together with its first DRAFT version in one transaction. */
export function createSchema(input: {
  id?: string;
  name: string;
  description?: string | null;
  definition: RecursiveSchema;
}): SchemaRow {
  const id = input.id ?? newId('schema');
  const versionId = newId('sv');
  const definition = { ...input.definition, id, version: 1 };
  return db.transaction((tx) => {
    const row = tx
      .insert(schemas)
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        currentVersion: 1,
      })
      .returning()
      .get();
    tx.insert(schemaVersions)
      .values({
        id: versionId,
        schemaId: id,
        version: 1,
        status: 'DRAFT',
        definitionJson: JSON.stringify(definition),
      })
      .run();
    return row;
  });
}

/** Edit a DRAFT definition. Published rows are rejected by the DB triggers. */
export function updateDraft(versionId: string, definition: RecursiveSchema): void {
  const row = getVersion(versionId);
  if (!row) throw new Error('Schema version not found.');
  if (row.status !== 'DRAFT') throw new Error('Published schema versions cannot be edited.');
  db.update(schemaVersions)
    .set({ definitionJson: JSON.stringify(definition), updatedAt: Date.now() })
    .where(and(eq(schemaVersions.id, versionId), eq(schemaVersions.status, 'DRAFT')))
    .run();
}

/** Publish a draft. Irreversible by design — historical versions stay intact. */
export function publishVersion(versionId: string): void {
  const version = getVersion(versionId);
  if (!version) throw new Error('Schema version not found.');
  if (version.status !== 'DRAFT') throw new Error('Only draft versions can be published.');
  db.transaction((tx) => {
    const hasPublished = tx
      .select({ id: schemaVersions.id })
      .from(schemaVersions)
      .where(
        and(eq(schemaVersions.schemaId, version.schemaId), eq(schemaVersions.status, 'PUBLISHED')),
      )
      .limit(1)
      .get();
    if (hasPublished) throw new Error('This schema already has a published version.');
    tx.update(schemaVersions)
      .set({ status: 'PUBLISHED', publishedAt: Date.now(), updatedAt: Date.now() })
      .where(and(eq(schemaVersions.id, versionId), eq(schemaVersions.status, 'DRAFT')))
      .run();
    tx.update(schemas)
      .set({ currentVersion: version.version, updatedAt: Date.now() })
      .where(eq(schemas.id, version.schemaId))
      .run();
  });
}

/** Start a new draft from the latest definition. */
export function createDraft(schemaId: string): SchemaVersionRow {
  const existing = db
    .select()
    .from(schemaVersions)
    .where(eq(schemaVersions.schemaId, schemaId))
    .orderBy(desc(schemaVersions.version))
    .limit(1)
    .get();
  if (!existing) throw new Error('Schema has no versions.');
  const draft = db
    .select()
    .from(schemaVersions)
    .where(and(eq(schemaVersions.schemaId, schemaId), eq(schemaVersions.status, 'DRAFT')))
    .limit(1)
    .get();
  if (draft) throw new Error('A draft already exists for this schema.');
  const definition = definitionOf(existing);
  if (!definition) throw new Error('Latest schema definition is unreadable.');
  const nextVersion = existing.version + 1;
  const row: {
    id: string;
    schemaId: string;
    version: number;
    status: string;
    definitionJson: string;
    publishedAt: number | null;
  } = {
    id: newId('sv'),
    schemaId,
    version: nextVersion,
    status: 'DRAFT',
    definitionJson: JSON.stringify({ ...definition, version: nextVersion }),
    publishedAt: null,
  };
  db.insert(schemaVersions)
    .values({
      id: row.id,
      schemaId: row.schemaId,
      version: row.version,
      status: 'DRAFT',
      definitionJson: row.definitionJson,
    })
    .run();
  db.update(schemas)
    .set({ currentVersion: nextVersion, updatedAt: Date.now() })
    .where(eq(schemas.id, schemaId))
    .run();
  return getVersion(row.id)!;
}

/** Rename a schema (metadata only; never rewrites published definitions). */
export function renameSchema(id: string, name: string): void {
  db.update(schemas).set({ name, updatedAt: Date.now() }).where(eq(schemas.id, id)).run();
}

/** Delete a schema and its draft versions (published rows are immutable). */
export function deleteSchema(id: string): void {
  const versions = listVersions(id);
  if (versions.some((v) => v.status === 'PUBLISHED')) {
    throw new Error('Published schemas cannot be deleted.');
  }
  db.delete(schemas).where(eq(schemas.id, id)).run();
}

/** Import a validated definition, reusing a free id or generating a new one. */
export function importSchema(definition: RecursiveSchema, name?: string): SchemaRow {
  const existing = getSchema(definition.id);
  const id = existing ? newId('schema') : definition.id;
  return createSchema({
    id,
    name: name ?? definition.name,
    description: definition.description ?? null,
    definition: { ...definition, id, version: 1 },
  });
}

/** Error if a published version would be touched — used by tests/UI guards. */
export function assertVersionEditable(versionId: string): void {
  const version = getVersion(versionId);
  if (!version || version.status !== 'DRAFT') {
    throw new Error('Only an unpublished draft can be edited.');
  }
}

/** Guard against accidental duplicate drafts at the DB level. */
export function hasDraft(schemaId: string): boolean {
  return !!db
    .select({ id: schemaVersions.id })
    .from(schemaVersions)
    .where(and(eq(schemaVersions.schemaId, schemaId), eq(schemaVersions.status, 'DRAFT')))
    .limit(1)
    .get();
}

/** Count versions other than the given one (kept for reporting/cleanup checks). */
export function otherVersionCount(schemaId: string, versionId: string): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(schemaVersions)
    .where(and(eq(schemaVersions.schemaId, schemaId), ne(schemaVersions.id, versionId)))
    .get();
  return result?.count ?? 0;
}
