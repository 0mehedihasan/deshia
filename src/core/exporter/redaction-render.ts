import sharp from 'sharp';
import {
  mosaicDownscaleSize,
  mosaicMaskedRGBA,
  redactionPixelLayout,
} from '@/core/annotation/redaction';
import type { ImageSize, RedactionCircle } from '@/types/domain';

/**
 * Sharp compositor for circular face/privacy redaction (see .claude/CLAUDE.md
 * §4, §10).
 *
 * Each redaction is applied as a MOSAIC (pixelation), not a Gaussian blur: a
 * blur only softens a face and often leaves it recognizable, whereas averaging
 * the region down to a handful of blocks destroys the detail for good. For each
 * circle we extract its bounding tile from the SOURCE, average it down to a
 * small grid (`mosaicDownscaleSize`), then expand that grid back to full size
 * with hard nearest-neighbour blocks and a feathered circular alpha
 * (`mosaicMaskedRGBA`). The masked RGBA patch is PNG-encoded and handed back
 * positioned at the tile's top-left. The caller composites these patches over
 * the image copies (RAW / ANNOTATED / VISUALIZATIONS) — never over the
 * read-only source. Building the block expansion by hand (rather than a Sharp
 * enlarge) guarantees crisp mosaic squares regardless of how libvips would
 * interpolate an upscale, and building the patch as a raw buffer avoids the
 * SVG/text native path that can crash some libvips builds.
 */

/** An RGBA patch to composite over an image copy, in absolute pixels. */
export interface RedactionComposite {
  input: Buffer;
  left: number;
  top: number;
}

/**
 * Produce one mosaic circular patch per redaction, ready to composite over an
 * image copy of `size`. Reads the source read-only; returns [] when there are no
 * circles so the no-face path is a plain copy with zero behavior change. A single
 * bad circle is skipped rather than failing the whole export.
 */
export async function buildRedactionComposites(
  srcPath: string,
  size: ImageSize,
  circles: RedactionCircle[],
): Promise<RedactionComposite[]> {
  if (circles.length === 0) return [];
  const patches: RedactionComposite[] = [];
  for (const circle of circles) {
    const layout = redactionPixelLayout(circle, size);
    if (!layout) continue;
    const { left, top, width, height, cxPx, cyPx, rPx } = layout;
    const grid = mosaicDownscaleSize(width, height);

    // Average the tile down to the mosaic grid (a normal reduction kernel is a
    // good area-average here), then read it back as raw RGBA bytes.
    const small = await sharp(srcPath, { failOn: 'none' })
      .extract({ left, top, width, height })
      .resize(grid.width, grid.height, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Expand to hard blocks + circular alpha by hand, then PNG-encode the patch.
    const masked = mosaicMaskedRGBA(
      small.data,
      small.info.width,
      small.info.height,
      width,
      height,
      cxPx - left,
      cyPx - top,
      rPx,
    );
    const patch = await sharp(Buffer.from(masked), { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
    patches.push({ input: patch, left, top });
  }
  return patches;
}
