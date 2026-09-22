import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

// Hard guard: this module wraps a native SQLite binding and must never be
// pulled into a client bundle. Importing it in the browser is a programming
// error, so fail loudly rather than shipping DB code to the webview.
if (typeof window !== 'undefined') {
  throw new Error('src/db/client.ts is server-only and must not be imported in the browser.');
}

/**
 * Singleton SQLite connection.
 *
 * DeshiA runs the database in the Next.js Node runtime (server components,
 * route handlers, server actions) — never in the browser/webview. The `drizzle`
 * instance is cached on `globalThis` to survive Next dev hot-reloads.
 */

const DB_PATH = resolve(process.env.DESHIA_DB_PATH ?? './.deshia/deshia.db');

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __deshiaDb: DrizzleDb | undefined;
  // eslint-disable-next-line no-var
  var __deshiaSqlite: Database.Database | undefined;
}

function createConnection(): { db: DrizzleDb; sqlite: Database.Database } {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  // Durability + concurrency settings appropriate for a local desktop app.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

if (!globalThis.__deshiaDb) {
  const { db, sqlite } = createConnection();
  globalThis.__deshiaDb = db;
  globalThis.__deshiaSqlite = sqlite;
}

export const db: DrizzleDb = globalThis.__deshiaDb;
export const sqlite: Database.Database = globalThis.__deshiaSqlite!;
export { schema };
export { DB_PATH };

/** True once the schema has been created (migrations applied). */
export function isMigrated(): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'")
    .get();
  return Boolean(row);
}
