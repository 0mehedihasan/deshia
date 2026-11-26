import { describe, expect, it } from 'vitest';
import { geometryVertices, simplifyFreehand, snapPoint } from './snapping';
import type { Geometry } from '@/core/geometry/types';

const size = { width: 1000, height: 500 };

describe('snapping and freehand', () => {
  it('snaps only within the pixel tolerance', () => {
    const target = { x: 0.5, y: 0.5 };
    expect(snapPoint({ x: 0.505, y: 0.5 }, [target], size, 10)).toEqual({
      point: target,
      snapped: true,
    });
    const far = snapPoint({ x: 0.8, y: 0.8 }, [target], size, 10);
    expect(far.snapped).toBe(false);
  });

  it('extracts vertices from every point-list geometry', () => {
    const polygon: Geometry = {
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    expect(geometryVertices(polygon)).toHaveLength(3);
    expect(
      geometryVertices({ kind: 'box', box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } }),
    ).toHaveLength(4);
  });

  it('downsamples a freehand path but keeps both endpoints', () => {
    const points = Array.from({ length: 20 }, (_, i) => ({ x: i / 100, y: 0.5 }));
    const simplified = simplifyFreehand(points, size, 30);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });
});
