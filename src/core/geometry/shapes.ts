import type { ImageSize, NormalizedBox } from '@/types/domain';
import { MIN_NORMALIZED_EXTENT, type NormPoint } from './types';

/**
 * Polygon, polyline and point geometry — pure, normalized-coordinate helpers.
 * Each geometry kind isolates its own math (area, bounds, vertex editing,
 * validation) so new kinds can be added without touching the others.
 */

const DEG2RAD = Math.PI / 180;

// ---- polygons --------------------------------------------------------------

/** Shoelace area in normalized units (fraction of the unit square). */
export function polygonArea(points: readonly NormPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Area-weighted centroid of a polygon (falls back to vertex mean). */
export function polygonCentroid(points: readonly NormPoint[]): NormPoint {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n < 3) return vertexMean(points);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % n]!;
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (a === 0) return vertexMean(points);
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

function vertexMean(points: readonly NormPoint[]): NormPoint {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

/** Even-odd ray-cast point-in-polygon test. */
export function pointInPolygon(points: readonly NormPoint[], p: NormPoint): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    const intersects =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Normalized AABB of a vertex list (shared by polygon/polyline). */
export function vertexBounds(points: readonly NormPoint[]): NormalizedBox {
  if (points.length === 0) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    xMin: Math.min(...xs),
    yMin: Math.min(...ys),
    xMax: Math.max(...xs),
    yMax: Math.max(...ys),
  };
}

/** Move every vertex by a normalized delta (whole-shape move). */
export function moveVertices(points: readonly NormPoint[], dx: number, dy: number): NormPoint[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Replace one vertex. Out-of-range index returns the list unchanged. */
export function moveVertex(points: readonly NormPoint[], index: number, p: NormPoint): NormPoint[] {
  if (index < 0 || index >= points.length) return [...points];
  return points.map((v, i) => (i === index ? { x: p.x, y: p.y } : v));
}

/** Insert a vertex AFTER `index` (use -1 to prepend). */
export function insertVertex(
  points: readonly NormPoint[],
  index: number,
  p: NormPoint,
): NormPoint[] {
  const copy = [...points];
  const at = Math.max(0, Math.min(copy.length, index + 1));
  copy.splice(at, 0, { x: p.x, y: p.y });
  return copy;
}

/** Remove the vertex at `index`, keeping at least `min` vertices. */
export function removeVertex(
  points: readonly NormPoint[],
  index: number,
  min: number,
): NormPoint[] {
  if (points.length <= min || index < 0 || index >= points.length) return [...points];
  return points.filter((_, i) => i !== index);
}

/** Rotate a vertex list about a pivot (pixel-isotropic), clockwise degrees. */
export function rotateVertices(
  points: readonly NormPoint[],
  deg: number,
  size: ImageSize,
  pivot: NormPoint,
): NormPoint[] {
  if (size.width <= 0 || size.height <= 0) return [...points];
  const r = deg * DEG2RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const pxPivot = { x: pivot.x * size.width, y: pivot.y * size.height };
  return points.map((p) => {
    const dx = p.x * size.width - pxPivot.x;
    const dy = p.y * size.height - pxPivot.y;
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    return { x: (pxPivot.x + rx) / size.width, y: (pxPivot.y + ry) / size.height };
  });
}

/** A polygon is valid with >= 3 finite vertices and non-degenerate area. */
export function isValidPolygon(points: readonly NormPoint[]): boolean {
  if (points.length < 3) return false;
  if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  return polygonArea(points) >= MIN_NORMALIZED_EXTENT * MIN_NORMALIZED_EXTENT;
}

// ---- polylines -------------------------------------------------------------

/** Total polyline length in PIXELS for a given image size. */
export function polylineLengthPx(points: readonly NormPoint[], size: ImageSize): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = (b.x - a.x) * size.width;
    const dy = (b.y - a.y) * size.height;
    total += Math.hypot(dx, dy);
  }
  return total;
}

/** A polyline is valid with >= 2 finite vertices spanning a non-zero extent. */
export function isValidPolyline(points: readonly NormPoint[]): boolean {
  if (points.length < 2) return false;
  if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  const b = vertexBounds(points);
  return b.xMax - b.xMin >= MIN_NORMALIZED_EXTENT || b.yMax - b.yMin >= MIN_NORMALIZED_EXTENT;
}

// ---- points ----------------------------------------------------------------

/** Translate a single point by a normalized delta. */
export function movePoint(point: NormPoint, dx: number, dy: number): NormPoint {
  return { x: point.x + dx, y: point.y + dy };
}

/** Degenerate (zero-area) normalized bounds at a point — handy for selection. */
export function pointBounds(point: NormPoint): NormalizedBox {
  return { xMin: point.x, yMin: point.y, xMax: point.x, yMax: point.y };
}

/** A point is valid when both coordinates are finite. */
export function isValidPoint(point: NormPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
