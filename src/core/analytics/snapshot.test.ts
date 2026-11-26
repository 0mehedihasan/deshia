import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeStatisticsSnapshot } from './snapshot';

let tempRoot = '';
afterEach(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = '';
});

describe('statistics snapshot', () => {
  it('writes a stable date-named JSON file with supplied calculated content', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'deshia-snapshot-'));
    const timestamp = new Date('2026-10-08T01:00:00.000Z');
    const snapshot = {
      datasetId: 'dataset',
      datasetVersion: 1,
      totalImages: 523,
      totalObjects: 1209,
    };
    const file = await writeStatisticsSnapshot(tempRoot, snapshot, timestamp);
    expect(path.basename(file)).toBe('deshia_statistics_2026-10-08.json');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(snapshot);
  });
});
