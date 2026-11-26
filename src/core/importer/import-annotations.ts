import type { AnnotationObject, ImageSize } from '@/types/domain';
import type { Geometry, NormPoint } from '@/core/geometry/types';
import { createObject, parseObject } from '@/core/annotation/objects';

/**
 * Pure annotation importers. They parse untrusted text into canonical objects
 * in normalized coordinates. Nothing here touches the DB, filesystem or React;
 * the caller decides which label ids exist and hands the objects to the store.
 */

export interface ImportedObject {
  /** Label id or name as it appeared in the source file. */
  labelRef: string;
  geometry: Geometry;
  attributes: AnnotationObject['attributes'];
  occluded: boolean;
  trackId: string | null;
}

function boxFromCxCyWh(cx: number, cy: number, w: number, h: number): Geometry {
  return {
    kind: 'box',
    box: {
      xMin: cx - w / 2,
      yMin: cy - h / 2,
      xMax: cx + w / 2,
      yMax: cy + h / 2,
    },
  };
}

function numbers(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/** YOLO detection TXT: `class cx cy w h` (normalized coordinates). */
export function importYolo(text: string, labelIds: readonly string[]): ImportedObject[] {
  const out: ImportedObject[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = numbers(trimmed);
    if (parts.length < 5) continue;
    const [classIndex, cx, cy, w, h] = parts as [number, number, number, number, number];
    const labelRef = labelIds[classIndex];
    if (!labelRef || w <= 0 || h <= 0) continue;
    out.push({
      labelRef,
      geometry: boxFromCxCyWh(cx, cy, w, h),
      attributes: {},
      occluded: false,
      trackId: null,
    });
  }
  return out;
}

/** COCO detection JSON: bbox in pixels, optional polygon segmentation. */
export function importCoco(json: string, size: ImageSize): ImportedObject[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return [];
  }
  if (!value || typeof value !== 'object') return [];
  const doc = value as Record<string, unknown>;
  const categories = new Map<number, string>();
  if (Array.isArray(doc.categories)) {
    for (const raw of doc.categories) {
      if (!raw || typeof raw !== 'object') continue;
      const c = raw as Record<string, unknown>;
      if (typeof c.id === 'number' && typeof c.name === 'string') categories.set(c.id, c.name);
    }
  }
  if (!Array.isArray(doc.annotations)) return [];
  const out: ImportedObject[] = [];
  for (const raw of doc.annotations) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const labelRef = categories.get(a.category_id as number);
    if (!labelRef || !Array.isArray(a.bbox)) continue;
    const [x, y, w, h] = a.bbox.map(Number);
    if (![x, y, w, h].every(Number.isFinite) || w! <= 0 || h! <= 0) continue;
    const box: Geometry = {
      kind: 'box',
      box: {
        xMin: x! / size.width,
        yMin: y! / size.height,
        xMax: (x! + w!) / size.width,
        yMax: (y! + h!) / size.height,
      },
    };
    let geometry: Geometry = box;
    const segmentation = Array.isArray(a.segmentation) ? a.segmentation[0] : undefined;
    if (Array.isArray(segmentation) && segmentation.length >= 6) {
      const nums = segmentation.map(Number);
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        points.push({ x: nums[i]! / size.width, y: nums[i + 1]! / size.height });
      }
      if (points.length >= 3) geometry = { kind: 'polygon', points };
    }
    out.push({
      labelRef,
      geometry,
      attributes:
        a.attributes && typeof a.attributes === 'object' && !Array.isArray(a.attributes)
          ? (a.attributes as AnnotationObject['attributes'])
          : {},
      occluded: a.occluded === 1 || a.occluded === true || a.iscrowd === 1,
      trackId: typeof a.track_id === 'string' ? a.track_id : null,
    });
  }
  return out;
}

function firstTag(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  return match?.[1]?.trim() ?? null;
}

/** Pascal VOC XML: one `<object>` per annotated instance. */
export function importVoc(xml: string, size: ImageSize): ImportedObject[] {
  const blocks = [...xml.matchAll(/<object\b[\s\S]*?<\/object>/gi)];
  const out: ImportedObject[] = [];
  for (const [block] of blocks) {
    const labelRef = firstTag(block, 'name');
    const bbox = firstTag(block, 'bndbox');
    if (!labelRef || !bbox) continue;
    const values = ['xmin', 'ymin', 'xmax', 'ymax'].map((tag) => Number(firstTag(bbox, tag)));
    if (!values.every(Number.isFinite)) continue;
    const [xMin, yMin, xMax, yMax] = values as [number, number, number, number];
    if (xMax <= xMin || yMax <= yMin) continue;
    out.push({
      labelRef,
      geometry: {
        kind: 'box',
        box: {
          xMin: xMin / size.width,
          yMin: yMin / size.height,
          xMax: xMax / size.width,
          yMax: yMax / size.height,
        },
      },
      attributes: {},
      occluded: firstTag(block, 'occluded') === '1',
      trackId: null,
    });
  }
  return out;
}

/** CVAT 1.1 XML: rectangles (incl. rotation), polygons, polylines, points, ellipses, cuboids. */
export function importCvat(xml: string, size: ImageSize): ImportedObject[] {
  if (!/<annotation\b/i.test(xml)) return [];
  const out: ImportedObject[] = [];
  const objects = [...xml.matchAll(/<object\b[\s\S]*?<\/object>/gi)];
  // Read either CVAT attribute style (`xmin="..."`) or the child-tag style
  // emitted by our own exporter (`<xmin>...</xmin>`).
  const readValue = (fragment: string, name: string): string | null => {
    const attribute = new RegExp(`${name}="([^"]+)"`, 'i').exec(fragment);
    if (attribute?.[1]) return attribute[1];
    return firstTag(fragment, name);
  };
  for (const [block] of objects) {
    const labelRef = firstTag(block, 'name');
    if (!labelRef) continue;
    const occluded = firstTag(block, 'occluded') === '1';
    const attributes: AnnotationObject['attributes'] = {};
    for (const match of block.matchAll(
      /<attribute\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/attribute>/gi,
    )) {
      attributes[match[1]!] = match[2]!.trim();
    }
    const base = { labelRef, attributes, occluded, trackId: null };
    const rect = firstTag(block, 'rect');
    if (rect) {
      const xMin = Number(readValue(rect, 'xmin'));
      const yMin = Number(readValue(rect, 'ymin'));
      const xMax = Number(readValue(rect, 'xmax'));
      const yMax = Number(readValue(rect, 'ymax'));
      if (![xMin, yMin, xMax, yMax].every(Number.isFinite)) continue;
      const angle = Number(readValue(rect, 'rotation') ?? 0);
      const box = {
        xMin: xMin / size.width,
        yMin: yMin / size.height,
        xMax: xMax / size.width,
        yMax: yMax / size.height,
      };
      out.push({
        ...base,
        geometry:
          Number.isFinite(angle) && angle !== 0
            ? {
                kind: 'rotated_box',
                cx: (box.xMin + box.xMax) / 2,
                cy: (box.yMin + box.yMax) / 2,
                w: box.xMax - box.xMin,
                h: box.yMax - box.yMin,
                angle: ((angle % 360) + 360) % 360,
              }
            : { kind: 'box', box },
      });
      continue;
    }
    for (const kind of ['polygon', 'polyline', 'points'] as const) {
      const raw = firstTag(block, kind);
      if (!raw) continue;
      const values = numbers(
        new RegExp(`points="([^"]+)"`, 'i').exec(raw)?.[1] ?? firstTag(raw, 'points') ?? '',
      );
      const points: NormPoint[] = [];
      for (let i = 0; i + 1 < values.length; i += 2) {
        points.push({ x: values[i]! / size.width, y: values[i + 1]! / size.height });
      }
      if (points.length >= (kind === 'polygon' ? 3 : kind === 'polyline' ? 2 : 1)) {
        out.push({ ...base, geometry: { kind, points } });
      }
      break;
    }
    const ellipse = firstTag(block, 'ellipse');
    if (ellipse) {
      const cx = Number(readValue(ellipse, 'cx') ?? 0);
      const cy = Number(readValue(ellipse, 'cy') ?? 0);
      if (![cx, cy].every(Number.isFinite)) continue;
      out.push({
        ...base,
        geometry: {
          kind: 'ellipse',
          cx: cx / size.width,
          cy: cy / size.height,
          rx: Math.abs(Number(readValue(ellipse, 'xmin') ?? 0) - cx) / size.width,
          ry: Math.abs(Number(readValue(ellipse, 'ymin') ?? 0) - cy) / size.height,
          angle: Number(readValue(ellipse, 'rotation') ?? 0),
        },
      });
      continue;
    }
    const cuboid = firstTag(block, 'cuboid');
    if (cuboid) {
      const corners = [...cuboid.matchAll(/<corner\s+x="([^"]+)"\s+y="([^"]+)"/gi)].map((m) => ({
        x: Number(m[1]) / size.width,
        y: Number(m[2]) / size.height,
      }));
      if (corners.length === 8)
        out.push({ ...base, geometry: { kind: 'cuboid', points: corners } });
    }
  }
  return out;
}

/** Native DeshiA object project: lossless round-trip. */
export function importNativeProject(json: string): AnnotationObject[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return [];
  }
  if (!value || typeof value !== 'object') return [];
  const rawObjects = (value as Record<string, unknown>).objects;
  if (!Array.isArray(rawObjects)) return [];
  return rawObjects.flatMap((item) => {
    const parsed = parseObject(item);
    return parsed ? [parsed] : [];
  });
}

/** Map imported label references to stable label ids in the current schema. */
export function resolveLabel(
  ref: string,
  labels: readonly { id: string; name: string; legacyKey?: string }[],
): string | null {
  const exact = labels.find((l) => l.id === ref || l.name === ref || l.legacyKey === ref);
  if (exact) return exact.id;
  const normalized = ref.toLowerCase().replace(/[\s-]+/g, '_');
  return (
    labels.find(
      (l) =>
        l.id.toLowerCase() === normalized ||
        l.name.toLowerCase().replace(/[\s-]+/g, '_') === normalized,
    )?.id ?? null
  );
}

/** Turn an import entry into a real object with fresh ids and safe defaults. */
export function toAnnotationObject(
  item: ImportedObject,
  labelId: string,
  labelName: string,
  id: string,
  zOrder: number,
  now = Date.now(),
): AnnotationObject {
  return {
    ...createObject({
      id,
      labelId,
      labelName,
      geometry: item.geometry,
      attributes: item.attributes,
      zOrder,
      now,
    }),
    occluded: item.occluded,
    trackId: item.trackId,
    frameNumber: 0,
  };
}
