/**
 * Shared workspace-action constants.
 *
 * Kept out of `workspace.ts` because that file is a `'use server'` module, where
 * only async functions may be exported. This plain module carries the values that
 * both the server action and the client welcome screen need to agree on.
 */

/** The exact word a user must type to confirm a destructive workspace delete. */
export const DELETE_CONFIRM_WORD = 'delete';
