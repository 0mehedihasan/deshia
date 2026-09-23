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

export function firstWorkspace(): WorkspaceRow | undefined {
  return db.select().from(workspaces).orderBy(asc(workspaces.createdAt)).limit(1).get();
}
