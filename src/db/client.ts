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

function connection(): { db: DrizzleDb; sqlite: Database.Database } {
  if (!globalThis.__deshiaDb || !globalThis.__deshiaSqlite) {
    const created = createConnection();
    globalThis.__deshiaDb = created.db;
    globalThis.__deshiaSqlite = created.sqlite;
  }
  return { db: globalThis.__deshiaDb, sqlite: globalThis.__deshiaSqlite };
}

/**
 * Lazy proxies: importing this module never opens SQLite or loads the native
 * binding. Next.js build workers import route modules during page-data
 * collection; touching native code there caused SIGSEGV on Linux CI. The real
 * connection is created on the first query at runtime.
 */
function lazy<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const value: unknown = Reflect.get(get() as object, property);
      return typeof value === 'function' ? value.bind(get()) : value;
    },
    set(_target, property, value) {
      Reflect.set(get() as object, property, value);
      return true;
    },
    has(_target, property) {
      return Reflect.has(get() as object, property);
    },
  });
}

export const db: DrizzleDb = lazy<DrizzleDb>(() => connection().db);
export const sqlite: Database.Database = lazy<Database.Database>(() => connection().sqlite);
export { schema };
export { DB_PATH };

/** True once the schema has been created (migrations applied). */
export function isMigrated(): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'")
    .get();
  return Boolean(row);
}
