import { safeSegment } from '@/core/filesystem/paths';

/**
 * Deterministic output filename generation.
 *
 * Names are derived from the persistent `images.datasetIndex` — NEVER from a
 * directory file count and NEVER from the (untrusted) source filename
 * (see .claude/CLAUDE.md §10).
 *
 *   raw_<class>_<view>_<NNN>.<ext>
 *   annotated_<class>_<view>_<NNN>.<jpg|xml>
 */

/** Zero-pad the dataset index. Pads to at least 3 digits, grows as needed. */
export function formatIndex(datasetIndex: number, width = 3): string {
  if (!Number.isInteger(datasetIndex) || datasetIndex < 0) {
    throw new Error(`datasetIndex must be a non-negative integer, got ${datasetIndex}`);
  }
  return String(datasetIndex).padStart(width, '0');
}

function stem(prefix: string, classKey: string, viewKey: string, datasetIndex: number): string {
  return `${prefix}_${safeSegment(classKey)}_${safeSegment(viewKey)}_${formatIndex(datasetIndex)}`;
}

/** Clean image extension for output; default jpg. */
export function outputImageExt(sourceExt: string): 'jpg' | 'png' {
  const e = sourceExt.replace(/^\./, '').toLowerCase();
  return e === 'png' ? 'png' : 'jpg';
}

export function rawImageName(
  classKey: string,
  viewKey: string,
  datasetIndex: number,
  sourceExt: string,
): string {
  return `${stem('raw', classKey, viewKey, datasetIndex)}.${outputImageExt(sourceExt)}`;
}

export function annotatedImageName(
  classKey: string,
  viewKey: string,
  datasetIndex: number,
  sourceExt: string,
): string {
  return `${stem('annotated', classKey, viewKey, datasetIndex)}.${outputImageExt(sourceExt)}`;
}

export function annotationXmlName(
  classKey: string,
  viewKey: string,
  datasetIndex: number,
): string {
  return `${stem('annotated', classKey, viewKey, datasetIndex)}.xml`;
}

/** Per-image COCO JSON filename (shares the annotated stem). */
export function annotationCocoName(
  classKey: string,
  viewKey: string,
  datasetIndex: number,
): string {
  return `${stem('annotated', classKey, viewKey, datasetIndex)}.json`;
}

/** Per-image YOLO label filename (shares the annotated stem). */
export function annotationYoloName(
  classKey: string,
  viewKey: string,
  datasetIndex: number,
): string {
  return `${stem('annotated', classKey, viewKey, datasetIndex)}.txt`;
}

/** Dataset-level YOLO class-list filename (one per ANNOTATED root). */
export const YOLO_CLASSES_FILENAME = 'classes.txt';

export function visualizationName(
  classKey: string,
  viewKey: string,
  datasetIndex: number,
  sourceExt: string,
): string {
  return `${stem('viz', classKey, viewKey, datasetIndex)}.${outputImageExt(sourceExt)}`;
}
