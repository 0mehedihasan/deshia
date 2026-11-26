import type { ImageSize } from '@/types/domain';
import type { NormPoint } from './types';

/** Euclidean distance in PIXELS between two normalized points. */
export function distancePx(a: NormPoint, b: NormPoint, size: ImageSize): number {
  return Math.hypot((a.x - b.x) * size.width, (a.y - b.y) * size.height);
}

/** Distance in PIXELS from point `p` to segment `a→b`. */
export function distanceToSegmentPx(
  p: NormPoint,
  a: NormPoint,
  b: NormPoint,
  size: ImageSize,
): number {
  const ax = a.x * size.width;
  const ay = a.y * size.height;
  const bx = b.x * size.width;
  const by = b.y * size.height;
  const px = p.x * size.width;
  const py = p.y * size.height;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
