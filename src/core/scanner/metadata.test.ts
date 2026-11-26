import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeSourceImage, readImageMetadata } from './metadata';
import { sha256OfFile } from './checksum';
import { scanDirectory } from './scan';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

async function fixture(
  extension: 'jpg' | 'png' | 'webp',
  width: number,
  height: number,
): Promise<string> {
  root = await mkdtemp(path.join(os.tmpdir(), 'deshia-image-metadata-'));
  const file = path.join(root, `sample.${extension}`);
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 34, b: 56 } },
  });
  const encoded =
    extension === 'jpg'
      ? await image.jpeg().toBuffer()
      : extension === 'png'
        ? await image.png().toBuffer()
        : await image.webp().toBuffer();
  await writeFile(file, encoded);
  return file;
}

describe('original image metadata', () => {
  it.each([
    ['jpg', 'jpeg', 'image/jpeg'],
    ['png', 'png', 'image/png'],
    ['webp', 'webp', 'image/webp'],
  ] as const)(
    'reads %s headers and exact dimensions',
    async (extension, detectedFormat, mimeType) => {
      const file = await fixture(extension, 1, 1);
      const metadata = await readImageMetadata(file);
      expect(metadata).toMatchObject({ width: 1, height: 1, detectedFormat, mimeType });
      expect(metadata.colorMode).toMatch(/3 channels/);
    },
  );

  it('hashes original bytes and reports corrupt files as scan errors', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'deshia-image-corrupt-'));
    const file = path.join(root, 'bad.jpg');
    await writeFile(file, 'not an image');
    const firstHash = await sha256OfFile(file);
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(readImageMetadata(file)).rejects.toThrow();
    const scan = await scanDirectory(root);
    expect(scan.errors).toBe(1);
    expect(scan.entries[0]).toMatchObject({
      kind: 'ERROR',
      filename: 'bad.jpg',
      checksum: firstHash,
    });
  });

  it('does not trust unsupported suffixes even when content is a valid image', async () => {
    const jpg = await fixture('jpg', 3, 2);
    const renamed = path.join(root, 'renamed.tiff');
    const { copyFile } = await import('node:fs/promises');
    await copyFile(jpg, renamed);
    await expect(readImageMetadata(renamed)).rejects.toThrow('Unsupported image extension');
  });

  it('detects a changed source checksum without modifying source bytes', async () => {
    const file = await fixture('jpg', 4, 3);
    const expected = await sha256OfFile(file);
    await writeFile(
      file,
      await sharp({ create: { width: 5, height: 3, channels: 3, background: 'red' } })
        .jpeg()
        .toBuffer(),
    );
    const changed = await sha256OfFile(file);
    expect(changed).not.toBe(expected);
    await expect(analyzeSourceImage(file, expected)).rejects.toThrow('Source checksum mismatch');
    expect(await sha256OfFile(file)).toBe(changed);
  });

  it('reports a deleted original file without recreating or replacing it', async () => {
    const file = await fixture('png', 2, 2);
    await rm(file);
    await expect(analyzeSourceImage(file)).rejects.toThrow();
  });

  it.skipIf(!process.env.DESHIA_HEIF_FIXTURE)(
    'reads HEIC/HEIF when a local fixture and Sharp codec are available',
    async () => {
      const metadata = await readImageMetadata(process.env.DESHIA_HEIF_FIXTURE!);
      expect(['heif', 'heic']).toContain(metadata.detectedFormat);
      expect(['image/heif', 'image/heic']).toContain(metadata.mimeType);
    },
  );
});
