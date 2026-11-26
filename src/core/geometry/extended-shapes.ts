import type { ImageSize, NormalizedBox } from '@/types/domain';
import {
  MIN_NORMALIZED_EXTENT,
  type CuboidGeometry,
  type EllipseGeometry,
  type NormPoint,
  type PointsGeometry,
} from './types';
import { distancePx, distanceToSegmentPx } from './distance';
import { moveVertices, vertexBounds } from './shapes';

/**
 * Pure helpers for the geometry kinds added for CVAT parity: POINTS, ELLIPSE
 * and the 2D-projected CUBOID. Coordinates stay normalized; all distance math
 * that must be isotropic runs in pixel space, exactly like rotated boxes.
 */

// ---- points (keypoint group) ------------------------------------------------

/** A POINTS group is valid with at least one finite keypoint. */
export function isValidPoints(pointsGeometry: PointsGeometry): boolean {
  return (
    pointsGeometry.points.length >= 1 &&
    pointsGeometry.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  );
}

/** Move every keypoint by a normalized delta. */
export function movePoints(g: PointsGeometry, dx: number, dy: number): PointsGeometry {
  return { kind: 'points', points: moveVertices(g.points, dx, dy) };
}

/** Replace one keypoint by index (no-op when out of range). */
export function setPoint(g: PointsGeometry, index: number, p: NormPoint): PointsGeometry {
  if (index < 0 || index >= g.points.length) return g;
  return {
    kind: 'points',
    points: g.points.map((v, i) => (i === index ? { x: p.x, y: p.y } : v)),
  };
}

/** Add a keypoint to a POINTS group. */
export function appendPoint(g: PointsGeometry, p: NormPoint): PointsGeometry {
  return { kind: 'points', points: [...g.points, { x: p.x, y: p.y }] };
}

/** Remove a keypoint; never below the single-point minimum. */
export function removePoint(g: PointsGeometry, index: number): PointsGeometry {
  if (g.points.length <= 1 || index < 0 || index >= g.points.length) return g;
  return { kind: 'points', points: g.points.filter((_, i) => i !== index) };
}

// ---- ellipse ----------------------------------------------------------------

/** Ellipse validity: finite center, positive radii, angle in [0,360). */
export function isValidEllipse(g: EllipseGeometry): boolean {
  return (
    Number.isFinite(g.cx) &&
    Number.isFinite(g.cy) &&
    Number.isFinite(g.rx) &&
    Number.isFinite(g.ry) &&
    Number.isFinite(g.angle) &&
    g.cx >= 0 &&
    g.cx <= 1 &&
    g.cy >= 0 &&
    g.cy <= 1 &&
    g.rx >= MIN_NORMALIZED_EXTENT &&
    g.ry >= MIN_NORMALIZED_EXTENT
  );
}

/** Axis-aligned bounds of an ellipse (rotation expanded conservatively). */
export function ellipseBounds(g: EllipseGeometry): NormalizedBox {
  const angle = ((g.angle % 360) + 360) % 360;
  const rad = (angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const halfW = g.rx * c + g.ry * s;
  const halfH = g.rx * s + g.ry * c;
  return {
    xMin: g.cx - halfW,
    yMin: g.cy - halfH,
    xMax: g.cx + halfW,
    yMax: g.cy + halfH,
  };
}

/** Move an ellipse by a normalized delta. */
export function moveEllipse(g: EllipseGeometry, dx: number, dy: number): EllipseGeometry {
  return { ...g, cx: g.cx + dx, cy: g.cy + dy };
}

/** Normalize an angle to [0,360). */
export function normalizeGeometryAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Does a normalized point fall inside an ellipse (rotation accounted for)? */
export function pointInEllipse(g: EllipseGeometry, p: NormPoint, size: ImageSize): boolean {
  if (g.rx <= 0 || g.ry <= 0) return false;
  const rad = (-normalizeGeometryAngle(g.angle) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = (p.x - g.cx) * size.width;
  const dy = (p.y - g.cy) * size.height;
  const localX = dx * c - dy * s;
  const localY = dx * s + dy * c;
  const rxPx = g.rx * size.width;
  const ryPx = g.ry * size.height;
  return (localX * localX) / (rxPx * rxPx) + (localY * localY) / (ryPx * ryPx) <= 1;
}

// ---- cuboid (2D-projected) --------------------------------------------------

/** CVAT cuboids have exactly eight corners. */
export const CUBOID_CORNER_COUNT = 8;

/** Front face 0..3, back face 4..7 (matching corners joined by depth edges). */
export const CUBOID_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/** A cuboid is valid with eight finite, non-coincident corners. */
export function isValidCuboid(g: CuboidGeometry): boolean {
  const p = g.points;
  if (p.length !== CUBOID_CORNER_COUNT) return false;
  if (!p.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y))) return false;
  const b = vertexBounds(p);
  return b.xMax - b.xMin >= MIN_NORMALIZED_EXTENT || b.yMax - b.yMin >= MIN_NORMALIZED_EXTENT;
}

/** Move every cuboid corner by a normalized delta. */
export function moveCuboid(g: CuboidGeometry, dx: number, dy: number): CuboidGeometry {
  return { kind: 'cuboid', points: moveVertices(g.points, dx, dy) };
}

/** Replace one cuboid corner by index (no-op when out of range). */
export function setCuboidCorner(g: CuboidGeometry, index: number, p: NormPoint): CuboidGeometry {
  if (index < 0 || index >= g.points.length) return g;
  return {
    kind: 'cuboid',
    points: g.points.map((v, i) => (i === index ? { x: p.x, y: p.y } : v)),
  };
}

/** Build the 8-corner cuboid from a rectangle and a depth fraction of its size. */
export function cuboidFromBox(
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
  depth = 0.28,
): CuboidGeometry {
  const dx = (xMax - xMin) * depth;
  const dy = (yMax - yMin) * depth;
  return {
    kind: 'cuboid',
    points: [
      { x: xMin, y: yMin },
      { x: xMax, y: yMin },
      { x: xMax, y: yMax },
      { x: xMin, y: yMax },
      { x: xMin + dx, y: yMin - dy },
      { x: xMax + dx, y: yMin - dy },
      { x: xMax + dx, y: yMax - dy },
      { x: xMin + dx, y: yMax - dy },
    ],
  };
}

/** Build a cuboid from the front face's four dragged corners. */
export function cuboidFromCorners(
  corners: readonly NormPoint[],
  depth = 0.28,
): CuboidGeometry | null {
  if (corners.length < 4) return null;
  const b = vertexBounds(corners);
  return cuboidFromBox(b.xMin, b.yMin, b.xMax, b.yMax, depth);
}

/** Distance from a point to the nearest cuboid edge, in pixels. */
export function cuboidEdgeDistancePx(g: CuboidGeometry, p: NormPoint, size: ImageSize): number {
  let best = Infinity;
  for (const [a, b] of CUBOID_EDGES) {
    best = Math.min(best, distanceToSegmentPx(p, g.points[a]!, g.points[b]!, size));
  }
  return best;
}

/** Does a point hit a keypoint group or a cuboid within the pixel tolerance? */
export function hitTestExtended(
  g: PointsGeometry | CuboidGeometry,
  p: NormPoint,
  size: ImageSize,
  tolNorm = 0.01,
): boolean {
  const tolPx = tolNorm * size.width;
  if (g.kind === 'points') {
    return g.points.some((v) => distancePx(v, p, size) <= tolPx);
  }
  return cuboidEdgeDistancePx(g, p, size) <= tolPx;
}
