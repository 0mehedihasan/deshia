import { describe, expect, it } from 'vitest';
import type { ImageSize } from '@/types/domain';
import { distanceToSegmentPx, hitTest, nearestVertex } from '@/core/geometry/hit-test';
import type { NormPoint } from '@/core/geometry/types';

const SIZE: ImageSize = { width: 100, height: 100 };

describe('hit-testing', () => {
  it('distance to a segment clamps to the endpoints', () => {
    const a: NormPoint = { x: 0, y: 0 };
    const b: NormPoint = { x: 0.1, y: 0 }; // 10px long
    expect(distanceToSegmentPx({ x: 0.05, y: 0.05 }, a, b, SIZE)).toBeCloseTo(5, 6);
    expect(distanceToSegmentPx({ x: -0.1, y: 0 }, a, b, SIZE)).toBeCloseTo(10, 6);
  });

  it('dispatches by geometry kind with a tolerance band', () => {
    const box = { kind: 'box' as const, box: { xMin: 0.3, yMin: 0.4, xMax: 0.7, yMax: 0.6 } };
    expect(hitTest(box, { x: 0.5, y: 0.5 }, SIZE)).toBe(true);
    expect(hitTest(box, { x: 0.1, y: 0.1 }, SIZE)).toBe(false);

    const point = { kind: 'point' as const, point: { x: 0.5, y: 0.5 } };
    expect(hitTest(point, { x: 0.505, y: 0.5 }, SIZE, 0.01)).toBe(true);
    expect(hitTest(point, { x: 0.6, y: 0.6 }, SIZE, 0.01)).toBe(false);

    const line = {
      kind: 'polyline' as const,
      points: [
        { x: 0, y: 0 },
        { x: 0.3, y: 0.4 },
      ],
    };
    expect(hitTest(line, { x: 0.15, y: 0.2 }, SIZE, 0.02)).toBe(true);
  });

  it('finds the nearest vertex within tolerance', () => {
    const pts: NormPoint[] = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0.5 },
    ];
    expect(nearestVertex(pts, { x: 0.01, y: 0.01 }, SIZE, 0.05)).toBe(0);
    expect(nearestVertex(pts, { x: 0.9, y: 0.9 }, SIZE, 0.05)).toBe(-1);
  });
});
