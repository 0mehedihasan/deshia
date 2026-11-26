import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

/** PBKDF2-SHA256 password hashing. Self-describing format, no new dependency. */
const ITERATIONS = 310_000;
const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256').toString('hex');
  return `pbkdf2-sha256$${ITERATIONS}$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const expected = Buffer.from(parts[3]!, 'hex');
  const actual = pbkdf2Sync(password, parts[2]!, iterations, expected.length, 'sha256');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Opaque session token and its one-way hash. */
export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: createHash(token) };
}

export function createHash(token: string): string {
  // Reuse PBKDF2 with a fixed local salt for token hashing (never store tokens).
  return pbkdf2Sync(token, 'deshia-session', 1000, 32, 'sha256').toString('hex');
}
