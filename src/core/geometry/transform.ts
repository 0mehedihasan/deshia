import type { ImageSize } from '@/types/domain';
import { computeContainFit } from '@/core/annotation/bbox';
import type { NormPoint } from './types';

/**
 * Viewport transforms shared by the canvas so that zoom, pan and viewport
 * resizing NEVER change stored geometry — only the mapping between stage pixels
 * and normalized image coordinates changes. All geometry stays normalized; this
 * is the single conversion seam.
 *
 * A `CanvasView` maps the natural image into stage pixels:
 *   stageX = offsetX + imageNormX * imageWidthPx  * scale
 *   stageY = offsetY + imageNormY * imageHeightPx * scale
 */
export interface CanvasView {
  /** Uniform scale: stage pixels per natural image pixel. */
  scale: number;
  /** Stage-pixel offset of the image's top-left corner. */
  offsetX: number;
  offsetY: number;
}

/** Fit-to-screen view (contain + center), reusing the canonical fit math. */
export function fitView(stageW: number, stageH: number, size: ImageSize): CanvasView {
  const f = computeContainFit(stageW, stageH, size.width, size.height);
  return { scale: f.scale, offsetX: f.offsetX, offsetY: f.offsetY };
}

/** Map a normalized image point to stage pixels. */
export function imageNormToStage(
  p: NormPoint,
  view: CanvasView,
  size: ImageSize,
): { x: number; y: number } {
  return {
    x: view.offsetX + p.x * size.width * view.scale,
    y: view.offsetY + p.y * size.height * view.scale,
  };
}

/** Map a stage-pixel point back to normalized image coordinates. */
export function stageToImageNorm(
  sp: { x: number; y: number },
  view: CanvasView,
  size: ImageSize,
): NormPoint {
  const denomX = size.width * view.scale;
  const denomY = size.height * view.scale;
  return {
    x: denomX > 0 ? (sp.x - view.offsetX) / denomX : 0,
    y: denomY > 0 ? (sp.y - view.offsetY) / denomY : 0,
  };
}

/**
 * Zoom by `factor` about a fixed stage point (e.g. the cursor), keeping the
 * image coordinate under that point stationary. This is what makes zoom feel
 * anchored and keeps pointer→image mapping exact at any zoom.
 */
export function zoomViewAt(
  view: CanvasView,
  factor: number,
  stagePoint: { x: number; y: number },
): CanvasView {
  const scale = view.scale * factor;
  return {
    scale,
    offsetX: stagePoint.x - (stagePoint.x - view.offsetX) * factor,
    offsetY: stagePoint.y - (stagePoint.y - view.offsetY) * factor,
  };
}

/** Pan by a stage-pixel delta. */
export function panView(view: CanvasView, dxStage: number, dyStage: number): CanvasView {
  return { ...view, offsetX: view.offsetX + dxStage, offsetY: view.offsetY + dyStage };
}
