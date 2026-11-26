import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, users, type SessionRow, type UserRow } from '@/db/schema';
import { createHash } from '@/core/auth/password';
import type { Role } from '@/core/auth/config';
import { newId } from './ids';

/** User and session repository — only used when multi-user mode is enabled. */

export function getUserByEmail(email: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
}

export function getUserById(id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function listUsers(): UserRow[] {
  return db.select().from(users).orderBy(users.createdAt).all();
}

export function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
}): UserRow {
  return db
    .insert(users)
    .values({
      id: newId('usr'),
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      role: input.role,
    })
    .returning()
    .get();
}

export function createSession(userId: string, tokenHash: string, expiresAt: number): SessionRow {
  return db
    .insert(sessions)
    .values({ id: newId('ses'), userId, tokenHash, expiresAt })
    .returning()
    .get();
}

export function getSessionByToken(
  token: string,
): { session: SessionRow; user: UserRow } | undefined {
  const session = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, createHash(token)), gt(sessions.expiresAt, Date.now())))
    .get();
  if (!session) return undefined;
  const user = getUserById(session.userId);
  if (!user || !user.active) return undefined;
  return { session, user };
}

export function deleteSession(token: string): void {
  db.delete(sessions)
    .where(eq(sessions.tokenHash, createHash(token)))
    .run();
}

export function pruneExpiredSessions(): void {
  db.delete(sessions).where(eq(sessions.expiresAt, Date.now())).run();
}
