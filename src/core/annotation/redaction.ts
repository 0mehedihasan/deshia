import type { ImageSize, RedactionCircle } from '@/types/domain';
import { clamp01 } from './bbox';

/**
 * Circular privacy-redaction geometry (client-safe: no Sharp, no Node Buffer).
 *
 * A redaction is stored normalized — center as a fraction of width/height and
 * radius as a fraction of the image WIDTH (see `RedactionCircle`). This keeps
 * the region round at any resolution because the canvas contain-fit and the
 * exporter both scale by that same axis. The pure pixel layout below is shared
 * by the exporter's Sharp compositor and is fully unit-testable on its own.
 */

/** Smallest normalized radius we accept — guards against mis-click dots. */
export const MIN_NORMALIZED_RADIUS = 5e-3;

/** Upper sanity bound on the normalized radius (a face never fills 2× width). */
export const MAX_NORMALIZED_RADIUS = 2;

/** True when a redaction circle is finite, in-range, and above the min radius. */
export function isValidRedaction(circle: RedactionCircle): boolean {
  const { cx, cy, r } = circle;
  if (![cx, cy, r].every((n) => Number.isFinite(n))) return false;
  if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return false;
  return r >= MIN_NORMALIZED_RADIUS && r <= MAX_NORMALIZED_RADIUS;
}

/**
 * Clamp a redaction back into range while preserving its id. Returns null if the
 * center is non-finite or the radius is below the mis-click threshold (so a bare
 * click that produced a zero-radius circle is rejected rather than stored).
 */
export function clampRedaction(circle: RedactionCircle): RedactionCircle | null {
  const { id, cx, cy, r } = circle;
  if (![cx, cy, r].every((n) => Number.isFinite(n))) return null;
  if (r < MIN_NORMALIZED_RADIUS) return null;
  return {
    id,
    cx: clamp01(cx),
    cy: clamp01(cy),
    r: Math.min(MAX_NORMALIZED_RADIUS, r),
  };
}

/** The pixel-space extract rectangle + true center for one redaction circle. */
export interface RedactionPixelLayout {
  /** Top-left of the extract rectangle, clamped inside the image. */
  left: number;
  top: number;
  /** Size of the extract rectangle (>0), clamped inside the image. */
  width: number;
  height: number;
  /** True circle center/radius in pixels (may sit outside the clamped rect). */
  cxPx: number;
  cyPx: number;
  rPx: number;
}

function clampInt(value: number, min: number, max: number): number {
  const i = Math.round(value);
  return i < min ? min : i > max ? max : i;
}

/**
 * Compute the pixel extract rectangle for a redaction circle against an image of
 * `size`, clamped so it never leaves the image (circles near an edge yield a
 * partial rectangle). Returns null if the clamped rectangle is empty. The true
 * (unclamped) center and radius are returned too, so a caller can build the
 * circular mask relative to the rectangle origin even when the circle is clipped.
 */
export function redactionPixelLayout(
  circle: RedactionCircle,
  size: ImageSize,
): RedactionPixelLayout | null {
  const W = Math.max(1, Math.round(size.width));
  const H = Math.max(1, Math.round(size.height));
  const cxPx = circle.cx * W;
  const cyPx = circle.cy * H;
  const rPx = circle.r * W;
  const left = clampInt(cxPx - rPx, 0, W);
  const top = clampInt(cyPx - rPx, 0, H);
  const right = clampInt(cxPx + rPx, 0, W);
  const bottom = clampInt(cyPx + rPx, 0, H);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0 || rPx <= 0) return null;
  return { left, top, width, height, cxPx, cyPx, rPx };
}

/**
 * Number of mosaic cells across the LONGER edge of a redaction region. Because a
 * circle is sized to the face, reducing the region to this few blocks reliably
 * destroys facial detail at any resolution (a bigger face just gets bigger
 * blocks). Kept deliberately low so the result is unrecognizable, not merely
 * softened the way a Gaussian blur is.
 */
export const MOSAIC_CELLS = 8;

/** The small grid a region is averaged down to before the hard upscale. */
export interface MosaicGrid {
  width: number;
  height: number;
}

/**
 * The downscaled grid size for a region of `width`×`height` pixels: at most
 * MOSAIC_CELLS along the longer edge, aspect preserved, never below 1px. Pure.
 */
export function mosaicDownscaleSize(width: number, height: number): MosaicGrid {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longer = Math.max(w, h);
  const scale = Math.min(1, MOSAIC_CELLS / longer);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * Expand a small RGBA grid (`src`, `sw`×`sh`) to `dw`×`dh` with nearest-neighbour
 * sampling — producing HARD mosaic blocks — while masking to the (possibly
 * clipped) circle via a 1px-feathered alpha. `cxLocal`/`cyLocal` are the circle
 * center relative to the destination tile origin. Pure and Sharp-free (operates
 * on plain byte arrays), so the pixelation is deterministic and unit-testable;
 * the exporter only has to average the region down and PNG-encode the result.
 * Doing the upscale by hand guarantees blocky output regardless of how the image
 * library interpolates enlargement (a smooth enlarge would just be blur again).
 */
export function mosaicMaskedRGBA(
  src: Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  cxLocal: number,
  cyLocal: number,
  rPx: number,
): Uint8Array {
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      const si = (sy * sw + sx) * 4;
      const dx = x + 0.5 - cxLocal;
      const dy = y + 0.5 - cyLocal;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 1px feather at the edge so the disc blends instead of aliasing.
      const coverage = Math.max(0, Math.min(1, rPx - dist + 0.5));
      const di = (y * dw + x) * 4;
      // `si`/`si+n` are always in bounds (sx<sw, sy<sh), but strict indexed
      // access widens them to `number | undefined`, so coalesce to 0/255.
      out[di] = src[si] ?? 0;
      out[di + 1] = src[si + 1] ?? 0;
      out[di + 2] = src[si + 2] ?? 0;
      const srcAlpha = src[si + 3] ?? 255;
      out[di + 3] = Math.round(coverage * (srcAlpha / 255) * 255);
    }
  }
  return out;
}
