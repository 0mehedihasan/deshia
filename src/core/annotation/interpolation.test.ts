import { describe, expect, it } from 'vitest';
import {
  interpolateGeometry,
  interpolateTrackObject,
  interpolatedRange,
  lerpAngle,
  progress,
} from './interpolation';
import { createObject } from './objects';

const size = { width: 1000, height: 500 };
const box = (xMin: number) => ({
  kind: 'box' as const,
  box: { xMin, yMin: 0, xMax: xMin + 0.2, yMax: 0.4 },
});

function keyframe(frame: number, xMin: number, trackId = 'car-1') {
  const obj = createObject({
    id: `k${frame}`,
    labelId: 'car',
    labelName: 'Car',
    geometry: box(xMin),
    zOrder: 1,
    frameNumber: frame,
  });
  return { ...obj, trackId };
}

describe('track interpolation', () => {
  it('clamps progress and takes the shortest angular path', () => {
    expect(progress(5, 0, 10)).toBe(0.5);
    expect(progress(-1, 0, 10)).toBe(0);
    expect(progress(11, 0, 10)).toBe(1);
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0);
  });

  it('interpolates box geometry between keyframes', () => {
    const g = interpolateGeometry(box(0.1), box(0.5), 0.5, size);
    if (g.kind !== 'box') throw new Error('expected box');
    expect(g.box.xMin).toBeCloseTo(0.3);
    expect(g.box.xMax).toBeCloseTo(0.5);
  });

  it('returns the exact keyframe and does not extrapolate', () => {
    const frames = [keyframe(0, 0.1), keyframe(10, 0.5)];
    const exact = interpolateTrackObject(frames, 0, size);
    expect(exact?.id).toBe('k0');
    expect(interpolateTrackObject(frames, 20, size)).toBeNull();
  });

  it('computes intermediate frames with a synthetic id', () => {
    const frames = [keyframe(0, 0.1), keyframe(10, 0.5)];
    const mid = interpolateTrackObject(frames, 5, size);
    expect(mid?.frameNumber).toBe(5);
    expect(mid?.id).toContain('interpolated');
    if (mid?.geometry.kind !== 'box') throw new Error('expected box');
    expect(mid.geometry.box.xMin).toBeCloseTo(0.3);
    expect(interpolatedRange(frames, 0, 3, size).map((o) => o.frameNumber)).toEqual([1, 2]);
  });

  it('closes track segments at outside keyframes', () => {
    const exit = { ...keyframe(10, 0.5), outside: true };
    expect(interpolateTrackObject([keyframe(0, 0.1), exit], 5, size)).toBeNull();
  });
});
