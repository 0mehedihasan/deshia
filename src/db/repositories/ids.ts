import { randomUUID } from 'node:crypto';

/** Prefixed, sortable-enough unique ids for DB rows. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
