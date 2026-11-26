import { describe, expect, it } from 'vitest';
import type { ImageSize } from '@/types/domain';
import {
  fitView,
  imageNormToStage,
  panView,
  stageToImageNorm,
  zoomViewAt,
} from '@/core/geometry/transform';

const SIZE: ImageSize = { width: 100, height: 50 };

describe('viewport transforms', () => {
  it('fit-to-screen contains and centers the image', () => {
    const v = fitView(200, 200, SIZE);
    expect(v.scale).toBe(2); // min(200/100, 200/50)
    expect(v.offsetX).toBe(0);
    expect(v.offsetY).toBe(50);
  });

  it('round-trips stage<->image coordinates exactly', () => {
    const v = fitView(200, 200, SIZE);
    const stage = imageNormToStage({ x: 0.5, y: 0.5 }, v, SIZE);
    expect(stage).toEqual({ x: 100, y: 100 });
    const back = stageToImageNorm(stage, v, SIZE);
    expect(back.x).toBeCloseTo(0.5, 10);
    expect(back.y).toBeCloseTo(0.5, 10);
  });

  it('keeps the point under the cursor fixed while zooming (geometry unchanged)', () => {
    const v = fitView(200, 200, SIZE);
    const cursor = { x: 123, y: 77 };
    const before = stageToImageNorm(cursor, v, SIZE);
    const zoomed = zoomViewAt(v, 1.5, cursor);
    const after = stageToImageNorm(cursor, zoomed, SIZE);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
    expect(zoomed.scale).toBeCloseTo(3, 10);
  });

  it('panning shifts only the offset, not the scale', () => {
    const v = fitView(200, 200, SIZE);
    const p = panView(v, 10, -5);
    expect(p.scale).toBe(v.scale);
    expect(p.offsetX).toBe(v.offsetX + 10);
    expect(p.offsetY).toBe(v.offsetY - 5);
  });
});
