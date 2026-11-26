/**
 * Optional multi-user mode. DeshiA is intentionally single-user/offline by
 * default. Setting DESHIA_MULTIUSER=1 enables sign-in, roles and the admin user
 * screen; nothing in the default path depends on sessions.
 */
export function isMultiUserEnabled(): boolean {
  return process.env.DESHIA_MULTIUSER === '1';
}

export const SESSION_COOKIE = 'deshia_session';
export const SESSION_DAYS = 30;
export const ROLES = ['ADMIN', 'ANNOTATOR', 'REVIEWER'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
