import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertInside, outputRoot } from '@/core/filesystem/paths';

export async function writeStatisticsSnapshot(
  outputDir: string,
  snapshot: unknown,
  timestamp = new Date(),
): Promise<string> {
  const root = outputRoot(outputDir);
  const directory = path.join(root, 'STATISTICS');
  const filename = `deshia_statistics_${timestamp.toISOString().slice(0, 10)}.json`;
  const target = path.join(directory, filename);
  assertInside(root, target);
  await mkdir(directory, { recursive: true });
  await writeFile(target, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  return target;
}
