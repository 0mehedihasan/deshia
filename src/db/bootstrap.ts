import { isMigrated } from './client';
import { runMigrations } from './migrate';

/**
 * Ensure the database schema exists before the first data access.
 *
 * Server components / actions call this at their entry point. It is idempotent
 * (Drizzle tracks applied migrations) and cheap once the schema is present.
 * DB code stays server-side; this module is never imported by the browser.
 */

let ready = false;

export function ensureDatabaseReady(): void {
  if (ready) return;

  // Fast path: the schema is already present (created in this or a prior run).
  if (isMigrated()) {
    ready = true;
    return;
  }

  try {
    runMigrations();
  } catch (err) {
    // Next.js can run server actions concurrently, and dev HMR resets this
    // module's `ready` flag — so two requests may race into runMigrations().
    // If the schema exists now, another caller won the race and the failure is
    // benign. Otherwise surface the real cause instead of letting the promise
    // reject unhandled (which would freeze the caller's UI, e.g. autosave).
    if (!isMigrated()) {
      throw new Error(
        `Database initialization failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  ready = true;
}
