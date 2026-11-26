import type { ImageSize } from '@/types/domain';
import type { Geometry, NormPoint } from '@/core/geometry/types';
import { distancePx } from '@/core/geometry/distance';

/**
 * CVAT-style vertex snapping. Tolerance is expressed in stage pixels and
 * converted with the current zoom, so snapping feels the same at every scale.
 * The caller passes only visible, unpinned candidate vertices.
 */

/** Snap a normalized point to the nearest candidate within `tolerancePx`. */
export function snapPoint(
  point: NormPoint,
  candidates: readonly NormPoint[],
  size: ImageSize,
  tolerancePx: number,
): { point: NormPoint; snapped: boolean } {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < candidates.length; i += 1) {
    const d = distancePx(point, candidates[i]!, size);
    if (d <= tolerancePx && d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  if (best < 0) return { point, snapped: false };
  return { point: { ...candidates[best]! }, snapped: true };
}

/** All vertices of a geometry (empty for single boxes/ellipses). */
export function geometryVertices(g: Geometry): NormPoint[] {
  switch (g.kind) {
    case 'box':
      return [
        { x: g.box.xMin, y: g.box.yMin },
        { x: g.box.xMax, y: g.box.yMin },
        { x: g.box.xMax, y: g.box.yMax },
        { x: g.box.xMin, y: g.box.yMax },
      ];
    case 'rotated_box': {
      const hw = g.w / 2;
      const hh = g.h / 2;
      return [
        { x: g.cx - hw, y: g.cy - hh },
        { x: g.cx + hw, y: g.cy - hh },
        { x: g.cx + hw, y: g.cy + hh },
        { x: g.cx - hw, y: g.cy + hh },
      ];
    }
    case 'polygon':
    case 'polyline':
    case 'points':
    case 'cuboid':
      return g.points.map((p) => ({ ...p }));
    case 'point':
      return [{ ...g.point }];
    case 'ellipse':
      return [
        { x: g.cx - g.rx, y: g.cy },
        { x: g.cx + g.rx, y: g.cy },
        { x: g.cx, y: g.cy - g.ry },
        { x: g.cx, y: g.cy + g.ry },
      ];
    default:
      return [];
  }
}

/** Downsample a freehand path to a minimum spacing in pixels. */
export function simplifyFreehand(
  points: readonly NormPoint[],
  size: ImageSize,
  minSpacingPx = 12,
): NormPoint[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const out: NormPoint[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i += 1) {
    if (distancePx(out[out.length - 1]!, points[i]!, size) >= minSpacingPx) {
      out.push(points[i]!);
    }
  }
  out.push(points[points.length - 1]!);
  return out.map((p) => ({ ...p }));
}
