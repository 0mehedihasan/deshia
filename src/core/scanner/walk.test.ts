import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectFiles } from '@/core/scanner/walk';

describe('scanner walk', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'deshia-walk-'));
    await mkdir(path.join(root, 'sub'), { recursive: true });
    await mkdir(path.join(root, '.hidden'), { recursive: true });
    await mkdir(path.join(root, 'DeshiA_Output'), { recursive: true });
    await writeFile(path.join(root, 'b.jpg'), 'x');
    await writeFile(path.join(root, 'a.png'), 'x');
    await writeFile(path.join(root, 'sub', 'c.jpeg'), 'x');
    await writeFile(path.join(root, '.hidden', 'secret.jpg'), 'x');
    await writeFile(path.join(root, 'DeshiA_Output', 'out.jpg'), 'x');
    await writeFile(path.join(root, '.dotfile'), 'x');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('collects files recursively in deterministic sorted order', async () => {
    const files = (await collectFiles(root)).map((f) => path.relative(root, f));
    expect(files).toEqual(['a.png', 'b.jpg', path.join('sub', 'c.jpeg')]);
  });

  it('skips hidden entries and DeshiA_Output by default', async () => {
    const files = await collectFiles(root);
    expect(files.some((f) => f.includes('.hidden'))).toBe(false);
    expect(files.some((f) => f.includes('DeshiA_Output'))).toBe(false);
    expect(files.some((f) => f.endsWith('.dotfile'))).toBe(false);
  });

  it('can include hidden entries when asked', async () => {
    const files = await collectFiles(root, { skipHidden: false });
    expect(files.some((f) => f.includes('.hidden'))).toBe(true);
  });
});
