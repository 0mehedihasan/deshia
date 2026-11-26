import { describe, expect, it } from 'vitest';
import type { ImageSize } from '@/types/domain';
import {
  isValidRotatedBox,
  normalizeAngle,
  pointInRotatedBox,
  resetRotation,
  resizeRotatedBox,
  rotateRotatedBox,
  rotatedBoxBounds,
  rotatedBoxCenter,
  rotatedBoxCorners,
  rotatedFromBox,
  rotatedToPolygon,
  setRotatedBoxAngle,
  signedAngle,
} from '@/core/geometry/rotated-box';

const SIZE: ImageSize = { width: 100, height: 100 };
const BOX = { xMin: 0.3, yMin: 0.4, xMax: 0.7, yMax: 0.6 };

describe('rotated-box angle normalization', () => {
  it('normalizes into [0,360) and collapses full turns', () => {
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(720)).toBe(0);
    expect(normalizeAngle(-0)).toBe(0);
  });
  it('produces a signed display angle in (-180,180]', () => {
    expect(signedAngle(350)).toBe(-10);
    expect(signedAngle(180)).toBe(180);
    expect(signedAngle(190)).toBe(-170);
  });
});

describe('rotated-box geometry', () => {
  it('builds an angle-0 box whose bounds equal the source AABB', () => {
    const r = rotatedFromBox(BOX);
    expect(r.angle).toBe(0);
    const b = rotatedBoxBounds(r, SIZE);
    expect(b.xMin).toBeCloseTo(0.3, 6);
    expect(b.yMin).toBeCloseTo(0.4, 6);
    expect(b.xMax).toBeCloseTo(0.7, 6);
    expect(b.yMax).toBeCloseTo(0.6, 6);
  });

  it('rotates about the center (pivot preserved) and swaps extents at 90°', () => {
    const r = setRotatedBoxAngle(rotatedFromBox(BOX), 90);
    expect(rotatedBoxCenter(r).x).toBeCloseTo(0.5, 6);
    expect(rotatedBoxCenter(r).y).toBeCloseTo(0.5, 6);
    const b = rotatedBoxBounds(r, SIZE);
    expect(b.xMin).toBeCloseTo(0.4, 6);
    expect(b.xMax).toBeCloseTo(0.6, 6);
    expect(b.yMin).toBeCloseTo(0.3, 6);
    expect(b.yMax).toBeCloseTo(0.7, 6);
  });

  it('rotateRotatedBox accumulates and normalizes the angle', () => {
    const r = rotateRotatedBox(rotatedFromBox(BOX), 400);
    expect(r.angle).toBeCloseTo(40, 6);
    expect(resetRotation(r).angle).toBe(0);
  });
});

describe('rotated-box hit-testing (pivot-correct)', () => {
  it('includes the center and respects the rotated extents', () => {
    const r = rotatedFromBox(BOX);
    expect(pointInRotatedBox(r, { x: 0.5, y: 0.5 }, SIZE)).toBe(true);
    expect(pointInRotatedBox(r, { x: 0.69, y: 0.5 }, SIZE)).toBe(true);
    expect(pointInRotatedBox(r, { x: 0.72, y: 0.5 }, SIZE)).toBe(false);
    const r90 = setRotatedBoxAngle(r, 90);
    expect(pointInRotatedBox(r90, { x: 0.5, y: 0.69 }, SIZE)).toBe(true);
    expect(pointInRotatedBox(r90, { x: 0.5, y: 0.72 }, SIZE)).toBe(false);
  });
});

describe('rotated-box resize + export conversion', () => {
  it('resizes a corner while keeping the opposite corner fixed', () => {
    const r = resizeRotatedBox(rotatedFromBox(BOX), 0, { x: 0.3, y: 0.3 }, SIZE);
    expect(r.cx).toBeCloseTo(0.5, 6);
    expect(r.cy).toBeCloseTo(0.45, 6);
    expect(r.w).toBeCloseTo(0.4, 6);
    expect(r.h).toBeCloseTo(0.3, 6);
  });
  it('never collapses below the minimum pixel extent', () => {
    const r = resizeRotatedBox(rotatedFromBox(BOX), 0, { x: 0.7, y: 0.6 }, SIZE, 2);
    expect(r.w * SIZE.width).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(r.h * SIZE.height).toBeGreaterThanOrEqual(2 - 1e-9);
  });
  it('converts to a 4-vertex polygon, preserving rotation (no silent AABB)', () => {
    const r = setRotatedBoxAngle(rotatedFromBox(BOX), 30);
    const poly = rotatedToPolygon(r, SIZE);
    expect(poly.kind).toBe('polygon');
    expect(poly.points).toHaveLength(4);
    expect(rotatedBoxCorners(r, SIZE)).toHaveLength(4);
  });
  it('validates structural integrity', () => {
    expect(isValidRotatedBox(rotatedFromBox(BOX))).toBe(true);
    expect(
      isValidRotatedBox({ kind: 'rotated_box', cx: 0.5, cy: 0.5, w: 0, h: 0.2, angle: 0 }),
    ).toBe(false);
  });
});
