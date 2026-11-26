import type { AnnotationObject, NormalizedBox } from '@/types/domain';
import type { ImageSize } from '@/types/domain';
import { geometryBounds, geometryToPolygon, isRotatedGeometry } from '@/core/geometry/convert';
import { schemaLabels } from '@/schemas/traverse';
import type { RecursiveSchema } from '@/schemas/nodes';
import type { LabelMap } from './labelmap';
import { escapeXml } from './voc';

/**
 * Export adapters for the generalized (many-objects-per-image) annotation
 * model. Formats that cannot represent a geometry never drop it silently: the
 * conversion is explicit and every loss is reported to the caller.
 */

export interface ExportLoss {
  /** Stable code for reports/tests. */
  code:
    | 'AABB_FALLBACK'
    | 'SKIPPED_SHAPE'
    | 'SKIPPED_VIDEO'
    | 'ATTRIBUTES_OMITTED'
    | 'POINTS_AS_BOX';
  count: number;
  message: string;
}

export interface ExportedObject {
  id: string;
  name: string;
  box: NormalizedBox;
  labelId: string;
  attributes: AnnotationObject['attributes'];
  occluded: boolean;
  zOrder: number;
  trackId: string | null;
}

/** Build a stable class map from the recursive schema's annotatable labels. */
export function buildObjectLabelMap(schema: RecursiveSchema | null): LabelMap {
  const labels = schema ? schemaLabels(schema) : [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const label of labels) {
    if (!seen.has(label.id)) {
      seen.add(label.id);
      keys.push(label.id);
    }
  }
  return {
    keys,
    index: new Map(keys.map((key, i) => [key, i])),
  };
}

/** Axis-aligned bounding box of an object in normalized coordinates. */
export function objectNormalizedBox(obj: AnnotationObject, size: ImageSize): NormalizedBox {
  return geometryBounds(obj.geometry, size);
}

/** Objects eligible for export: visible, present in the scene, with a label. */
export function exportableObjects(objects: readonly AnnotationObject[]): AnnotationObject[] {
  return objects.filter((o) => o.visible && !o.outside && !!o.labelId);
}

/**
 * Convert objects to the simple `{name, box}` shape shared by the existing VOC,
 * COCO and YOLO writers. Non-box geometries fall back to their AABB; each
 * fallback is counted so the caller can report the loss.
 */
export function objectsToBoxes(
  objects: readonly AnnotationObject[],
  size: ImageSize,
): { objects: ExportedObject[]; losses: ExportLoss[] } {
  const losses: ExportLoss[] = [];
  const byKind = new Map<string, number>();
  const bump = (code: ExportLoss['code'], message: string) => {
    const existing = losses.find((l) => l.code === code);
    if (existing) existing.count += 1;
    else losses.push({ code, count: 1, message });
  };
  const out: ExportedObject[] = [];
  for (const obj of exportableObjects(objects)) {
    if (isRotatedGeometry(obj.geometry)) {
      bump('AABB_FALLBACK', 'Rotated shapes were exported as their enclosing axis-aligned box.');
    }
    if (obj.geometry.kind === 'polygon') {
      bump(
        'AABB_FALLBACK',
        'Polygons were reduced to bounding boxes (use COCO segmentation for lossless export).',
      );
    }
    if (
      obj.geometry.kind === 'polyline' ||
      obj.geometry.kind === 'points' ||
      obj.geometry.kind === 'cuboid'
    ) {
      bump('POINTS_AS_BOX', 'Paths, keypoint groups and cuboids were reduced to bounding boxes.');
    }
    if (obj.geometry.kind === 'point') {
      bump('SKIPPED_SHAPE', 'Point annotations have no detection-box equivalent and were skipped.');
      continue;
    }
    byKind.set(obj.geometry.kind, (byKind.get(obj.geometry.kind) ?? 0) + 1);
    out.push({
      id: obj.id,
      name: obj.labelId,
      labelId: obj.labelId,
      box: objectNormalizedBox(obj, size),
      attributes: obj.attributes,
      occluded: obj.occluded,
      zOrder: obj.zOrder,
      trackId: obj.trackId,
    });
  }
  if (out.some((o) => Object.keys(o.attributes).length > 0)) {
    bump(
      'ATTRIBUTES_OMITTED',
      'Pascal VOC, COCO and YOLO do not carry custom attributes here; use CVAT XML or the native project.',
    );
  }
  return { objects: out, losses };
}

/** COCO segmentation for polygon objects (lossless where the format supports it). */
export function cocoSegmentations(
  objects: readonly AnnotationObject[],
  size: ImageSize,
): Array<{ id: string; points: Array<[number, number]> }> {
  return exportableObjects(objects)
    .filter((o) => o.geometry.kind === 'polygon')
    .map((o) => ({
      id: o.id,
      points: geometryToPolygon(o.geometry, size).map(
        (p) => [Math.round(p.x * size.width), Math.round(p.y * size.height)] as [number, number],
      ),
    }));
}

function shapeXml(
  obj: ExportedObject,
  geometry: AnnotationObject['geometry'],
  size: ImageSize,
): string {
  const attrs = `occluded="${obj.occluded ? 1 : 0}" z_order="${obj.zOrder}"`;
  const label = escapeXml(obj.labelId);
  const header = `    <object><name>${label}</name><deleted>0</deleted>${attrs}`;
  const attributes = Object.entries(obj.attributes)
    .filter(([, value]) => value !== null && value !== '')
    .map(
      ([key, value]) =>
        `<attribute name="${escapeXml(key)}">${escapeXml(Array.isArray(value) ? value.join(',') : String(value))}</attribute>`,
    )
    .join('');
  if (geometry.kind === 'polygon' || geometry.kind === 'polyline') {
    const points = geometryToPolygon(geometry, size)
      .map((p) => `${(p.x * size.width).toFixed(2)},${(p.y * size.height).toFixed(2)}`)
      .join(';');
    return `${header}<${geometry.kind}><points>${points}</points></${geometry.kind}>${attributes}</object>`;
  }
  if (geometry.kind === 'points') {
    const points = geometry.points
      .map((p) => `${(p.x * size.width).toFixed(2)},${(p.y * size.height).toFixed(2)}`)
      .join(';');
    return `${header}<points><points>${points}</points></points>${attributes}</object>`;
  }
  if (geometry.kind === 'cuboid') {
    const corners = geometry.points
      .map(
        (p) =>
          `<corner x="${(p.x * size.width).toFixed(2)}" y="${(p.y * size.height).toFixed(2)}"/>`,
      )
      .join('');
    return `${header}<cuboid>${corners}</cuboid>${attributes}</object>`;
  }
  if (geometry.kind === 'point') {
    return `${header}<point><x>${(geometry.point.x * size.width).toFixed(2)}</x><y>${(geometry.point.y * size.height).toFixed(2)}</y></point>${attributes}</object>`;
  }
  const b = obj.box;
  const xMin = (b.xMin * size.width).toFixed(2);
  const yMin = (b.yMin * size.height).toFixed(2);
  const xMax = (b.xMax * size.width).toFixed(2);
  const yMax = (b.yMax * size.height).toFixed(2);
  const rotation =
    geometry.kind === 'rotated_box'
      ? geometry.angle.toFixed(2)
      : geometry.kind === 'ellipse'
        ? geometry.angle.toFixed(2)
        : null;
  const kind = geometry.kind === 'ellipse' ? 'ellipse' : 'rect';
  const rotationXml = rotation !== null ? `<rotation>${rotation}</rotation>` : '';
  const extra =
    geometry.kind === 'ellipse'
      ? `<cx>${(((b.xMin + b.xMax) / 2) * size.width).toFixed(2)}</cx><cy>${(((b.yMin + b.yMax) / 2) * size.height).toFixed(2)}</cy>`
      : '';
  return `${header}<${kind}><xmin>${xMin}</xmin><ymin>${yMin}</ymin><xmax>${xMax}</xmax><ymax>${yMax}</ymax>${rotationXml}${extra}</${kind}>${attributes}</object>`;
}

/** CVAT 1.1 style XML with real occlusion, z-order, attributes and geometry. */
export function generateCvatXmlForObjects(params: {
  fileName: string;
  size: ImageSize;
  objects: readonly AnnotationObject[];
  schema: RecursiveSchema | null;
}): string {
  const converted = objectsToBoxes(params.objects, params.size);
  const labels = params.schema ? schemaLabels(params.schema) : [];
  const labelXml = labels
    .map(
      (l) =>
        `  <label><name>${escapeXml(l.id)}</name><color>${escapeXml((l.color ?? '#4DA3FF').replace('#', ''))}</color></label>`,
    )
    .join('\n');
  const byId = new Map(converted.objects.map((o) => [o.id, o]));
  const objectsXml = exportableObjects(params.objects)
    .flatMap((obj) => {
      const exported = byId.get(obj.id);
      return exported ? [shapeXml(exported, obj.geometry, params.size)] : [];
    })
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<annotation>
<version>1.1</version>
<meta><task><labels>\n${labelXml}\n</labels></task></meta>
<image name="${escapeXml(params.fileName)}" width="${params.size.width}" height="${params.size.height}">
${objectsXml}
</image>
</annotation>
`;
}

/** Native, lossless project entry for the generalized object model. */
export function nativeObjectProject(params: {
  schema: RecursiveSchema | null;
  objects: readonly AnnotationObject[];
  mediaId: string;
  width: number;
  height: number;
}): string {
  return JSON.stringify(
    {
      format: 'deshia-object-project',
      version: 1,
      schema: params.schema,
      media: {
        id: params.mediaId,
        width: params.width,
        height: params.height,
      },
      objects: params.objects,
    },
    null,
    2,
  );
}
