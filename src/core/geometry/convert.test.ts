import { describe, expect, it } from 'vitest';
import type { ImageSize } from '@/types/domain';
import {
  geometryBounds,
  geometryCenter,
  geometryToPolygon,
  isRotatedGeometry,
} from '@/core/geometry/convert';
import type { Geometry } from '@/core/geometry/types';

const SIZE: ImageSize = { width: 100, height: 100 };

describe('geometry convert/bounds dispatch', () => {
  it('bounds enclose each geometry kind', () => {
    const box: Geometry = { kind: 'box', box: { xMin: 0.1, yMin: 0.2, xMax: 0.4, yMax: 0.5 } };
    expect(geometryBounds(box, SIZE)).toEqual({ xMin: 0.1, yMin: 0.2, xMax: 0.4, yMax: 0.5 });

    const rot: Geometry = { kind: 'rotated_box', cx: 0.5, cy: 0.5, w: 0.4, h: 0.2, angle: 90 };
    const b = geometryBounds(rot, SIZE);
    expect(b.xMin).toBeCloseTo(0.4, 6);
    expect(b.yMax).toBeCloseTo(0.7, 6);
  });

  it('exposes an explicit polygon-vertex view per kind', () => {
    const box: Geometry = { kind: 'box', box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } };
    expect(geometryToPolygon(box, SIZE)).toHaveLength(4);
    const rot: Geometry = { kind: 'rotated_box', cx: 0.5, cy: 0.5, w: 0.4, h: 0.2, angle: 30 };
    expect(geometryToPolygon(rot, SIZE)).toHaveLength(4);
    const pt: Geometry = { kind: 'point', point: { x: 0.5, y: 0.5 } };
    expect(geometryToPolygon(pt, SIZE)).toHaveLength(1);
  });

  it('flags rotated geometry (and only when actually rotated)', () => {
    expect(
      isRotatedGeometry({ kind: 'rotated_box', cx: 0.5, cy: 0.5, w: 0.3, h: 0.3, angle: 15 }),
    ).toBe(true);
    expect(
      isRotatedGeometry({ kind: 'rotated_box', cx: 0.5, cy: 0.5, w: 0.3, h: 0.3, angle: 0 }),
    ).toBe(false);
    expect(isRotatedGeometry({ kind: 'box', box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } })).toBe(
      false,
    );
  });

  it('computes a representative center', () => {
    const c = geometryCenter(
      { kind: 'box', box: { xMin: 0, yMin: 0, xMax: 0.4, yMax: 0.6 } },
      SIZE,
    );
    expect(c.x).toBeCloseTo(0.2, 6);
    expect(c.y).toBeCloseTo(0.3, 6);
  });
});
