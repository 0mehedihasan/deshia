import { cookies } from 'next/headers';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { userRepo } from '@/db/repositories';
import type { UserRow } from '@/db/schema';
import { isMultiUserEnabled, SESSION_COOKIE, type Role } from './config';

/** Server-side session helpers. No-ops in the default single-user mode. */

export function currentUser(): UserRow | null {
  if (!isMultiUserEnabled()) return null;
  ensureDatabaseReady();
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userRepo.getSessionByToken(token)?.user ?? null;
}

/** Throw when multi-user mode is on and the caller has no adequate session. */
export function requireUser(roles?: readonly Role[]): UserRow | null {
  const user = currentUser();
  if (!isMultiUserEnabled()) return null;
  if (!user) throw new Error('Sign in required.');
  if (roles && !roles.includes(user.role as Role)) throw new Error('Not permitted.');
  return user;
}
