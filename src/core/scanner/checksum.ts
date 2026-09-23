import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * Content checksums for duplicate detection and integrity.
 *
 * SHA-256 over the raw file bytes. Streamed so large images don't load fully
 * into memory. Duplicate detection compares checksums, never filenames.
 */

export function sha256OfBuffer(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
