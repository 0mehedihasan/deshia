import { describe, expect, it } from 'vitest';
import {
  clamp01,
  clampNormalizedBox,
  isValidNormalizedBox,
  normalizedArea,
  normalizedBoxFromCorners,
  normalizedToPixel,
  normalizedToVocPixels,
  pixelToNormalized,
} from '@/core/annotation/bbox';

describe('bbox', () => {
  it('clamp01 constrains to the unit interval', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(NaN)).toBe(0);
  });

  it('builds an ordered normalized box from arbitrary corners', () => {
    const box = normalizedBoxFromCorners(0.8, 0.9, 0.2, 0.1);
    expect(box).toEqual({ xMin: 0.2, yMin: 0.1, xMax: 0.8, yMax: 0.9 });
  });

  it('rejects degenerate boxes', () => {
    expect(normalizedBoxFromCorners(0.5, 0.5, 0.5, 0.5)).toBeNull();
    expect(normalizedBoxFromCorners(0.5, 0.5, 0.5000001, 0.9)).toBeNull();
  });

  it('validates the invariant 0<=min<max<=1', () => {
    expect(isValidNormalizedBox({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 })).toBe(true);
    expect(isValidNormalizedBox({ xMin: 0.2, yMin: 0.2, xMax: 0.1, yMax: 0.9 })).toBe(false);
    expect(isValidNormalizedBox({ xMin: -0.1, yMin: 0, xMax: 0.5, yMax: 0.5 })).toBe(false);
    expect(isValidNormalizedBox({ xMin: 0, yMin: 0, xMax: 1.1, yMax: 0.5 })).toBe(false);
  });

  it('clamps out-of-range boxes back into the unit square', () => {
    const clamped = clampNormalizedBox({ xMin: -0.2, yMin: 0.1, xMax: 1.2, yMax: 0.9 });
    expect(clamped).toEqual({ xMin: 0, yMin: 0.1, xMax: 1, yMax: 0.9 });
  });

  it('converts normalized ↔ pixel', () => {
    const size = { width: 800, height: 600 };
    const px = normalizedToPixel({ xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.8 }, size);
    expect(px).toEqual({ xMin: 80, yMin: 120, xMax: 400, yMax: 480 });
    const back = pixelToNormalized(px, size);
    expect(back.xMin).toBeCloseTo(0.1);
    expect(back.yMax).toBeCloseTo(0.8);
  });

  it('produces valid 1-based inclusive VOC pixels', () => {
    const voc = normalizedToVocPixels({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 }, { width: 100, height: 50 });
    expect(voc).toEqual({ xmin: 1, ymin: 1, xmax: 100, ymax: 50 });
  });

  it('guarantees at least a 1px extent for tiny boxes', () => {
    const voc = normalizedToVocPixels(
      { xMin: 0.5, yMin: 0.5, xMax: 0.5001, yMax: 0.5001 },
      { width: 100, height: 100 },
    );
    expect(voc.xmax).toBeGreaterThanOrEqual(voc.xmin);
    expect(voc.ymax).toBeGreaterThanOrEqual(voc.ymin);
  });

  it('computes normalized area', () => {
    expect(normalizedArea({ xMin: 0, yMin: 0, xMax: 0.5, yMax: 0.5 })).toBeCloseTo(0.25);
  });

  it('throws on non-positive image size in pixelToNormalized', () => {
    expect(() => pixelToNormalized({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 }, { width: 0, height: 10 })).toThrow();
  });
});
