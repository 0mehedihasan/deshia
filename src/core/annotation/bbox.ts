import type { ImageSize, NormalizedBox, PixelBox } from '@/types/domain';

/**
 * Bounding-box geometry. The canonical internal representation is normalized
 * (0..1); pixel conversion happens only at the canvas and exporter edges.
 *
 * Invariants (see .claude/CLAUDE.md §7):
 *   0 <= xMin < xMax <= 1  and  0 <= yMin < yMax <= 1
 */

/** Smallest normalized side we accept — guards against degenerate zero-area boxes. */
export const MIN_NORMALIZED_SIDE = 1e-4;

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Build a normalized box from two arbitrary corner points (in 0..1 space),
 * ordering the coordinates so the invariant holds. Returns null if the box is
 * degenerate (smaller than MIN_NORMALIZED_SIDE on either axis).
 */
export function normalizedBoxFromCorners(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): NormalizedBox | null {
  const xMin = clamp01(Math.min(ax, bx));
  const xMax = clamp01(Math.max(ax, bx));
  const yMin = clamp01(Math.min(ay, by));
  const yMax = clamp01(Math.max(ay, by));
  if (xMax - xMin < MIN_NORMALIZED_SIDE || yMax - yMin < MIN_NORMALIZED_SIDE) {
    return null;
  }
  return { xMin, yMin, xMax, yMax };
}

/** Validate that a normalized box satisfies the DeshiA invariant. */
export function isValidNormalizedBox(box: NormalizedBox): boolean {
  const { xMin, yMin, xMax, yMax } = box;
  if (![xMin, yMin, xMax, yMax].every((n) => Number.isFinite(n))) return false;
  if (xMin < 0 || yMin < 0 || xMax > 1 || yMax > 1) return false;
  return xMin < xMax && yMin < yMax;
}

/**
 * Clamp a normalized box back into the unit square while preserving ordering.
 * Returns null if the result would be degenerate.
 */
export function clampNormalizedBox(box: NormalizedBox): NormalizedBox | null {
  return normalizedBoxFromCorners(box.xMin, box.yMin, box.xMax, box.yMax);
}

/** Convert a normalized box to absolute pixels for a given image size. */
export function normalizedToPixel(box: NormalizedBox, size: ImageSize): PixelBox {
  return {
    xMin: box.xMin * size.width,
    yMin: box.yMin * size.height,
    xMax: box.xMax * size.width,
    yMax: box.yMax * size.height,
  };
}

/** Convert an absolute pixel box to a normalized box for a given image size. */
export function pixelToNormalized(box: PixelBox, size: ImageSize): NormalizedBox {
  if (size.width <= 0 || size.height <= 0) {
    throw new Error('pixelToNormalized: image size must be positive');
  }
  return {
    xMin: clamp01(box.xMin / size.width),
    yMin: clamp01(box.yMin / size.height),
    xMax: clamp01(box.xMax / size.width),
    yMax: clamp01(box.yMax / size.height),
  };
}

/**
 * Convert a normalized box to integer VOC pixel coordinates. Pascal VOC uses
 * 1-based inclusive pixel indices; we round, clamp to the image, and guarantee
 * xmin<=xmax, ymin<=ymax with at least a 1px extent.
 */
export function normalizedToVocPixels(
  box: NormalizedBox,
  size: ImageSize,
): { xmin: number; ymin: number; xmax: number; ymax: number } {
  const px = normalizedToPixel(box, size);
  let xmin = Math.round(px.xMin) + 1;
  let ymin = Math.round(px.yMin) + 1;
  let xmax = Math.round(px.xMax);
  let ymax = Math.round(px.yMax);
  xmin = Math.min(Math.max(1, xmin), size.width);
  ymin = Math.min(Math.max(1, ymin), size.height);
  xmax = Math.min(Math.max(xmin, xmax), size.width);
  ymax = Math.min(Math.max(ymin, ymax), size.height);
  return { xmin, ymin, xmax, ymax };
}

/** Normalized area (0..1) of a box. */
export function normalizedArea(box: NormalizedBox): number {
  return Math.max(0, box.xMax - box.xMin) * Math.max(0, box.yMax - box.yMin);
}
