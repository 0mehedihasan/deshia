import { describe, expect, it } from 'vitest';
import { createStoredZip, crc32 } from './zip';

describe('stored ZIP writer', () => {
  it('computes a stable CRC32', () => {
    expect(crc32(Buffer.from('hello'))).toBe(0x3610a686);
  });

  it('writes local headers, central directory and EOCD', () => {
    const zip = createStoredZip([
      { name: 'annotations.xml', data: Buffer.from('<annotation/>') },
      { name: 'images/a.jpg', data: Buffer.from('image-bytes') },
    ]);
    expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(zip.includes(Buffer.from('annotations.xml'))).toBe(true);
    expect(zip.includes(Buffer.from('images/a.jpg'))).toBe(true);
    expect(zip.subarray(-22, -18).toString('hex')).toBe('504b0506');
  });
});
