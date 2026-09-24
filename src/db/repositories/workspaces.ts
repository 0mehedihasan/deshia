import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { workspaces, type NewWorkspaceRow, type WorkspaceRow } from '@/db/schema';
import { newId } from './ids';

/** Workspace repository. */

export interface CreateWorkspaceInput {
  name: string;
  sourceDir: string;
  outputDir: string;
  schemaId: string;
  schemaVersion: number;
}

export function createWorkspace(input: CreateWorkspaceInput): WorkspaceRow {
  const row: NewWorkspaceRow = {
    id: newId('ws'),
    name: input.name,
    sourceDir: input.sourceDir,
    outputDir: input.outputDir,
    schemaId: input.schemaId,
    schemaVersion: input.schemaVersion,
  };
  return db.insert(workspaces).values(row).returning().get();
}

export function getWorkspace(id: string): WorkspaceRow | undefined {
  return db.select().from(workspaces).where(eq(workspaces.id, id)).get();
}

export function listWorkspaces(): WorkspaceRow[] {
  return db.select().from(workspaces).orderBy(desc(workspaces.updatedAt)).all();
}

export function mostRecentWorkspace(): WorkspaceRow | undefined {
  return db.select().from(workspaces).orderBy(desc(workspaces.updatedAt)).limit(1).get();
}

export function touchWorkspace(id: string): void {
  db.update(workspaces).set({ updatedAt: Date.now() }).where(eq(workspaces.id, id)).run();
}

/** Rename a workspace, bumping `updatedAt`. Returns the updated row (or undefined). */
export function renameWorkspace(id: string, name: string): WorkspaceRow | undefined {
  return db
    .update(workspaces)
    .set({ name, updatedAt: Date.now() })
    .where(eq(workspaces.id, id))
    .returning()
    .get();
}

/**
 * Delete a workspace and everything it owns from the database.
 *
 * Foreign keys are ON (see db/client.ts) and images/annotations/boundingBoxes/
 * exportJobs cascade from the workspace (annotationEvents cascade from images),
 * so a single delete removes the whole DB subtree in one FK-enforced step.
 *
 * This is a DB-only operation: files already written to disk — the read-only
 * source images and the DeshiA_Output folder — are intentionally left in place
 * (CLAUDE.md golden rule #2: never silently lose annotation data). Returns true
 * when a row was actually removed.
 */
export function deleteWorkspace(id: string): boolean {
  const res = db.delete(workspaces).where(eq(workspaces.id, id)).run();
  return res.changes > 0;
}

export function firstWorkspace(): WorkspaceRow | undefined {
  return db.select().from(workspaces).orderBy(asc(workspaces.createdAt)).limit(1).get();
}
