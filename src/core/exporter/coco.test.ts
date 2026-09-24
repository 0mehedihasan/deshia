import { describe, expect, it } from 'vitest';
import { generateCocoJson } from '@/core/exporter/coco';
import { buildLabelMap, cocoCategoryId } from '@/core/exporter/labelmap';
import { RICKSHAW_SCHEMA } from '@/schemas';

describe('generateCocoJson', () => {
  const labelMap = buildLabelMap(RICKSHAW_SCHEMA);

  it('emits a self-contained single-image COCO document as valid JSON', () => {
    const text = generateCocoJson({
      imageId: 7,
      fileName: 'annotated_rickshaw_side_007.jpg',
      size: { width: 800, height: 600 },
      objects: [
        { name: 'rickshaw_body', box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.8 } },
        { name: 'chain', box: { xMin: 0.5, yMin: 0.6, xMax: 0.7, yMax: 0.75 } },
      ],
      labelMap,
    });

    expect(text.endsWith('\n')).toBe(true);
    const doc = JSON.parse(text);

    expect(doc.info.generator).toBe('DeshiA');
    expect(doc.images).toHaveLength(1);
    expect(doc.images[0]).toEqual({
      id: 7,
      file_name: 'annotated_rickshaw_side_007.jpg',
      width: 800,
      height: 600,
    });
  });

  it('converts normalized boxes to absolute [x, y, w, h] pixels with matching category ids', () => {
    const doc = JSON.parse(
      generateCocoJson({
        imageId: 7,
        fileName: 'img.jpg',
        size: { width: 800, height: 600 },
        objects: [
          { name: 'rickshaw_body', box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.8 } },
          { name: 'chain', box: { xMin: 0.5, yMin: 0.6, xMax: 0.7, yMax: 0.75 } },
        ],
        labelMap,
      }),
    );

    expect(doc.annotations).toHaveLength(2);
    expect(doc.annotations[0]).toEqual({
      id: 1,
      image_id: 7,
      category_id: cocoCategoryId(labelMap, 'rickshaw_body'),
      bbox: [80, 120, 320, 360],
      area: 115200,
      iscrowd: 0,
      segmentation: [],
    });
    expect(doc.annotations[1].category_id).toBe(cocoCategoryId(labelMap, 'chain'));
    expect(doc.annotations[1].bbox).toEqual([400, 360, 160, 90]);
    expect(doc.annotations[1].area).toBe(14400);
  });

  it('rounds fractional pixel geometry to 2 decimals', () => {
    const doc = JSON.parse(
      generateCocoJson({
        imageId: 1,
        fileName: 'img.jpg',
        size: { width: 100, height: 100 },
        objects: [
          { name: 'rickshaw_body', box: { xMin: 0.333, yMin: 0.333, xMax: 0.666, yMax: 0.666 } },
        ],
        labelMap,
      }),
    );
    expect(doc.annotations[0].bbox).toEqual([33.3, 33.3, 33.3, 33.3]);
    expect(doc.annotations[0].area).toBe(1108.89);
  });

  it('still emits the full category list and image entry for a zero-object image', () => {
    const doc = JSON.parse(
      generateCocoJson({
        imageId: 3,
        fileName: 'img.jpg',
        size: { width: 640, height: 480 },
        objects: [],
        labelMap,
      }),
    );
    expect(doc.annotations).toEqual([]);
    expect(doc.images).toHaveLength(1);
    expect(doc.categories).toHaveLength(labelMap.keys.length);
    expect(doc.categories[0]).toEqual({ id: 1, name: 'rickshaw_body', supercategory: 'component' });
  });

  it('throws when an object references a component key absent from the schema', () => {
    expect(() =>
      generateCocoJson({
        imageId: 1,
        fileName: 'img.jpg',
        size: { width: 100, height: 100 },
        objects: [{ name: 'not_a_component', box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } }],
        labelMap,
      }),
    ).toThrow(/not present/);
  });
});
