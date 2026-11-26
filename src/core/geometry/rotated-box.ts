import type { ImageSize, NormalizedBox } from '@/types/domain';
import { MIN_NORMALIZED_EXTENT, type NormPoint, type RotatedBoxGeometry } from './types';

/**
 * Rotated-box geometry — a FIRST-CLASS citizen, not an afterthought.
 *
 * Canonical model (see `types.ts`): `{ cx, cy, w, h, angle }`, normalized, with
 * `angle` in degrees, clockwise-positive, pivot at the center, range [0,360).
 * Because `w`/`h` are normalized against different axes, all rotation math runs
 * in PIXEL space (normalized × `ImageSize`) and is converted back, so the stored
 * geometry stays resolution-independent while the math stays isotropic.
 *
 * The SAME functions here are intended for rendering, pointer transforms,
 * hit-testing, validation, persistence and export, so rotation can never be
 * represented inconsistently across modules.
 */

const DEG2RAD = Math.PI / 180;

/** Normalize any degree value into the canonical [0,360) range (−0 → +0). */
export function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const a = ((deg % 360) + 360) % 360;
  return a === 0 ? 0 : a;
}

/** Signed display angle in (−180,180] — e.g. 350° → −10°. */
export function signedAngle(deg: number): number {
  const a = normalizeAngle(deg);
  return a > 180 ? a - 360 : a;
}

/** Build a rotated box (angle 0) from an axis-aligned normalized box. */
export function rotatedFromBox(box: NormalizedBox): RotatedBoxGeometry {
  return {
    kind: 'rotated_box',
    cx: (box.xMin + box.xMax) / 2,
    cy: (box.yMin + box.yMax) / 2,
    w: box.xMax - box.xMin,
    h: box.yMax - box.yMin,
    angle: 0,
  };
}

/** The box center as a normalized point. */
export function rotatedBoxCenter(g: RotatedBoxGeometry): NormPoint {
  return { x: g.cx, y: g.cy };
}

interface Vec {
  x: number;
  y: number;
}

/** Rotate a vector by `deg` (clockwise-positive, y-down). */
function rotateVec(v: Vec, deg: number): Vec {
  const r = deg * DEG2RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * The four corners in PIXEL space, order [TL, TR, BR, BL] in the box's own
 * (pre-rotation) frame. This ordering is stable and is what resize-handle math
 * and polygon conversion rely on.
 */
export function rotatedBoxCornersPx(g: RotatedBoxGeometry, size: ImageSize): Vec[] {
  const cxPx = g.cx * size.width;
  const cyPx = g.cy * size.height;
  const hw = (g.w * size.width) / 2;
  const hh = (g.h * size.height) / 2;
  const locals: Vec[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return locals.map((l) => {
    const r = rotateVec(l, g.angle);
    return { x: cxPx + r.x, y: cyPx + r.y };
  });
}

/** The four corners as normalized points, order [TL, TR, BR, BL]. */
export function rotatedBoxCorners(g: RotatedBoxGeometry, size: ImageSize): NormPoint[] {
  if (size.width <= 0 || size.height <= 0) return [];
  return rotatedBoxCornersPx(g, size).map((p) => ({ x: p.x / size.width, y: p.y / size.height }));
}

/** Axis-aligned normalized bounds (the enclosing AABB) of a rotated box. */
export function rotatedBoxBounds(g: RotatedBoxGeometry, size: ImageSize): NormalizedBox {
  const corners = rotatedBoxCorners(g, size);
  if (corners.length === 0) return { xMin: g.cx, yMin: g.cy, xMax: g.cx, yMax: g.cy };
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    xMin: Math.min(...xs),
    yMin: Math.min(...ys),
    xMax: Math.max(...xs),
    yMax: Math.max(...ys),
  };
}

/** Hit-test: is normalized point `p` inside the rotated box? Pivot-correct. */
export function pointInRotatedBox(g: RotatedBoxGeometry, p: NormPoint, size: ImageSize): boolean {
  if (size.width <= 0 || size.height <= 0) return false;
  const dx = p.x * size.width - g.cx * size.width;
  const dy = p.y * size.height - g.cy * size.height;
  // Rotate the delta by -angle into the box's local frame.
  const local = rotateVec({ x: dx, y: dy }, -g.angle);
  const hw = (g.w * size.width) / 2;
  const hh = (g.h * size.height) / 2;
  const eps = 1e-6;
  return Math.abs(local.x) <= hw + eps && Math.abs(local.y) <= hh + eps;
}

/** Translate a rotated box by a normalized delta. No image size needed. */
export function moveRotatedBox(g: RotatedBoxGeometry, dx: number, dy: number): RotatedBoxGeometry {
  return { ...g, cx: g.cx + dx, cy: g.cy + dy };
}

/** Rotate a box about its own center by `deltaDeg` (keeps size + center). */
export function rotateRotatedBox(g: RotatedBoxGeometry, deltaDeg: number): RotatedBoxGeometry {
  return { ...g, angle: normalizeAngle(g.angle + deltaDeg) };
}

/** Set the absolute angle (normalized). Supports precise numeric entry. */
export function setRotatedBoxAngle(g: RotatedBoxGeometry, deg: number): RotatedBoxGeometry {
  return { ...g, angle: normalizeAngle(deg) };
}

/** Reset rotation to 0 while preserving center + size. */
export function resetRotation(g: RotatedBoxGeometry): RotatedBoxGeometry {
  return { ...g, angle: 0 };
}

/**
 * Resize a rotated box by dragging corner `handleIndex` ([TL,TR,BR,BL]) to the
 * normalized pointer `p`, keeping the OPPOSITE corner fixed in world space and
 * respecting the box's rotated local axes. Returns a new box with the same
 * angle; sides are clamped to `minPx` pixels so the box never collapses or
 * flips silently.
 */
export function resizeRotatedBox(
  g: RotatedBoxGeometry,
  handleIndex: number,
  p: NormPoint,
  size: ImageSize,
  minPx = 2,
): RotatedBoxGeometry {
  if (size.width <= 0 || size.height <= 0) return g;
  const corners = rotatedBoxCornersPx(g, size);
  const anchor = corners[(handleIndex + 2) % 4];
  if (!anchor) return g;
  const pointer = { x: p.x * size.width, y: p.y * size.height };
  const delta = { x: pointer.x - anchor.x, y: pointer.y - anchor.y };
  const local = rotateVec(delta, -g.angle);
  const newW = Math.max(minPx, Math.abs(local.x));
  const newH = Math.max(minPx, Math.abs(local.y));
  const dirX = local.x >= 0 ? 1 : -1;
  const dirY = local.y >= 0 ? 1 : -1;
  const worldHalf = rotateVec({ x: (dirX * newW) / 2, y: (dirY * newH) / 2 }, g.angle);
  const centerPx = { x: anchor.x + worldHalf.x, y: anchor.y + worldHalf.y };
  return {
    kind: 'rotated_box',
    cx: centerPx.x / size.width,
    cy: centerPx.y / size.height,
    w: newW / size.width,
    h: newH / size.height,
    angle: g.angle,
  };
}

/**
 * Convert a rotated box to a 4-vertex polygon ([TL,TR,BR,BL], normalized). This
 * is the documented lossless conversion used when exporting to a polygon-capable
 * format — rotation is PRESERVED as explicit vertices, never discarded.
 */
export function rotatedToPolygon(g: RotatedBoxGeometry, size: ImageSize) {
  return { kind: 'polygon' as const, points: rotatedBoxCorners(g, size) };
}

/** Structural validity: finite fields and non-degenerate extents. */
export function isValidRotatedBox(g: RotatedBoxGeometry): boolean {
  const vals = [g.cx, g.cy, g.w, g.h, g.angle];
  if (!vals.every((n) => Number.isFinite(n))) return false;
  return g.w >= MIN_NORMALIZED_EXTENT && g.h >= MIN_NORMALIZED_EXTENT;
}
