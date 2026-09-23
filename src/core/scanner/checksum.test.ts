import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sha256OfBuffer, sha256OfFile } from '@/core/scanner/checksum';

describe('checksum', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it('hashes buffers deterministically (SHA-256)', () => {
    // Known vector: sha256("")
    expect(sha256OfBuffer(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256OfBuffer(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches file and buffer hashes and detects duplicates by content', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'deshia-sum-'));
    dirs.push(dir);
    const p1 = path.join(dir, 'one.bin');
    const p2 = path.join(dir, 'two.bin');
    const p3 = path.join(dir, 'diff.bin');
    await writeFile(p1, 'same-content');
    await writeFile(p2, 'same-content');
    await writeFile(p3, 'different');
    const h1 = await sha256OfFile(p1);
    const h2 = await sha256OfFile(p2);
    const h3 = await sha256OfFile(p3);
    expect(h1).toBe(h2); // duplicates share a checksum
    expect(h1).not.toBe(h3);
    expect(h1).toBe(sha256OfBuffer(new TextEncoder().encode('same-content')));
  });
});
