import { describe, expect, it } from 'vitest';
import {
  clamp01,
  clampNormalizedBox,
  computeContainFit,
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
    const voc = normalizedToVocPixels(
      { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
      { width: 100, height: 50 },
    );
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
    expect(() =>
      pixelToNormalized({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 }, { width: 0, height: 10 }),
    ).toThrow();
  });
});

describe('computeContainFit', () => {
  it('returns an identity transform for non-positive natural dimensions', () => {
    expect(computeContainFit(800, 600, 0, 100)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(computeContainFit(800, 600, 100, -5)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('fills a square image into a square stage with no letterbox', () => {
    const fit = computeContainFit(400, 400, 400, 400);
    expect(fit).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('letterboxes a square image in a wide stage (horizontal offset only)', () => {
    // 400×400 image in an 800×400 stage: scale limited by height → 1, so the
    // image is 400 wide and centered, leaving 200px bars left and right.
    const fit = computeContainFit(800, 400, 400, 400);
    expect(fit.scale).toBeCloseTo(1);
    expect(fit.offsetX).toBeCloseTo(200);
    expect(fit.offsetY).toBeCloseTo(0);
  });

  it('letterboxes a square image in a tall stage (vertical offset only)', () => {
    const fit = computeContainFit(400, 800, 400, 400);
    expect(fit.scale).toBeCloseTo(1);
    expect(fit.offsetX).toBeCloseTo(0);
    expect(fit.offsetY).toBeCloseTo(200);
  });

  it('scales down by the more constrained axis and centers', () => {
    // 1000×500 image into a 400×400 stage: min(400/1000, 400/500)=0.4 → drawn
    // 400×200, centered vertically (offsetY = (400-200)/2 = 100).
    const fit = computeContainFit(400, 400, 1000, 500);
    expect(fit.scale).toBeCloseTo(0.4);
    expect(fit.offsetX).toBeCloseTo(0);
    expect(fit.offsetY).toBeCloseTo(100);
  });
});

/**
 * Regression coverage for the canvas draw-finalize pipeline. The Konva
 * component (`annotation-canvas.tsx`) converts a mousedown/mouseup gesture into
 * a normalized box using exactly `computeContainFit` (for the pixel↔normalized
 * mapping) + `normalizedBoxFromCorners` (for ordering/clamping/rejection). This
 * mirrors that math with the REAL exported primitives so the coordinate
 * behaviour the window-listener drag fix relies on is locked down: a normal
 * drag, an off-canvas release (clamped to the image edge), a release past the
 * top-left (clamped to 0), a pure click (rejected), and the letterbox offset.
 */
describe('draw-finalize pipeline (canvas coordinate math)', () => {
  function finalize(
    container: { left: number; top: number; width: number; height: number },
    nat: { w: number; h: number },
    downClient: { x: number; y: number },
    upClient: { x: number; y: number },
  ) {
    const fit = computeContainFit(container.width, container.height, nat.w, nat.h);
    const pxW = nat.w * fit.scale;
    const pxH = nat.h * fit.scale;
    // clientX/Y → container-local (what `localPoint` does in the component).
    const local = (cx: number, cy: number) => ({ x: cx - container.left, y: cy - container.top });
    const toNormalized = (x: number, y: number) => ({
      nx: pxW > 0 ? (x - fit.offsetX) / pxW : 0,
      ny: pxH > 0 ? (y - fit.offsetY) / pxH : 0,
    });
    const d = local(downClient.x, downClient.y);
    const u = local(upClient.x, upClient.y);
    const a = toNormalized(d.x, d.y);
    const b = toNormalized(u.x, u.y);
    return normalizedBoxFromCorners(a.nx, a.ny, b.nx, b.ny);
  }

  const cont = { left: 0, top: 0, width: 400, height: 400 };
  const nat = { w: 400, h: 400 };

  it('a normal drag yields the expected normalized box', () => {
    expect(finalize(cont, nat, { x: 40, y: 80 }, { x: 200, y: 240 })).toEqual({
      xMin: 0.1,
      yMin: 0.2,
      xMax: 0.5,
      yMax: 0.6,
    });
  });

  it('a release off-canvas (past the right edge) still finalizes, clamped to the image edge', () => {
    const box = finalize(cont, nat, { x: 200, y: 200 }, { x: 999, y: 260 });
    expect(box).not.toBeNull();
    expect(box?.xMax).toBe(1);
    expect(box?.xMin).toBeCloseTo(0.5);
  });

  it('a release above/left of the image clamps the min corner to 0', () => {
    const box = finalize(cont, nat, { x: 200, y: 200 }, { x: -50, y: -50 });
    expect(box).not.toBeNull();
    expect(box?.xMin).toBe(0);
    expect(box?.yMin).toBe(0);
  });

  it('a pure click (down === up, no drag) is rejected — no zero-area box', () => {
    expect(finalize(cont, nat, { x: 120, y: 120 }, { x: 120, y: 120 })).toBeNull();
  });

  it('accounts for the letterbox offset of a centered square image in a wide container', () => {
    // 400×400 image centered in an 800-wide container at origin (100,50):
    // offsetX = 200, so a drag from client x = left+offsetX = 300 starts at nx=0.
    const wide = { left: 100, top: 50, width: 800, height: 400 };
    const box = finalize(wide, nat, { x: 300, y: 50 }, { x: 500, y: 250 });
    expect(box).not.toBeNull();
    expect(box?.xMin).toBeCloseTo(0);
    expect(box?.yMin).toBeCloseTo(0);
  });
});
