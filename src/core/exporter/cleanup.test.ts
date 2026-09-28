import { describe, expect, it } from 'vitest';
import { computeOrphanPaths } from '@/core/exporter/cleanup';

describe('computeOrphanPaths', () => {
  it('returns paths in the old export that are absent from the new one', () => {
    const oldRel = [
      'DeshiA_Output/RAW/rickshaw/front/raw_rickshaw_front_001.jpg',
      'DeshiA_Output/ANNOTATED/rickshaw/front/images/annotated_rickshaw_front_001.jpg',
    ];
    const newRel = [
      'DeshiA_Output/RAW/rickshaw/side/raw_rickshaw_side_001.jpg',
      'DeshiA_Output/ANNOTATED/rickshaw/side/images/annotated_rickshaw_side_001.jpg',
    ];
    expect(computeOrphanPaths(oldRel, newRel)).toEqual(oldRel);
  });

  it('returns nothing when the class/view is unchanged (overwrite in place)', () => {
    const paths = [
      'DeshiA_Output/RAW/rickshaw/front/raw_rickshaw_front_001.jpg',
      'DeshiA_Output/ANNOTATED/rickshaw/front/images/annotated_rickshaw_front_001.jpg',
    ];
    expect(computeOrphanPaths(paths, paths)).toEqual([]);
  });

  it('retains dataset-level files shared across folders (e.g. classes.txt)', () => {
    const shared = 'DeshiA_Output/ANNOTATED/classes.txt';
    const oldRel = ['DeshiA_Output/RAW/rickshaw/front/raw_rickshaw_front_001.jpg', shared];
    const newRel = ['DeshiA_Output/RAW/rickshaw/back/raw_rickshaw_back_001.jpg', shared];
    const orphans = computeOrphanPaths(oldRel, newRel);
    expect(orphans).not.toContain(shared);
    expect(orphans).toEqual(['DeshiA_Output/RAW/rickshaw/front/raw_rickshaw_front_001.jpg']);
  });

  it('de-duplicates repeated old paths', () => {
    const oldRel = ['a.jpg', 'a.jpg', 'b.jpg'];
    expect(computeOrphanPaths(oldRel, [])).toEqual(['a.jpg', 'b.jpg']);
  });

  it('handles an empty previous export', () => {
    expect(computeOrphanPaths([], ['x.jpg'])).toEqual([]);
  });
});
