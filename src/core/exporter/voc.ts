import { normalizedToVocPixels } from '@/core/annotation/bbox';
import type { ImageSize, NormalizedBox } from '@/types/domain';

/**
 * Pascal VOC XML generation (the initial, implemented export format).
 *
 * Structure:
 *   annotation > folder, filename, path, source, size{width,height,depth},
 *   segmented, object*{name, pose, truncated, difficult, bndbox{xmin..ymax}}
 *
 * Coordinates are converted from normalized (0..1) to 1-based inclusive VOC
 * pixels exactly at this edge (see bbox.normalizedToVocPixels).
 */

export interface VocObjectInput {
  /** Object class name — the schema component key (machine-stable). */
  name: string;
  box: NormalizedBox;
  truncated?: boolean;
  difficult?: boolean;
  pose?: string;
}

export interface VocDocInput {
  folder: string;
  filename: string;
  path: string;
  size: ImageSize;
  /** Channel depth; defaults to 3 (RGB). */
  depth?: number;
  database?: string;
  objects: VocObjectInput[];
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function objectXml(obj: VocObjectInput, size: ImageSize): string {
  const { xmin, ymin, xmax, ymax } = normalizedToVocPixels(obj.box, size);
  return [
    '  <object>',
    `    <name>${escapeXml(obj.name)}</name>`,
    `    <pose>${escapeXml(obj.pose ?? 'Unspecified')}</pose>`,
    `    <truncated>${obj.truncated ? 1 : 0}</truncated>`,
    `    <difficult>${obj.difficult ? 1 : 0}</difficult>`,
    '    <bndbox>',
    `      <xmin>${xmin}</xmin>`,
    `      <ymin>${ymin}</ymin>`,
    `      <xmax>${xmax}</xmax>`,
    `      <ymax>${ymax}</ymax>`,
    '    </bndbox>',
    '  </object>',
  ].join('\n');
}

export function generateVocXml(doc: VocDocInput): string {
  const depth = doc.depth ?? 3;
  const lines: string[] = [
    '<annotation>',
    `  <folder>${escapeXml(doc.folder)}</folder>`,
    `  <filename>${escapeXml(doc.filename)}</filename>`,
    `  <path>${escapeXml(doc.path)}</path>`,
    '  <source>',
    `    <database>${escapeXml(doc.database ?? 'DeshiA')}</database>`,
    '  </source>',
    '  <size>',
    `    <width>${Math.round(doc.size.width)}</width>`,
    `    <height>${Math.round(doc.size.height)}</height>`,
    `    <depth>${depth}</depth>`,
    '  </size>',
    '  <segmented>0</segmented>',
    ...doc.objects.map((o) => objectXml(o, doc.size)),
    '</annotation>',
    '',
  ];
  return lines.join('\n');
}
