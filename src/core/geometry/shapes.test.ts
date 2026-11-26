import { describe, expect, it } from 'vitest';
import type { ImageSize } from '@/types/domain';
import {
  insertVertex,
  isValidPolygon,
  isValidPolyline,
  isValidPoint,
  moveVertex,
  moveVertices,
  movePoint,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polylineLengthPx,
  removeVertex,
  rotateVertices,
  vertexBounds,
} from '@/core/geometry/shapes';
import type { NormPoint } from '@/core/geometry/types';

const SIZE: ImageSize = { width: 100, height: 100 };
const SQUARE: NormPoint[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 0.5, y: 0.5 },
  { x: 0, y: 0.5 },
];

describe('polygon math', () => {
  it('computes shoelace area and centroid', () => {
    expect(polygonArea(SQUARE)).toBeCloseTo(0.25, 6);
    expect(polygonCentroid(SQUARE).x).toBeCloseTo(0.25, 6);
    expect(polygonCentroid(SQUARE).y).toBeCloseTo(0.25, 6);
  });
  it('point-in-polygon via ray casting', () => {
    expect(pointInPolygon(SQUARE, { x: 0.25, y: 0.25 })).toBe(true);
    expect(pointInPolygon(SQUARE, { x: 0.9, y: 0.9 })).toBe(false);
  });
  it('rejects degenerate polygons', () => {
    expect(isValidPolygon(SQUARE)).toBe(true);
    expect(
      isValidPolygon([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBe(false);
    expect(
      isValidPolygon([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).toBe(false);
  });
  it('rotation about the centroid preserves area', () => {
    const rot = rotateVertices(SQUARE, 37, SIZE, polygonCentroid(SQUARE));
    expect(polygonArea(rot)).toBeCloseTo(0.25, 6);
  });
});

describe('vertex editing', () => {
  it('inserts, removes (with a floor), and moves vertices', () => {
    expect(insertVertex(SQUARE, 0, { x: 0.9, y: 0.1 })).toHaveLength(5);
    expect(removeVertex(SQUARE, 0, 4)).toHaveLength(4); // guarded at min
    expect(removeVertex(SQUARE, 0, 3)).toHaveLength(3);
    expect(moveVertex(SQUARE, 1, { x: 0.6, y: 0 })[1]!.x).toBeCloseTo(0.6, 6);
    expect(moveVertices(SQUARE, 0.1, 0.1)[0]!.x).toBeCloseTo(0.1, 6);
  });
  it('bounds enclose all vertices', () => {
    const b = vertexBounds(SQUARE);
    expect(b.xMin).toBe(0);
    expect(b.xMax).toBe(0.5);
  });
});

describe('polyline + point', () => {
  const line: NormPoint[] = [
    { x: 0, y: 0 },
    { x: 0.3, y: 0.4 },
  ];
  it('measures polyline length in pixels (3-4-5 triangle)', () => {
    expect(polylineLengthPx(line, SIZE)).toBeCloseTo(50, 6);
    expect(isValidPolyline(line)).toBe(true);
    expect(isValidPolyline([{ x: 0.2, y: 0.2 }])).toBe(false);
  });
  it('moves points and validates finiteness', () => {
    expect(movePoint({ x: 0.1, y: 0.2 }, 0.1, 0.1).x).toBeCloseTo(0.2, 6);
    expect(isValidPoint({ x: 0.1, y: 0.2 })).toBe(true);
    expect(isValidPoint({ x: NaN, y: 0 })).toBe(false);
  });
});
