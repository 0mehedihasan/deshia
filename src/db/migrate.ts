import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import { db, sqlite } from './client';

/**
 * Apply Drizzle migrations to the local SQLite database.
 *
 * Run via `pnpm db:migrate` (tsx) or programmatically at app startup before the
 * first DB access. Idempotent: Drizzle tracks applied migrations.
 */

const MIGRATIONS_DIR = resolve(process.env.DESHIA_MIGRATIONS_DIR ?? './src/db/migrations');

export function runMigrations(): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

// Allow direct execution: `tsx src/db/migrate.ts`.
if (require.main === module) {
  try {
    runMigrations();
    // eslint-disable-next-line no-console
    console.log(`Migrations applied from ${MIGRATIONS_DIR}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    sqlite.close();
  }
}
