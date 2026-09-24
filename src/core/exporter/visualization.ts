import sharp from 'sharp';
import { hexToRgb, type AnnotationColor } from '@/core/annotation/palette';
import type { ImageSize, NormalizedBox } from '@/types/domain';
import { outputImageExt } from './filenames';

/**
 * Box-rendered preview images for the VISUALIZATIONS/ tree.
 *
 * These are the ONLY images DeshiA draws boxes onto (see .claude/CLAUDE.md §10):
 * the RAW and ANNOTATED copies always stay clean. A visualization is a copy of
 * the source image with a translucent, colored box drawn per exported object,
 * using the same deterministic palette the workbench uses (`colorsForView`), so
 * a preview matches exactly what the annotator saw.
 *
 * Rendering composites plain RGBA raster tiles (one transparent interior fill +
 * four opaque border strips per box) — the SAME raster machinery the clean-image
 * copy already relies on. It deliberately avoids SVG/text rasterization in the
 * native layer, which is a separate (librsvg/pango) code path that is not needed
 * for a box preview and can crash some libvips builds when fed an overlay.
 */

export interface VizObject {
  box: NormalizedBox;
  /** Palette color for this object's component (its base hex drives the tint). */
  color: AnnotationColor;
  /** Human label for the component. Retained for a future text overlay. */
  label: string;
}

/** A solid RGBA tile to composite over the source, in absolute pixels. */
export interface VizRect {
  left: number;
  top: number;
  width: number;
  height: number;
  r: number;
  g: number;
  b: number;
  /** 0..1 opacity: borders are opaque, the interior fill stays highly transparent. */
  alpha: number;
}

/** Interior fill opacity — image must stay clearly visible underneath (§9). */
const FILL_ALPHA = 0.1;

function clampInt(value: number, min: number, max: number): number {
  const i = Math.round(value);
  return i < min ? min : i > max ? max : i;
}

/**
 * Compute the raster tiles that overlay the annotated boxes onto an image of
 * `size`: one translucent interior fill plus four opaque border strips per
 * object, all in absolute pixels and clamped inside the image. Pure and
 * deterministic (no Sharp, no SVG), so it is fully unit-testable and every tile
 * is guaranteed to sit within the base image.
 */
export function layoutVizRects(size: ImageSize, objects: VizObject[]): VizRect[] {
  const W = Math.max(1, Math.round(size.width));
  const H = Math.max(1, Math.round(size.height));
  const stroke = Math.max(2, Math.round(Math.min(W, H) * 0.004));
  const rects: VizRect[] = [];

  for (const obj of objects) {
    const { r, g, b } = hexToRgb(obj.color.base);
    const x0 = clampInt(obj.box.xMin * W, 0, W);
    const y0 = clampInt(obj.box.yMin * H, 0, H);
    const x1 = clampInt(obj.box.xMax * W, 0, W);
    const y1 = clampInt(obj.box.yMax * H, 0, H);
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const sw = Math.min(stroke, w, h);

    // Interior fill first, then the four opaque borders on top of it.
    rects.push({ left: x0, top: y0, width: w, height: h, r, g, b, alpha: FILL_ALPHA });
    rects.push({ left: x0, top: y0, width: w, height: sw, r, g, b, alpha: 1 });
    rects.push({ left: x0, top: y0 + h - sw, width: w, height: sw, r, g, b, alpha: 1 });
    rects.push({ left: x0, top: y0, width: sw, height: h, r, g, b, alpha: 1 });
    rects.push({ left: x0 + w - sw, top: y0, width: sw, height: h, r, g, b, alpha: 1 });
  }

  return rects;
}

/**
 * Render a box-annotated preview of `srcPath` to `destPath`. Never mutates the
 * source (Sharp reads it, composites tiles, writes a fresh file). The overlay is
 * laid out against the source's ACTUAL decoded dimensions so every tile is
 * guaranteed to fit inside the base — an overflowing composite input would make
 * libvips reject the whole operation.
 */
export async function renderVisualization(params: {
  srcPath: string;
  destPath: string;
  ext: string;
  size: ImageSize;
  objects: VizObject[];
}): Promise<void> {
  const meta = await sharp(params.srcPath, { failOn: 'none' }).metadata();
  const size: ImageSize = {
    width: meta.width ?? Math.max(1, Math.round(params.size.width)),
    height: meta.height ?? Math.max(1, Math.round(params.size.height)),
  };

  const tiles = layoutVizRects(size, params.objects);
  const overlays = await Promise.all(
    tiles.map(async (t) => ({
      input: await sharp({
        create: {
          width: t.width,
          height: t.height,
          channels: 4,
          background: { r: t.r, g: t.g, b: t.b, alpha: t.alpha },
        },
      })
        .png()
        .toBuffer(),
      left: t.left,
      top: t.top,
    })),
  );

  const pipeline = sharp(params.srcPath, { failOn: 'none' }).composite(overlays);
  if (outputImageExt(params.ext) === 'png') {
    await pipeline.png().toFile(params.destPath);
  } else {
    await pipeline.jpeg({ quality: 90 }).toFile(params.destPath);
  }
}
