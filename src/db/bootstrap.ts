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

  // Always run the migrator — do NOT short-circuit on "the schema already
  // exists". Drizzle's migrate() is idempotent: it records applied migrations
  // in its own tracking table and runs only the ones still pending. Running it
  // every cold start is what lets a newly added migration (e.g.
  // 0001_add_redactions) reach a database that already has the older tables.
  // A "fast path" that returned as soon as the base tables existed would strand
  // every migration after the first on any pre-existing database — which is
  // exactly how the `redactions` column went missing on already-populated DBs.
  try {
    runMigrations();
  } catch (err) {
    // Next.js can run server actions concurrently, and dev HMR resets this
    // module's `ready` flag — so two requests may race into runMigrations().
    // If the base schema exists now, another caller won the race and the
    // failure is benign. Otherwise surface the real cause instead of letting
    // the promise reject unhandled (which would freeze the caller's UI, e.g.
    // autosave).
    if (!isMigrated()) {
      throw new Error(
        `Database initialization failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  ready = true;
}
