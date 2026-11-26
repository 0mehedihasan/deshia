import type { ImageSize } from '@/types/domain';
import type { AnnotationObject } from '@/types/domain';
import type { Geometry, NormPoint } from '@/core/geometry/types';

/**
 * Video-track interpolation. Keyframes are the objects actually persisted;
 * frames between them are computed on read. The math is pure, runs in normalized
 * coordinates, and never mutates the keyframe objects.
 */

/** Linear interpolation clamped to [0,1]. */
export function progress(frame: number, from: number, to: number): number {
  if (to <= from) return frame >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (frame - from) / (to - from)));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: NormPoint, b: NormPoint, t: number): NormPoint {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function lerpPoints(a: readonly NormPoint[], b: readonly NormPoint[], t: number): NormPoint[] {
  if (a.length !== b.length) return a.map((p) => ({ ...p }));
  return a.map((p, i) => lerpPoint(p, b[i]!, t));
}

/** Shortest-angular-path interpolation in degrees. */
export function lerpAngle(a: number, b: number, t: number): number {
  let delta = ((((b - a) % 360) + 540) % 360) - 180;
  if (delta === -180) delta = 180;
  const result = (a + delta * t) % 360;
  return result < 0 ? result + 360 : result;
}

/** Interpolate two geometries of the same kind. Different kinds hold the left. */
export function interpolateGeometry(
  from: Geometry,
  to: Geometry,
  t: number,
  _size: ImageSize,
): Geometry {
  if (from.kind !== to.kind) return from;
  switch (from.kind) {
    case 'box': {
      const b = to.kind === 'box' ? to.box : from.box;
      return {
        kind: 'box',
        box: {
          xMin: lerp(from.box.xMin, b.xMin, t),
          yMin: lerp(from.box.yMin, b.yMin, t),
          xMax: lerp(from.box.xMax, b.xMax, t),
          yMax: lerp(from.box.yMax, b.yMax, t),
        },
      };
    }
    case 'rotated_box': {
      const b = to.kind === 'rotated_box' ? to : from;
      return {
        kind: 'rotated_box',
        cx: lerp(from.cx, b.cx, t),
        cy: lerp(from.cy, b.cy, t),
        w: lerp(from.w, b.w, t),
        h: lerp(from.h, b.h, t),
        angle: lerpAngle(from.angle, b.angle, t),
      };
    }
    case 'ellipse': {
      const b = to.kind === 'ellipse' ? to : from;
      return {
        kind: 'ellipse',
        cx: lerp(from.cx, b.cx, t),
        cy: lerp(from.cy, b.cy, t),
        rx: lerp(from.rx, b.rx, t),
        ry: lerp(from.ry, b.ry, t),
        angle: lerpAngle(from.angle, b.angle, t),
      };
    }
    case 'point': {
      const b = to.kind === 'point' ? to : from;
      return { kind: 'point', point: lerpPoint(from.point, b.point, t) };
    }
    case 'polygon':
    case 'polyline':
    case 'points':
    case 'cuboid': {
      const points = to.kind === from.kind ? to.points : from.points;
      return { kind: from.kind, points: lerpPoints(from.points, points, t) };
    }
    default:
      return from;
  }
}

/** The governing keyframes around `frame` for one track. */
export function surroundingKeyframes(
  keyframes: readonly AnnotationObject[],
  frame: number,
): { before: AnnotationObject; after: AnnotationObject } | null {
  const sorted = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber);
  if (sorted.length === 0) return null;
  const exact = sorted.find((k) => k.frameNumber === frame);
  if (exact) return { before: exact, after: exact };
  const before = [...sorted].reverse().find((k) => k.frameNumber < frame);
  const after = sorted.find((k) => k.frameNumber > frame);
  if (!before || !after) return null;
  return { before, after };
}

/**
 * Compute an object at `frame` from its track keyframes. Returns null when no
 * governing pair exists (no extrapolation). `outside` keyframes close a segment.
 */
export function interpolateTrackObject(
  keyframes: readonly AnnotationObject[],
  frame: number,
  size: ImageSize,
): AnnotationObject | null {
  const pair = surroundingKeyframes(keyframes, frame);
  if (!pair) return null;
  const { before, after } = pair;
  if (before.frameNumber === after.frameNumber) return before;
  if (before.outside || after.outside) return null;
  const t = progress(frame, before.frameNumber, after.frameNumber);
  return {
    ...before,
    id: `interpolated_${before.trackId ?? 'track'}_${frame}`,
    geometry: interpolateGeometry(before.geometry, after.geometry, t, size),
    attributes: { ...before.attributes },
    frameNumber: frame,
    occluded: before.occluded || after.occluded,
    zOrder: Math.max(before.zOrder, after.zOrder),
  };
}

/** All interpolated objects of one track between two frames (inclusive-free). */
export function interpolatedRange(
  keyframes: readonly AnnotationObject[],
  fromFrame: number,
  toFrame: number,
  size: ImageSize,
): AnnotationObject[] {
  const out: AnnotationObject[] = [];
  for (let frame = fromFrame + 1; frame < toFrame; frame += 1) {
    const obj = interpolateTrackObject(keyframes, frame, size);
    if (obj) out.push(obj);
  }
  return out;
}
