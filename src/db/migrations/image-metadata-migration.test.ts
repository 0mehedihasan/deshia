import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('image metadata migration', () => {
  it('adds metadata fields without changing existing image rows', async () => {
    const migration = await readFile(
      path.join(process.cwd(), 'src/db/migrations/0003_add_image_metadata.sql'),
      'utf8',
    );
    const db = new Database(':memory:');
    db.exec(
      `CREATE TABLE images (id text primary key, workspace_id text not null, dataset_index integer not null);`,
    );
    db.prepare('INSERT INTO images (id, workspace_id, dataset_index) VALUES (?, ?, ?)').run(
      'old-image',
      'workspace',
      0,
    );
    for (const statement of migration
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean))
      db.exec(statement);
    const columns = db.prepare('PRAGMA table_info(images)').all() as Array<{ name: string }>;
    const row = db.prepare('SELECT * FROM images WHERE id = ?').get('old-image') as Record<
      string,
      unknown
    >;
    expect(columns.map((column) => column.name)).toContain('metadata_status');
    expect(row).toMatchObject({
      id: 'old-image',
      workspace_id: 'workspace',
      dataset_index: 0,
      metadata_status: 'PENDING',
    });
    expect(row.metadata_error).toBeNull();
    db.close();
  });

  it('creates an idempotently keyed duplicate source inventory', async () => {
    const migration = await readFile(
      path.join(process.cwd(), 'src/db/migrations/0004_add_source_image_duplicates.sql'),
      'utf8',
    );
    const db = new Database(':memory:');
    db.exec(
      'CREATE TABLE workspaces (id text primary key); CREATE TABLE images (id text primary key);',
    );
    for (const statement of migration
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean))
      db.exec(statement);
    const indexes = db.prepare("PRAGMA index_list('source_image_duplicates')").all() as Array<{
      name: string;
      unique: number;
    }>;
    expect(
      indexes.some(
        (index) => index.name === 'source_image_duplicates_path_uq' && index.unique === 1,
      ),
    ).toBe(true);
    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'source_image_duplicates'",
      )
      .get();
    expect(table).toBeTruthy();
    db.close();
  });
});
