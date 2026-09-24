import type { NormalizedBox } from '@/types/domain';
import { yoloClassId, type LabelMap } from './labelmap';

/**
 * YOLO (Darknet) label generation.
 *
 * One `.txt` per image, one object per line:
 *
 *   <class_id> <x_center> <y_center> <width> <height>
 *
 * All four geometry values are normalized to (0..1) relative to the image — the
 * exact representation DeshiA already stores, so no image size is needed. The
 * class id is the 0-based index from the dataset-level label map (classes.txt).
 *
 * An image with no exported objects yields an EMPTY file, which is a valid YOLO
 * label (a background/negative image). Callers must therefore allow a 0-byte
 * YOLO file during verification.
 */

export interface YoloObjectInput {
  /** Object class name — the schema component key (machine-stable). */
  name: string;
  box: NormalizedBox;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Fixed 6-decimal normalized value, clamped to [0, 1]. */
function fmt(n: number): string {
  return clamp01(n).toFixed(6);
}

export function generateYoloTxt(objects: YoloObjectInput[], map: LabelMap): string {
  const lines = objects.map((obj) => {
    const { xMin, yMin, xMax, yMax } = obj.box;
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const w = xMax - xMin;
    const h = yMax - yMin;
    return `${yoloClassId(map, obj.name)} ${fmt(cx)} ${fmt(cy)} ${fmt(w)} ${fmt(h)}`;
  });
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}
