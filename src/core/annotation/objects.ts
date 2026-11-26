import type { AnnotationObject, AttributeValue, GeometryType } from '@/types/domain';
import type { ImageSize } from '@/types/domain';
import type { Geometry, NormPoint } from '@/core/geometry/types';
import { isValidNormalizedBox } from './bbox';
import {
  isValidEllipse,
  isValidCuboid,
  isValidPoints,
  moveCuboid,
  moveEllipse,
  movePoints,
} from '@/core/geometry/extended-shapes';
import {
  isValidPolygon,
  isValidPolyline,
  isValidPoint,
  moveVertices,
} from '@/core/geometry/shapes';
import { isValidRotatedBox, moveRotatedBox } from '@/core/geometry/rotated-box';
import { validateAttributes } from '@/schemas/attributes';
import type { SchemaNode } from '@/schemas/nodes';

/**
 * Domain logic for the generalized (many-objects-per-image) annotation model.
 *
 * Pure and framework-agnostic: no React, DB or filesystem imports. The original
 * component-box model stays intact for the Rickshaw dataset; objects are an
 * additive, schema-driven layer that lets one image hold N independent labels,
 * each with its own geometry, attributes, flags and track identity.
 */

export interface ObjectIssue {
  code:
    | 'UNKNOWN_LABEL'
    | 'BAD_GEOMETRY'
    | 'GEOMETRY_NOT_ALLOWED'
    | 'BAD_ATTRIBUTES'
    | 'LOCKED'
    | 'INVALID_FLAGS';
  message: string;
  objectId?: string;
}

/** Map the geometry union to the schema/DB vocabulary. */
export function geometryTypeOf(g: Geometry): GeometryType {
  switch (g.kind) {
    case 'box':
      return 'RECTANGLE';
    case 'rotated_box':
      return 'ROTATED_BOX';
    case 'polygon':
      return 'POLYGON';
    case 'polyline':
      return 'POLYLINE';
    case 'point':
      return 'POINT';
    case 'points':
      return 'POINTS';
    case 'ellipse':
      return 'ELLIPSE';
    case 'cuboid':
      return 'CUBOID';
  }
}

/** Does this geometry satisfy its own invariants? */
export function isValidGeometry(g: Geometry): boolean {
  switch (g.kind) {
    case 'box':
      return isValidNormalizedBox(g.box);
    case 'rotated_box':
      return isValidRotatedBox(g);
    case 'polygon':
      return isValidPolygon(g.points);
    case 'polyline':
      return isValidPolyline(g.points);
    case 'point':
      return isValidPoint(g.point);
    case 'points':
      return isValidPoints(g);
    case 'ellipse':
      return isValidEllipse(g);
    case 'cuboid':
      return isValidCuboid(g);
    default:
      return false;
  }
}

/** Translate a geometry kind from the schema/DB vocabulary, if allowed. */
export function geometryKindFromType(type: GeometryType): Geometry['kind'] | null {
  const map: Record<GeometryType, Geometry['kind']> = {
    RECTANGLE: 'box',
    ROTATED_BOX: 'rotated_box',
    POLYGON: 'polygon',
    POLYLINE: 'polyline',
    POINT: 'point',
    POINTS: 'points',
    ELLIPSE: 'ellipse',
    CUBOID: 'cuboid',
  };
  return map[type] ?? null;
}

/**
 * Validate one object against its label definition. An optional `label` node
 * enables label existence + allowed-geometry + attribute checks; omitting it
 * performs the intrinsic checks only (useful for persistence round-trips).
 */
export function validateObject(obj: AnnotationObject, label?: SchemaNode): ObjectIssue[] {
  const issues: ObjectIssue[] = [];
  if (!obj.labelId || !obj.labelName) {
    issues.push({
      code: 'UNKNOWN_LABEL',
      message: 'Every object needs a label.',
      objectId: obj.id,
    });
  }
  if (!isValidGeometry(obj.geometry)) {
    issues.push({
      code: 'BAD_GEOMETRY',
      message: `Invalid ${geometryTypeOf(obj.geometry)} geometry.`,
      objectId: obj.id,
    });
  }
  if (!Number.isInteger(obj.zOrder) || obj.zOrder < -2147483648 || obj.zOrder > 2147483647) {
    issues.push({ code: 'INVALID_FLAGS', message: 'Invalid stacking order.', objectId: obj.id });
  }
  if (obj.score !== null && (obj.score < 0 || obj.score > 1 || !Number.isFinite(obj.score))) {
    issues.push({
      code: 'INVALID_FLAGS',
      message: 'Score must be between 0 and 1.',
      objectId: obj.id,
    });
  }
  if (label) {
    if (label.id !== obj.labelId) {
      issues.push({
        code: 'UNKNOWN_LABEL',
        message: `Label "${obj.labelId}" does not match the schema.`,
        objectId: obj.id,
      });
    }
    if (label.geometryTypes && label.geometryTypes.length > 0) {
      const allowed: readonly Geometry['kind'][] = label.geometryTypes;
      if (!allowed.includes(obj.geometry.kind)) {
        issues.push({
          code: 'GEOMETRY_NOT_ALLOWED',
          message: `Label "${label.name}" does not allow ${geometryTypeOf(obj.geometry)}.`,
          objectId: obj.id,
        });
      }
    }
    if (label.attributes) {
      const attributeIssues = validateAttributes(label.attributes, obj.attributes);
      if (attributeIssues.length > 0) {
        issues.push({
          code: 'BAD_ATTRIBUTES',
          message: attributeIssues.map((e) => e.message).join('; '),
          objectId: obj.id,
        });
      }
    }
  }
  return issues;
}

/** Validate every object in a frame. */
export function validateObjects(
  objects: readonly AnnotationObject[],
  labelById: ReadonlyMap<string, SchemaNode> = new Map(),
): ObjectIssue[] {
  return objects.flatMap((o) => validateObject(o, labelById.get(o.labelId)));
}

// ---- stacking order (CVAT z_order semantics) ------------------------------

/** Stable paint order: ascending z_order, original order for ties. */
export function sortByZOrder(objects: readonly AnnotationObject[]): AnnotationObject[] {
  return objects
    .map((o, i) => ({ o, i }))
    .sort((a, b) => a.o.zOrder - b.o.zOrder || a.i - b.i)
    .map(({ o }) => o);
}

/** The next free stacking value, so a new object paints above all others. */
export function nextZOrder(objects: readonly AnnotationObject[]): number {
  return objects.reduce((max, o) => Math.max(max, o.zOrder), 0) + 1;
}

export type ZOrderMove = 'back' | 'backward' | 'forward' | 'front';

/** Apply one of CVAT's four stacking operations to the selected object. */
export function moveZOrder(
  objects: readonly AnnotationObject[],
  id: string,
  move: ZOrderMove,
): AnnotationObject[] {
  const sorted = sortByZOrder(objects);
  const index = sorted.findIndex((o) => o.id === id);
  if (index < 0) return [...objects];
  const target = sorted[index]!;
  let z = target.zOrder;
  if (move === 'back') z = (sorted[0]?.zOrder ?? 0) - 1;
  else if (move === 'front') z = (sorted[sorted.length - 1]?.zOrder ?? 0) + 1;
  else if (move === 'backward' && index > 0) {
    const before = sorted[index - 1]!;
    // Swap values so the relative order flips without colliding with neighbours.
    const swapped = before.zOrder;
    return objects.map((o) => {
      if (o.id === target.id) return { ...o, zOrder: swapped };
      if (o.id === before.id) return { ...o, zOrder: z };
      return o;
    });
  } else if (move === 'forward' && index < sorted.length - 1) {
    const after = sorted[index + 1]!;
    const swapped = after.zOrder;
    return objects.map((o) => {
      if (o.id === target.id) return { ...o, zOrder: swapped };
      if (o.id === after.id) return { ...o, zOrder: z };
      return o;
    });
  }
  return objects.map((o) => (o.id === id ? { ...o, zOrder: z } : o));
}

// ---- geometry editing helpers ---------------------------------------------

/** Translate any geometry by a normalized delta (used by move + duplicate). */
export function offsetGeometry(g: Geometry, dx: number, dy: number): Geometry {
  switch (g.kind) {
    case 'box':
      return {
        kind: 'box',
        box: {
          xMin: g.box.xMin + dx,
          yMin: g.box.yMin + dy,
          xMax: g.box.xMax + dx,
          yMax: g.box.yMax + dy,
        },
      };
    case 'rotated_box':
      return moveRotatedBox(g, dx, dy);
    case 'polygon':
    case 'polyline':
      return { ...g, points: moveVertices(g.points, dx, dy) };
    case 'point':
      return { kind: 'point', point: { x: g.point.x + dx, y: g.point.y + dy } };
    case 'points':
      return movePoints(g, dx, dy);
    case 'ellipse':
      return moveEllipse(g, dx, dy);
    case 'cuboid':
      return moveCuboid(g, dx, dy);
    default:
      return g;
  }
}

/** Replace one point of a point-list geometry (polygon/polyline/points/cuboid). */
export function setGeometryPoint(g: Geometry, index: number, p: NormPoint): Geometry {
  switch (g.kind) {
    case 'polygon':
    case 'polyline':
    case 'points':
      return { ...g, points: g.points.map((v, i) => (i === index ? p : v)) };
    case 'cuboid':
      return {
        kind: 'cuboid',
        points: g.points.map((v, i) => (i === index ? p : v)),
      };
    default:
      return g;
  }
}

/** Insert a vertex into a path geometry (polygon/polyline only). */
export function insertGeometryPoint(g: Geometry, index: number, p: NormPoint): Geometry {
  if (g.kind !== 'polygon' && g.kind !== 'polyline') return g;
  const points = [...g.points];
  points.splice(Math.max(0, Math.min(points.length, index)), 0, p);
  return { ...g, points };
}

/** Remove a vertex from a path geometry, respecting kind-specific minimums. */
export function removeGeometryPoint(g: Geometry, index: number): Geometry {
  if (g.kind !== 'polygon' && g.kind !== 'polyline') return g;
  const min = g.kind === 'polygon' ? 3 : 2;
  if (g.points.length <= min || index < 0 || index >= g.points.length) return g;
  return { ...g, points: g.points.filter((_, i) => i !== index) };
}

/** Factory for a new manual object with safe defaults. */
export function createObject(input: {
  id: string;
  labelId: string;
  labelName: string;
  geometry: Geometry;
  attributes?: Record<string, AttributeValue>;
  zOrder: number;
  frameNumber?: number;
  now?: number;
}): AnnotationObject {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    labelId: input.labelId,
    labelName: input.labelName,
    geometry: input.geometry,
    attributes: input.attributes ?? {},
    occluded: false,
    zOrder: input.zOrder,
    visible: true,
    locked: false,
    trackId: null,
    frameNumber: input.frameNumber ?? 0,
    outside: false,
    source: 'MANUAL',
    score: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Duplicate an object: fresh id, no track link, shifted geometry (CVAT-style). */
export function duplicateObject(
  obj: AnnotationObject,
  id: string,
  dx = 0.02,
  dy = 0.02,
  now = Date.now(),
): AnnotationObject {
  return {
    ...obj,
    id,
    geometry: offsetGeometry(obj.geometry, dx, dy),
    attributes: { ...obj.attributes },
    trackId: null,
    frameNumber: obj.frameNumber,
    zOrder: obj.zOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- persistence serialization --------------------------------------------

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): value is NormPoint {
  return isRecord(value) && isNumber(value.x) && isNumber(value.y);
}

function isPointList(value: unknown): value is NormPoint[] {
  return Array.isArray(value) && value.every(isPoint);
}

/** Parse an untrusted geometry JSON value into the canonical union. */
export function parseGeometry(value: unknown): Geometry | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  switch (value.kind) {
    case 'box': {
      const b = value.box;
      if (
        !isRecord(b) ||
        !isNumber(b.xMin) ||
        !isNumber(b.yMin) ||
        !isNumber(b.xMax) ||
        !isNumber(b.yMax)
      )
        return null;
      return { kind: 'box', box: { xMin: b.xMin, yMin: b.yMin, xMax: b.xMax, yMax: b.yMax } };
    }
    case 'rotated_box':
      if (![value.cx, value.cy, value.w, value.h, value.angle].every(isNumber)) return null;
      return {
        kind: 'rotated_box',
        cx: value.cx as number,
        cy: value.cy as number,
        w: value.w as number,
        h: value.h as number,
        angle: value.angle as number,
      };
    case 'polygon':
    case 'polyline':
    case 'points':
    case 'cuboid':
      if (!isPointList(value.points)) return null;
      return { kind: value.kind, points: value.points.map((p) => ({ x: p.x, y: p.y })) };
    case 'point':
      return isPoint(value.point) ? { kind: 'point', point: { ...value.point } } : null;
    case 'ellipse':
      if (![value.cx, value.cy, value.rx, value.ry, value.angle].every(isNumber)) return null;
      return {
        kind: 'ellipse',
        cx: value.cx as number,
        cy: value.cy as number,
        rx: value.rx as number,
        ry: value.ry as number,
        angle: value.angle as number,
      };
    default:
      return null;
  }
}

/** Parse one untrusted object row. Returns null (skips) for corrupt rows. */
export function parseObject(value: unknown): AnnotationObject | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.labelId !== 'string') return null;
  const geometry = parseGeometry(value.geometry);
  if (!geometry) return null;
  const attributes: Record<string, AttributeValue> = {};
  if (isRecord(value.attributes)) {
    for (const [key, raw] of Object.entries(value.attributes)) {
      if (
        raw === null ||
        typeof raw === 'string' ||
        typeof raw === 'number' ||
        typeof raw === 'boolean'
      ) {
        attributes[key] = raw;
      } else if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
        attributes[key] = raw as string[];
      }
    }
  }
  const now = Date.now();
  return {
    id: value.id,
    labelId: value.labelId,
    labelName: typeof value.labelName === 'string' ? value.labelName : value.labelId,
    geometry,
    attributes,
    occluded: value.occluded === true,
    zOrder: isNumber(value.zOrder) ? Math.trunc(value.zOrder) : 0,
    visible: value.visible !== false,
    locked: value.locked === true,
    trackId: typeof value.trackId === 'string' ? value.trackId : null,
    frameNumber: isNumber(value.frameNumber) ? Math.max(0, Math.trunc(value.frameNumber)) : 0,
    outside: value.outside === true,
    source: value.source === 'AI' ? 'AI' : 'MANUAL',
    score: isNumber(value.score) ? value.score : null,
    createdAt: isNumber(value.createdAt) ? value.createdAt : now,
    updatedAt: isNumber(value.updatedAt) ? value.updatedAt : now,
  };
}

/** Serialize objects to the canonical JSON stored in DB and audit snapshots. */
export function serializeObjects(objects: readonly AnnotationObject[]): string {
  return JSON.stringify(objects);
}

/** Parse a serialized object list defensively. Never throws on corrupt data. */
export function parseObjects(json: string | null | undefined): AnnotationObject[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const obj = parseObject(item);
      return obj ? [obj] : [];
    });
  } catch {
    return [];
  }
}

/** Bounding box of an object in normalized coordinates (for hit-test/culling). */
export function objectBounds(obj: AnnotationObject, size: ImageSize) {
  const g = obj.geometry;
  // Import kept local to avoid a cycle through convert.ts → extended-shapes.
  if (g.kind === 'box') return g.box;
  if (g.kind === 'ellipse') {
    const rad = (g.angle * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const w = g.rx * c + g.ry * s;
    const h = g.rx * s + g.ry * c;
    return { xMin: g.cx - w, yMin: g.cy - h, xMax: g.cx + w, yMax: g.cy + h };
  }
  const points = g.kind === 'point' ? [g.point] : g.kind === 'rotated_box' ? [] : g.points;
  if (g.kind === 'rotated_box') {
    const rad = (g.angle * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const hw = (g.w / 2) * c + (g.h / 2) * s * (size.height / size.width);
    const hh = (g.h / 2) * c + (g.w / 2) * s * (size.width / size.height);
    return { xMin: g.cx - hw, yMin: g.cy - hh, xMax: g.cx + hw, yMax: g.cy + hh };
  }
  if (points.length === 0) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    xMin: Math.min(...xs),
    yMin: Math.min(...ys),
    xMax: Math.max(...xs),
    yMax: Math.max(...ys),
  };
}
