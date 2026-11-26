import type { ImageSize, NormalizedBox } from '@/types/domain';
import type { Geometry, NormPoint } from './types';
import { pointInRotatedBox } from './rotated-box';
import { pointInPolygon } from './shapes';
import { distancePx, distanceToSegmentPx } from './distance';
import { cuboidEdgeDistancePx, pointInEllipse } from './extended-shapes';

/**
 * Unified hit-testing across every geometry kind. Tolerance is expressed in
 * normalized WIDTH units (same convention as redaction radii) and converted to
 * pixels internally, so edge/vertex picking feels consistent regardless of
 * image aspect ratio or zoom (callers pass a zoom-adjusted tolerance).
 */

export { distancePx, distanceToSegmentPx } from './distance';

function pointInBox(box: NormalizedBox, p: NormPoint): boolean {
  return p.x >= box.xMin && p.x <= box.xMax && p.y >= box.yMin && p.y <= box.yMax;
}

/** The nearest vertex index within `tolNorm`, or -1. Shared by polygon/polyline. */
export function nearestVertex(
  points: readonly NormPoint[],
  p: NormPoint,
  size: ImageSize,
  tolNorm: number,
): number {
  const tolPx = tolNorm * size.width;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = distancePx(points[i]!, p, size);
    if (d <= tolPx && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Does normalized point `p` hit geometry `g`? Area geometries test interior
 * plus an edge band; polylines test proximity to any segment; points test
 * proximity. `tolNorm` is a normalized WIDTH-unit pick radius.
 */
export function hitTest(g: Geometry, p: NormPoint, size: ImageSize, tolNorm = 0.01): boolean {
  const tolPx = tolNorm * size.width;
  switch (g.kind) {
    case 'box':
      return pointInBox(g.box, p);
    case 'rotated_box':
      return pointInRotatedBox(g, p, size);
    case 'polygon':
      if (pointInPolygon(g.points, p)) return true;
      return edgeDistance(g.points, p, size, true) <= tolPx;
    case 'polyline':
      return edgeDistance(g.points, p, size, false) <= tolPx;
    case 'point':
      return distancePx(g.point, p, size) <= tolPx;
    case 'points':
      return g.points.some((v) => distancePx(v, p, size) <= tolPx);
    case 'ellipse':
      return pointInEllipse(g, p, size) || ellipseEdgeHit(g, p, size, tolPx);
    case 'cuboid':
      return cuboidEdgeDistancePx(g, p, size) <= tolPx;
    default:
      return false;
  }
}

/** Near-edge tolerance for ellipses (implicit form within a pixel band). */
function ellipseEdgeHit(
  g: Extract<Geometry, { kind: 'ellipse' }>,
  p: NormPoint,
  size: ImageSize,
  tolPx: number,
): boolean {
  if (g.rx <= 0 || g.ry <= 0) return false;
  const rad = (-(((g.angle % 360) + 360) % 360) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = (p.x - g.cx) * size.width;
  const dy = (p.y - g.cy) * size.height;
  const localX = dx * c - dy * s;
  const localY = dx * s + dy * c;
  const rx = g.rx * size.width;
  const ry = g.ry * size.height;
  const f = Math.sqrt((localX * localX) / (rx * rx) + (localY * localY) / (ry * ry));
  // Approximate distance to the boundary in pixels from the radial error.
  return Math.abs(f - 1) * Math.min(rx, ry) <= tolPx;
}

function edgeDistance(
  points: readonly NormPoint[],
  p: NormPoint,
  size: ImageSize,
  closed: boolean,
): number {
  if (points.length < 2) return Infinity;
  let best = Infinity;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    best = Math.min(best, distanceToSegmentPx(p, a, b, size));
  }
  return best;
}
