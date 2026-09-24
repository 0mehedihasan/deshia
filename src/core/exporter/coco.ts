import { normalizedToPixel } from '@/core/annotation/bbox';
import type { ImageSize, NormalizedBox } from '@/types/domain';
import { cocoCategories, cocoCategoryId, type LabelMap } from './labelmap';

/**
 * COCO detection JSON generation.
 *
 * DeshiA emits ONE self-contained COCO document PER IMAGE (not a single growing
 * aggregate file). This keeps the submission transaction per-image, atomic and
 * idempotent — re-submitting an image overwrites only that image's file and
 * never rewrites a shared, ever-growing dataset file. Each document is a valid
 * COCO file describing exactly one image; downstream tooling can trivially merge
 * per-image files into one aggregate if desired.
 *
 * COCO bbox convention: [x, y, width, height] in ABSOLUTE pixels, top-left
 * origin. Coordinates are converted from normalized (0..1) at this edge.
 */

export interface CocoObjectInput {
  /** Object class name — the schema component key (machine-stable). */
  name: string;
  box: NormalizedBox;
}

export interface CocoDocInput {
  /** Numeric image id — the persistent dataset index (stable, integer). */
  imageId: number;
  /** The annotated (clean) image filename this document describes. */
  fileName: string;
  size: ImageSize;
  objects: CocoObjectInput[];
  labelMap: LabelMap;
  description?: string;
}

/** Round to 2 decimals to avoid float noise in pixel coordinates. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function generateCocoJson(doc: CocoDocInput): string {
  const { imageId, fileName, size, objects, labelMap } = doc;

  const annotations = objects.map((obj, i) => {
    const px = normalizedToPixel(obj.box, size);
    const w = Math.max(0, px.xMax - px.xMin);
    const h = Math.max(0, px.yMax - px.yMin);
    return {
      id: i + 1,
      image_id: imageId,
      category_id: cocoCategoryId(labelMap, obj.name),
      bbox: [round2(px.xMin), round2(px.yMin), round2(w), round2(h)],
      area: round2(w * h),
      iscrowd: 0,
      segmentation: [] as number[][],
    };
  });

  const document = {
    info: {
      description: doc.description ?? 'DeshiA annotation export',
      version: '1.0',
      generator: 'DeshiA',
    },
    images: [
      {
        id: imageId,
        file_name: fileName,
        width: Math.round(size.width),
        height: Math.round(size.height),
      },
    ],
    annotations,
    categories: cocoCategories(labelMap),
  };

  return JSON.stringify(document, null, 2) + '\n';
}
