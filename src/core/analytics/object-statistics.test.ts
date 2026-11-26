import { describe, expect, it } from 'vitest';
import { computeObjectStatistics, objectStatisticsMarkdown } from './object-statistics';
import { createObject } from '@/core/annotation/objects';

const box = { kind: 'box' as const, box: { xMin: 0, yMin: 0, xMax: 0.5, yMax: 0.5 } };

describe('object statistics', () => {
  it('aggregates geometry, labels, flags and tracks', () => {
    const a = createObject({ id: 'a', labelId: 'car', labelName: 'Car', geometry: box, zOrder: 0 });
    a.occluded = true;
    a.attributes.color = 'red';
    const b = createObject({
      id: 'b',
      labelId: 'car',
      labelName: 'Car',
      geometry: box,
      zOrder: 1,
      frameNumber: 3,
    });
    b.trackId = 't1';
    const stats = computeObjectStatistics([a, b]);
    expect(stats.total).toBe(2);
    expect(stats.byGeometry.RECTANGLE).toBe(2);
    expect(stats.byLabel.Car).toBe(2);
    expect(stats.occluded).toBe(1);
    expect(stats.trackCount).toBe(1);
    expect(stats.distinctFrames).toBe(2);
    expect(stats.objectsWithAttributes).toBe(1);
  });

  it('renders a Markdown report', () => {
    const report = objectStatisticsMarkdown(computeObjectStatistics([]));
    expect(report).toContain('# DeshiA object statistics');
    expect(report).toContain('| — | 0 |');
  });
});
