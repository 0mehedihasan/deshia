import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Pure filesystem traversal for the scanner. Kept free of native-module imports
 * (no Sharp) so it stays trivially unit-testable.
 */

export interface WalkOptions {
  /** Skip dot-directories/files — default true. */
  skipHidden?: boolean;
  /** Directory names to always skip. */
  ignoreDirs?: readonly string[];
}

/** Directories never scanned (our own output + common noise). */
export const DEFAULT_IGNORE: ReadonlySet<string> = new Set([
  'DeshiA_Output',
  '.git',
  'node_modules',
  '.DS_Store',
]);

/** Recursively collect absolute file paths under `root`, sorted for determinism. */
export async function collectFiles(root: string, options: WalkOptions = {}): Promise<string[]> {
  const skipHidden = options.skipHidden ?? true;
  const ignore = new Set([...DEFAULT_IGNORE, ...(options.ignoreDirs ?? [])]);
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    const dirents = await readdir(dir, { withFileTypes: true });
    const sorted = [...dirents].sort((a, b) => a.name.localeCompare(b.name));
    for (const dirent of sorted) {
      const name = dirent.name;
      if (ignore.has(name)) continue;
      if (skipHidden && name.startsWith('.')) continue;
      const full = path.join(dir, name);
      if (dirent.isDirectory()) {
        await walk(full);
      } else if (dirent.isFile()) {
        out.push(full);
      }
    }
  }

  await walk(root);
  return out;
}
