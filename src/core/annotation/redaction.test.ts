import { describe, expect, it } from 'vitest';
import {
  clampRedaction,
  isValidRedaction,
  MAX_NORMALIZED_RADIUS,
  MIN_NORMALIZED_RADIUS,
  mosaicDownscaleSize,
  mosaicMaskedRGBA,
  redactionPixelLayout,
} from '@/core/annotation/redaction';
import type { RedactionCircle } from '@/types/domain';

function circle(overrides: Partial<RedactionCircle> = {}): RedactionCircle {
  return { id: 'r1', cx: 0.5, cy: 0.5, r: 0.1, ...overrides };
}

describe('isValidRedaction', () => {
  it('accepts an in-range circle', () => {
    expect(isValidRedaction(circle())).toBe(true);
  });

  it('rejects a non-finite coordinate', () => {
    expect(isValidRedaction(circle({ cx: Number.NaN }))).toBe(false);
    expect(isValidRedaction(circle({ r: Number.POSITIVE_INFINITY }))).toBe(false);
  });

  it('rejects an out-of-frame center', () => {
    expect(isValidRedaction(circle({ cx: -0.01 }))).toBe(false);
    expect(isValidRedaction(circle({ cy: 1.5 }))).toBe(false);
  });

  it('rejects a sub-threshold or oversized radius', () => {
    expect(isValidRedaction(circle({ r: MIN_NORMALIZED_RADIUS / 2 }))).toBe(false);
    expect(isValidRedaction(circle({ r: MAX_NORMALIZED_RADIUS + 0.1 }))).toBe(false);
  });
});

describe('clampRedaction', () => {
  it('keeps an in-range circle unchanged (preserving id)', () => {
    const c = circle({ id: 'keep' });
    expect(clampRedaction(c)).toEqual(c);
  });

  it('clamps an out-of-frame center back into 0..1', () => {
    const out = clampRedaction(circle({ cx: -0.4, cy: 1.8 }));
    expect(out).not.toBeNull();
    expect(out!.cx).toBe(0);
    expect(out!.cy).toBe(1);
  });

  it('caps an oversized radius at the max', () => {
    const out = clampRedaction(circle({ r: 5 }));
    expect(out!.r).toBe(MAX_NORMALIZED_RADIUS);
  });

  it('rejects a mis-click (sub-threshold radius) as null', () => {
    expect(clampRedaction(circle({ r: 0 }))).toBeNull();
    expect(clampRedaction(circle({ r: MIN_NORMALIZED_RADIUS / 2 }))).toBeNull();
  });

  it('rejects a non-finite center as null', () => {
    expect(clampRedaction(circle({ cx: Number.NaN }))).toBeNull();
  });
});

describe('redactionPixelLayout', () => {
  it('maps a centered circle to a pixel rectangle (radius keyed to WIDTH)', () => {
    const layout = redactionPixelLayout(circle({ cx: 0.5, cy: 0.5, r: 0.1 }), {
      width: 1000,
      height: 500,
    });
    expect(layout).not.toBeNull();
    // rPx = 0.1 * 1000 = 100; center = (500, 250).
    expect(layout!.rPx).toBe(100);
    expect(layout!.cxPx).toBe(500);
    expect(layout!.cyPx).toBe(250);
    expect(layout!.left).toBe(400);
    expect(layout!.top).toBe(150);
    expect(layout!.width).toBe(200);
    expect(layout!.height).toBe(200);
  });

  it('clamps the rectangle to the image at an edge (partial circle)', () => {
    const layout = redactionPixelLayout(circle({ cx: 0, cy: 0, r: 0.1 }), {
      width: 1000,
      height: 1000,
    });
    expect(layout).not.toBeNull();
    // Top-left corner: rect is clamped to the image, but the true center stays 0,0.
    expect(layout!.left).toBe(0);
    expect(layout!.top).toBe(0);
    expect(layout!.width).toBe(100);
    expect(layout!.height).toBe(100);
    expect(layout!.cxPx).toBe(0);
    expect(layout!.cyPx).toBe(0);
  });

  it('returns null for a degenerate (zero-size) rectangle', () => {
    const layout = redactionPixelLayout(circle({ r: 0 }), { width: 100, height: 100 });
    expect(layout).toBeNull();
  });
});

describe('mosaicDownscaleSize', () => {
  it('caps the longer edge at MOSAIC_CELLS and preserves aspect', () => {
    // 400 (longer) → 8 cells; 200 scales by the same factor → 4.
    expect(mosaicDownscaleSize(200, 400)).toEqual({ width: 4, height: 8 });
    expect(mosaicDownscaleSize(400, 200)).toEqual({ width: 8, height: 4 });
  });

  it('never enlarges a region already smaller than the grid', () => {
    expect(mosaicDownscaleSize(6, 5)).toEqual({ width: 6, height: 5 });
  });

  it('never returns a zero dimension', () => {
    const g = mosaicDownscaleSize(1000, 1);
    expect(g.width).toBeGreaterThanOrEqual(1);
    expect(g.height).toBe(1);
  });
});

describe('mosaicMaskedRGBA', () => {
  it('expands a small grid into hard nearest-neighbour blocks', () => {
    // 2x1 grid: left cell red, right cell blue. Upscale to 4x1, radius large
    // enough that every pixel is fully inside the circle (alpha 255).
    const src = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]);
    const out = mosaicMaskedRGBA(src, 2, 1, 4, 1, 2, 0.5, 100);
    // Pixels 0..1 map to the red cell, 2..3 to the blue cell (hard edge, no blend).
    expect([out[0], out[1], out[2]]).toEqual([255, 0, 0]);
    expect([out[4], out[5], out[6]]).toEqual([255, 0, 0]);
    expect([out[8], out[9], out[10]]).toEqual([0, 0, 255]);
    expect([out[12], out[13], out[14]]).toEqual([0, 0, 255]);
  });

  it('masks pixels outside the circle to alpha 0', () => {
    const src = new Uint8Array([128, 128, 128, 255]);
    // 1x1 grid upscaled to 3x1, tiny radius centered on the middle pixel: the
    // outer pixels fall outside the disc and are fully transparent.
    const out = mosaicMaskedRGBA(src, 1, 1, 3, 1, 1.5, 0.5, 0.4);
    expect(out[3]).toBe(0); // left pixel: outside
    expect(out[11]).toBe(0); // right pixel: outside
    expect(out[7]).toBeGreaterThan(0); // center pixel: inside
  });
});
