import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pure checks on the SQL source of the additive metadata migrations.
 * Executing them against a real database is part of the release verification
 * (`pnpm db:migrate` on a fresh file); keeping native SQLite out of the Vitest
 * worker pool avoids flaky worker crashes on constrained CI runners.
 */

async function migration(name: string): Promise<string> {
  return readFile(path.join(process.cwd(), 'src/db/migrations', name), 'utf8');
}

describe('image metadata migrations', () => {
  it('adds metadata fields with safe defaults for existing image rows', async () => {
    const sql = await migration('0003_add_image_metadata.sql');
    expect(sql).toMatch(/ADD `metadata_status` text DEFAULT 'PENDING' NOT NULL/);
    expect(sql).toMatch(/ADD `metadata_error` text/);
    expect(sql).toMatch(/ADD `detected_format` text/);
    expect(sql).toMatch(/ADD `mime_type` text/);
  });

  it('creates a uniquely keyed duplicate source inventory', async () => {
    const sql = await migration('0004_add_source_image_duplicates.sql');
    expect(sql).toMatch(/CREATE TABLE `source_image_duplicates`/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX `source_image_duplicates_path_uq`/);
    expect(sql).toMatch(/ON UPDATE no action ON DELETE set null/);
  });

  it('adds the generalized object and video columns', async () => {
    expect(await migration('0005_annotation_objects.sql')).toMatch(
      /CREATE TABLE `annotation_objects`/,
    );
    expect(await migration('0007_video_frames.sql')).toMatch(
      /ADD `frame_number` integer DEFAULT 0 NOT NULL/,
    );
    expect(await migration('0008_save_revision.sql')).toMatch(
      /ADD `save_revision` integer DEFAULT 0 NOT NULL/,
    );
  });
});
