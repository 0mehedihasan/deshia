import { describe, expect, it } from 'vitest';
import {
  buildObjectLabelMap,
  generateCvatXmlForObjects,
  nativeObjectProject,
  objectsToBoxes,
} from './object-formats';
import { createObject } from '@/core/annotation/objects';
import { createEmptyRecursiveSchema, createLabel } from '@/schemas/nodes';

const size = { width: 1000, height: 500 };

function object(
  id: string,
  labelId: string,
  geometry: Parameters<typeof createObject>[0]['geometry'],
) {
  return createObject({ id, labelId, labelName: labelId, geometry, zOrder: 1, now: 1 });
}

const box = { kind: 'box' as const, box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.8 } };

describe('generalized object exporters', () => {
  it('builds a deterministic label map from recursive schema labels', () => {
    const schema = createEmptyRecursiveSchema('Test');
    schema.roots = [
      createLabel('Car', ['box'], { id: 'car' }),
      createLabel('Bus', ['box'], { id: 'bus' }),
    ];
    const map = buildObjectLabelMap(schema);
    expect(map.keys).toEqual(['car', 'bus']);
    expect(map.index.get('bus')).toBe(1);
  });

  it('converts objects to boxes and reports every loss', () => {
    const objects = [
      object('a', 'car', box),
      object('b', 'car', { kind: 'point', point: { x: 0.5, y: 0.5 } }),
      object('c', 'car', {
        kind: 'polygon',
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.1 },
          { x: 0.2, y: 0.2 },
        ],
      }),
    ];
    const result = objectsToBoxes(objects, size);
    expect(result.objects).toHaveLength(2);
    expect(result.losses.map((l) => l.code)).toContain('SKIPPED_SHAPE');
    expect(result.losses.map((l) => l.code)).toContain('AABB_FALLBACK');
  });

  it('writes CVAT XML with geometry, occlusion and z-order', () => {
    const obj = object('a', 'car', {
      kind: 'polygon',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
    });
    obj.occluded = true;
    const xml = generateCvatXmlForObjects({
      fileName: 'annotated_car_all_001.jpg',
      size,
      objects: [obj],
      schema: null,
    });
    expect(xml).toContain('<polygon>');
    expect(xml).toContain('occluded="1"');
    expect(xml).toContain('z_order="1"');
  });

  it('round-trips objects through the native project format', () => {
    const obj = object('a', 'car', box);
    obj.attributes.color = 'red';
    const json = nativeObjectProject({
      schema: null,
      objects: [obj],
      mediaId: 'img1',
      width: size.width,
      height: size.height,
    });
    const parsed = JSON.parse(json) as { objects: Array<{ id: string; attributes: Record<string, string> }> };
    expect(parsed.objects[0]?.id).toBe('a');
    expect(parsed.objects[0]?.attributes.color).toBe('red');
  });
});
