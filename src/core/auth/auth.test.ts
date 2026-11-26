import { afterEach, describe, expect, it } from 'vitest';
import { createHash, hashPassword, newSessionToken, verifyPassword } from './password';
import { isMultiUserEnabled, isRole } from './config';

describe('optional auth primitives', () => {
  const original = process.env.DESHIA_MULTIUSER;
  afterEach(() => {
    if (original === undefined) delete process.env.DESHIA_MULTIUSER;
    else process.env.DESHIA_MULTIUSER = original;
  });

  it('is off unless explicitly enabled', () => {
    delete process.env.DESHIA_MULTIUSER;
    expect(isMultiUserEnabled()).toBe(false);
    process.env.DESHIA_MULTIUSER = '1';
    expect(isMultiUserEnabled()).toBe(true);
  });

  it('validates roles strictly', () => {
    expect(isRole('ADMIN')).toBe(true);
    expect(isRole('ANNOTATOR')).toBe(true);
    expect(isRole('REVIEWER')).toBe(true);
    expect(isRole('SUPERUSER')).toBe(false);
  });

  it('hashes and verifies passwords without storing plaintext', () => {
    const hash = hashPassword('correct horse battery');
    expect(hash).toContain('pbkdf2-sha256$');
    expect(hash).not.toContain('correct horse battery');
    expect(verifyPassword('correct horse battery', hash)).toBe(true);
    expect(verifyPassword('wrong password', hash)).toBe(false);
    expect(verifyPassword('anything', 'not-a-hash')).toBe(false);
  });

  it('stores only a deterministic hash of an opaque token', () => {
    const { token, hash } = newSessionToken();
    expect(token).not.toEqual(hash);
    expect(createHash(token)).toBe(hash);
    expect(token.length).toBeGreaterThan(20);
  });
});
