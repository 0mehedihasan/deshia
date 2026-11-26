import { describe, expect, it } from 'vitest';
import {
  createObject,
  duplicateObject,
  geometryTypeOf,
  insertGeometryPoint,
  isValidGeometry,
  moveZOrder,
  nextZOrder,
  offsetGeometry,
  parseObjects,
  removeGeometryPoint,
  serializeObjects,
  sortByZOrder,
  validateObject,
  validateObjects,
} from './objects';
import type { AnnotationObject } from '@/types/domain';
import type { Geometry } from '@/core/geometry/types';
import { createLabel } from '@/schemas/nodes';

function object(id: string, geometry: Geometry, zOrder = 0): AnnotationObject {
  return createObject({
    id,
    labelId: 'car',
    labelName: 'Car',
    geometry,
    zOrder,
    now: 1000,
  });
}

const box: Geometry = {
  kind: 'box',
  box: { xMin: 0.1, yMin: 0.2, xMax: 0.4, yMax: 0.6 },
};

describe('annotation objects', () => {
  it('maps every geometry kind to the schema vocabulary', () => {
    expect(geometryTypeOf(box)).toBe('RECTANGLE');
    expect(
      geometryTypeOf({ kind: 'rotated_box', cx: 0.5, cy: 0.5, w: 0.2, h: 0.1, angle: 30 }),
    ).toBe('ROTATED_BOX');
    expect(geometryTypeOf({ kind: 'polygon', points: [] })).toBe('POLYGON');
    expect(geometryTypeOf({ kind: 'polyline', points: [] })).toBe('POLYLINE');
    expect(geometryTypeOf({ kind: 'point', point: { x: 0, y: 0 } })).toBe('POINT');
    expect(geometryTypeOf({ kind: 'points', points: [] })).toBe('POINTS');
    expect(geometryTypeOf({ kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1, angle: 0 })).toBe(
      'ELLIPSE',
    );
    expect(geometryTypeOf({ kind: 'cuboid', points: [] })).toBe('CUBOID');
  });

  it('validates geometry invariants without throwing', () => {
    expect(isValidGeometry(box)).toBe(true);
    expect(isValidGeometry({ kind: 'box', box: { xMin: 0.5, yMin: 0, xMax: 0.4, yMax: 1 } })).toBe(
      false,
    );
    expect(
      isValidGeometry({
        kind: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
        ],
      }),
    ).toBe(true);
    expect(
      isValidGeometry({
        kind: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      }),
    ).toBe(false);
    expect(isValidGeometry({ kind: 'points', points: [{ x: 0.5, y: 0.5 }] })).toBe(true);
    expect(isValidGeometry({ kind: 'points', points: [] })).toBe(false);
    expect(isValidGeometry({ kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0, ry: 0.1, angle: 0 })).toBe(
      false,
    );
  });

  it('validates objects against a label definition', () => {
    const label = createLabel('Car', ['box', 'polygon'], {
      id: 'car',
      attributes: [
        { id: 'attr_color', key: 'color', label: 'Color', type: 'text', required: true },
      ],
    });
    const withColor = object('a', box);
    withColor.attributes.color = 'red';
    expect(validateObject(withColor, label)).toEqual([]);
    const bad = object('b', { kind: 'rotated_box', cx: 0.5, cy: 0.5, w: 0.1, h: 0.1, angle: 0 });
    expect(validateObject(bad, label).map((i) => i.code)).toContain('GEOMETRY_NOT_ALLOWED');
    expect(validateObject(object('c', box), label).map((i) => i.code)).toContain('BAD_ATTRIBUTES');
    expect(validateObjects([withColor], new Map([['car', label]]))).toEqual([]);
  });

  it('sorts and moves z-order like CVAT', () => {
    const a = object('a', box, 0);
    const b = object('b', box, 3);
    const c = object('c', box, 7);
    expect(sortByZOrder([c, a, b]).map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(nextZOrder([a, b, c])).toBe(8);
    expect(
      moveZOrder([a, b, c], 'b', 'back')[1]?.id === 'b' ||
        moveZOrder([a, b, c], 'b', 'back')[0]?.id === 'b',
    ).toBe(true);
    expect(sortByZOrder(moveZOrder([a, b, c], 'b', 'forward')).map((o) => o.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(sortByZOrder(moveZOrder([a, b, c], 'b', 'backward')).map((o) => o.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(sortByZOrder(moveZOrder([a, b, c], 'b', 'front')).map((o) => o.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('offsets and duplicates geometry without aliasing', () => {
    const moved = offsetGeometry(box, 0.01, 0.02);
    expect(moved.kind).toBe('box');
    if (moved.kind === 'box') {
      expect(moved.box.xMin).toBeCloseTo(0.11);
      expect(moved.box.yMin).toBeCloseTo(0.22);
      expect(moved.box.xMax).toBeCloseTo(0.41);
      expect(moved.box.yMax).toBeCloseTo(0.62);
    }
    const original = object('a', box);
    const copy = duplicateObject(original, 'copy');
    expect(copy.id).toBe('copy');
    expect(copy.trackId).toBeNull();
    expect(copy.geometry).not.toBe(original.geometry);
  });

  it('inserts and removes path vertices respecting minimums', () => {
    const path: Geometry = {
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    const inserted = insertGeometryPoint(path, 1, { x: 0.5, y: 0 });
    expect(inserted.kind === 'polygon' && inserted.points).toHaveLength(4);
    const removed = removeGeometryPoint(inserted, 1);
    expect(removed.kind === 'polygon' && removed.points).toHaveLength(3);
    expect(removeGeometryPoint(path, 0)).toBe(path);
  });

  it('round-trips objects through JSON and skips corrupt rows', () => {
    const original = [
      object('a', box),
      object('b', { kind: 'point', point: { x: 0.5, y: 0.5 } }, 2),
    ];
    const restored = parseObjects(serializeObjects(original));
    expect(restored).toEqual(original);
    expect(parseObjects('{"not":"an array"}')).toEqual([]);
    expect(parseObjects('[{"id":"x","labelId":"x","geometry":{"kind":"nope"}}]')).toEqual([]);
  });
});
