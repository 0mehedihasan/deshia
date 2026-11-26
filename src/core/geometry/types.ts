import type { NormalizedBox } from '@/types/domain';

/**
 * DeshiA geometry vocabulary — the canonical, extensible annotation geometry
 * model shared by canvas rendering, pointer transforms, hit-testing,
 * validation, persistence, and export.
 *
 * COORDINATE CONVENTION (authoritative — every module must obey it):
 *  - All geometry is stored in IMAGE-RELATIVE NORMALIZED coordinates.
 *  - Origin (0,0) is the TOP-LEFT of the image. `x` increases to the right,
 *    `y` increases downward (standard image/screen convention; identical to the
 *    existing `NormalizedBox`).
 *  - `x` is a fraction of image WIDTH; `y` is a fraction of image HEIGHT. In-image
 *    points lie in [0,1]; values may transiently leave the range while editing
 *    and are clamped/validated at the edges.
 *  - Coordinates are kept at full floating-point precision. Rounding happens
 *    ONLY at an export edge (e.g. VOC integer pixels), never in canonical state.
 *
 * ROTATED-BOX CONVENTION:
 *  - A rotated box is center + size + angle: `{ cx, cy, w, h, angle }`.
 *  - `cx,w` are fractions of image WIDTH; `cy,h` are fractions of image HEIGHT.
 *  - `angle` is in DEGREES, positive = CLOCKWISE (because `y` points down), with
 *    the pivot at the box CENTER `(cx,cy)`. Canonical range is [0,360).
 *  - Because `w` and `h` are normalized against different axes, rotation math is
 *    performed in PIXEL space (normalized × image size), then converted back —
 *    see `rotated-box.ts`. An axis-aligned box is exactly `angle === 0`.
 *
 * No dataset ontology lives here (CLAUDE.md golden rule #1); this is pure
 * geometry. New geometry kinds are added by extending `Geometry` and
 * implementing the per-kind helpers — the workspace does not need rewriting.
 */

/** Discriminant for every supported geometry kind. */
export const GEOMETRY_KINDS = [
  'box',
  'rotated_box',
  'polygon',
  'polyline',
  'point',
  'points',
  'ellipse',
  'cuboid',
] as const;
export type GeometryKind = (typeof GEOMETRY_KINDS)[number];

/** A single normalized point (fraction of width/height, top-left origin). */
export interface NormPoint {
  x: number;
  y: number;
}

/** Axis-aligned bounding box — reuses the canonical `NormalizedBox`. */
export interface BoxGeometry {
  kind: 'box';
  box: NormalizedBox;
}

/** Rotated bounding box: center, normalized size, clockwise degrees about center. */
export interface RotatedBoxGeometry {
  kind: 'rotated_box';
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Degrees, clockwise-positive, pivot = center, canonical range [0,360). */
  angle: number;
}

/** Closed polygon (>= 3 vertices), implicitly closed from last vertex to first. */
export interface PolygonGeometry {
  kind: 'polygon';
  points: NormPoint[];
}

/** Open polyline (>= 2 vertices); never implicitly closed. */
export interface PolylineGeometry {
  kind: 'polyline';
  points: NormPoint[];
}

/** A single keypoint. */
export interface PointGeometry {
  kind: 'point';
  point: NormPoint;
}

/** A group of independent keypoints (CVAT POINTS, no connector segments). */
export interface PointsGeometry {
  kind: 'points';
  points: NormPoint[];
}

/**
 * Ellipse inscribed in a normalized box. `rx`/`ry` are fractions of image
 * width/height respectively so the ellipse scales with the image. `angle` is
 * clockwise degrees about the center (`x`-radius axis), matching Konva.
 */
export interface EllipseGeometry {
  kind: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
}

/**
 * 2D-projected cuboid: eight normalized corners in CVAT order
 * (front face 0..3, back face 4..7, with matching indices connected by the
 * depth edges). No 3D scene graph — this is a projected annotation, not a mesh.
 */
export interface CuboidGeometry {
  kind: 'cuboid';
  points: NormPoint[];
}

/** The tagged union of every annotation geometry. Extend here to add a kind. */
export type Geometry =
  | BoxGeometry
  | RotatedBoxGeometry
  | PolygonGeometry
  | PolylineGeometry
  | PointGeometry
  | PointsGeometry
  | EllipseGeometry
  | CuboidGeometry;

/** Smallest normalized extent accepted on an axis (guards degenerate shapes). */
export const MIN_NORMALIZED_EXTENT = 1e-4;

/** Narrowing helpers (handy at call sites and in tests). */
export function isRotatedBox(g: Geometry): g is RotatedBoxGeometry {
  return g.kind === 'rotated_box';
}
export function isPolygon(g: Geometry): g is PolygonGeometry {
  return g.kind === 'polygon';
}
export function isPolyline(g: Geometry): g is PolylineGeometry {
  return g.kind === 'polyline';
}
export function isPoints(g: Geometry): g is PointsGeometry {
  return g.kind === 'points';
}
export function isEllipse(g: Geometry): g is EllipseGeometry {
  return g.kind === 'ellipse';
}
export function isCuboid(g: Geometry): g is CuboidGeometry {
  return g.kind === 'cuboid';
}
