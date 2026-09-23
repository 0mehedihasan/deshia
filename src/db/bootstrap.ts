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
  if (!isMigrated()) {
    runMigrations();
  }
  ready = true;
}
