'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { userRepo } from '@/db/repositories';
import { hashPassword, newSessionToken, verifyPassword } from '@/core/auth/password';
import {
  isMultiUserEnabled,
  isRole,
  SESSION_COOKIE,
  SESSION_DAYS,
  type Role,
} from '@/core/auth/config';
import { currentUser, requireUser } from '@/core/auth/session';

export type AuthResult = { ok: boolean; error?: string };

function disabled(): AuthResult {
  return { ok: false, error: 'Multi-user mode is disabled. Set DESHIA_MULTIUSER=1 to enable it.' };
}

export async function loginAction(email: string, password: string): Promise<AuthResult> {
  if (!isMultiUserEnabled()) return disabled();
  try {
    ensureDatabaseReady();
    userRepo.pruneExpiredSessions();
    const user = userRepo.getUserByEmail(email);
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    const { token, hash } = newSessionToken();
    userRepo.createSession(user.id, hash, Date.now() + SESSION_DAYS * 86_400_000);
    cookies().set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DAYS * 86_400,
      path: '/',
    });
    revalidatePath('/');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function logoutAction(): Promise<AuthResult> {
  if (!isMultiUserEnabled()) return disabled();
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) userRepo.deleteSession(token);
  cookies().delete(SESSION_COOKIE);
  revalidatePath('/');
  return { ok: true };
}

export async function currentUserAction(): Promise<{
  enabled: boolean;
  user: { id: string; email: string; name: string; role: string } | null;
}> {
  if (!isMultiUserEnabled()) return { enabled: false, user: null };
  const user = currentUser();
  return {
    enabled: true,
    user: user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null,
  };
}

export async function listUsersAction(): Promise<
  | {
      ok: true;
      users: Array<{ id: string; email: string; name: string; role: string; active: boolean }>;
    }
  | AuthResult
> {
  if (!isMultiUserEnabled()) return disabled();
  try {
    requireUser(['ADMIN']);
    ensureDatabaseReady();
    return {
      ok: true,
      users: userRepo.listUsers().map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        active: u.active,
      })),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function createUserAction(input: {
  email: string;
  name: string;
  password: string;
  role: string;
}): Promise<AuthResult> {
  if (!isMultiUserEnabled()) return disabled();
  try {
    requireUser(['ADMIN']);
    if (input.password.length < 8)
      return { ok: false, error: 'Password must be at least 8 characters.' };
    if (!isRole(input.role)) return { ok: false, error: 'Unknown role.' };
    ensureDatabaseReady();
    if (userRepo.getUserByEmail(input.email)) return { ok: false, error: 'Email already in use.' };
    userRepo.createUser({
      email: input.email,
      name: input.name,
      passwordHash: hashPassword(input.password),
      role: input.role as Role,
    });
    revalidatePath('/admin/users');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Bootstrap helper: creates the first ADMIN when the table is empty. */
export async function bootstrapAdminAction(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AuthResult> {
  if (!isMultiUserEnabled()) return disabled();
  try {
    ensureDatabaseReady();
    if (userRepo.listUsers().length > 0)
      return { ok: false, error: 'An administrator already exists.' };
    if (input.password.length < 8)
      return { ok: false, error: 'Password must be at least 8 characters.' };
    userRepo.createUser({
      email: input.email,
      name: input.name,
      passwordHash: hashPassword(input.password),
      role: 'ADMIN',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
