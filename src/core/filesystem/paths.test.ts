import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertInside,
  exportTargetDirs,
  isInside,
  outputRoot,
  safeSegment,
} from '@/core/filesystem/paths';

describe('filesystem paths', () => {
  it('sanitizes path segments', () => {
    expect(safeSegment('Rickshaw')).toBe('rickshaw');
    expect(safeSegment('E Rickshaw')).toBe('e_rickshaw');
    expect(safeSegment('side/../etc')).toBe('side_etc');
    expect(() => safeSegment('..')).toThrow();
    expect(() => safeSegment('///')).toThrow();
  });

  it('builds the output tree under DeshiA_Output', () => {
    const out = '/work/out';
    expect(outputRoot(out)).toBe(path.join(out, 'DeshiA_Output'));
    const dirs = exportTargetDirs(out, 'rickshaw', 'side');
    expect(dirs.raw).toBe(path.join(out, 'DeshiA_Output', 'RAW', 'rickshaw', 'side'));
    expect(dirs.annotatedImages).toBe(
      path.join(out, 'DeshiA_Output', 'ANNOTATED', 'rickshaw', 'side', 'images'),
    );
    expect(dirs.annotatedAnnotations).toBe(
      path.join(out, 'DeshiA_Output', 'ANNOTATED', 'rickshaw', 'side', 'annotations'),
    );
    expect(dirs.visualizations).toBe(
      path.join(out, 'DeshiA_Output', 'VISUALIZATIONS', 'rickshaw', 'side'),
    );
  });

  it('confines writes to the output root', () => {
    const root = '/work/out/DeshiA_Output';
    expect(isInside(root, path.join(root, 'RAW', 'a.jpg'))).toBe(true);
    expect(isInside(root, '/work/out/other/a.jpg')).toBe(false);
    expect(isInside(root, '/etc/passwd')).toBe(false);
    expect(() => assertInside(root, path.join(root, '..', 'escape.jpg'))).toThrow();
  });
});
