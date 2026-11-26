import { describe, expect, it } from 'vitest';
import {
  importCoco,
  importCvat,
  importNativeProject,
  importVoc,
  importYolo,
  resolveLabel,
  toAnnotationObject,
} from './import-annotations';
import { createObject, serializeObjects } from '@/core/annotation/objects';

const size = { width: 1000, height: 500 };

describe('annotation importers', () => {
  it('imports YOLO boxes in normalized coordinates', () => {
    const items = importYolo('0 0.5 0.5 0.2 0.4\n1 0.25 0.25 0.1 0.1\n', ['car', 'bus']);
    expect(items).toHaveLength(2);
    expect(items[0]?.labelRef).toBe('car');
    expect(items[0]?.geometry).toEqual({
      kind: 'box',
      box: { xMin: 0.4, yMin: 0.3, xMax: 0.6, yMax: 0.7 },
    });
  });

  it('imports COCO boxes and polygon segmentation', () => {
    const json = JSON.stringify({
      categories: [{ id: 1, name: 'car' }],
      annotations: [
        {
          category_id: 1,
          bbox: [100, 100, 200, 100],
          segmentation: [[100, 100, 300, 100, 300, 200]],
          attributes: { color: 'red' },
        },
      ],
    });
    const items = importCoco(json, size);
    expect(items[0]?.geometry.kind).toBe('polygon');
    expect(items[0]?.attributes.color).toBe('red');
  });

  it('imports Pascal VOC XML with occlusion', () => {
    const xml = `<annotation><object><name>car</name><occluded>1</occluded><bndbox><xmin>100</xmin><ymin>50</ymin><xmax>300</xmax><ymax>250</ymax></bndbox></object></annotation>`;
    const items = importVoc(xml, size);
    expect(items).toHaveLength(1);
    expect(items[0]?.occluded).toBe(true);
    expect(items[0]?.geometry).toEqual({
      kind: 'box',
      box: { xMin: 0.1, yMin: 0.1, xMax: 0.3, yMax: 0.5 },
    });
  });

  it('imports CVAT rectangles, rotation and polygons', () => {
    const xml = `<annotation><object><name>car</name><occluded>1</occluded><rect><xmin>100</xmin><ymin>50</ymin><xmax>300</xmax><ymax>250</ymax><rotation>90</rotation></rect></object><object><name>road</name><polygon><points>0,0;100,0;100,100</points></polygon></object></annotation>`;
    const items = importCvat(xml, size);
    expect(items).toHaveLength(2);
    expect(items[0]?.geometry.kind).toBe('rotated_box');
    expect(items[0]?.occluded).toBe(true);
    expect(items[1]?.geometry.kind).toBe('polygon');
  });

  it('round-trips the native project format and resolves labels', () => {
    const original = createObject({
      id: 'a',
      labelId: 'car',
      labelName: 'Car',
      geometry: box(),
      zOrder: 0,
      now: 1,
    });
    const project = JSON.stringify({
      format: 'deshia-object-project',
      version: 1,
      objects: [original],
    });
    const restored = importNativeProject(project);
    expect(restored[0]?.id).toBe('a');
    expect(resolveLabel('Car', [{ id: 'car', name: 'Car' }])).toBe('car');
    expect(resolveLabel('unknown', [{ id: 'car', name: 'Car' }])).toBeNull();
    const made = toAnnotationObject(
      { labelRef: 'car', geometry: box(), attributes: {}, occluded: true, trackId: 't1' },
      'car',
      'Car',
      'new',
      3,
    );
    expect(made.occluded).toBe(true);
    expect(made.trackId).toBe('t1');
    expect(serializeObjects([made])).toContain('"id":"new"');
  });
});

function box() {
  return { kind: 'box' as const, box: { xMin: 0, yMin: 0, xMax: 0.5, yMax: 0.5 } };
}
