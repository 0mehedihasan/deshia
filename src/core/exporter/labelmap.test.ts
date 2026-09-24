import { describe, expect, it } from 'vitest';
import {
  buildLabelMap,
  cocoCategories,
  cocoCategoryId,
  yoloClassesText,
  yoloClassId,
} from '@/core/exporter/labelmap';
import { RICKSHAW_SCHEMA } from '@/schemas';

describe('label map', () => {
  const map = buildLabelMap(RICKSHAW_SCHEMA);

  it('enumerates unique component keys in schema declaration order (first wins)', () => {
    expect(map.keys).toEqual([
      'rickshaw_body',
      'steering_head',
      'pedal_crank_assembly',
      'chain',
      'rear_drive_assembly',
      'e_rickshaw_body',
      'electric_control_circuit',
      'electric_drive_area',
      'pedal',
      'electric_motor',
    ]);
  });

  it('dedupes keys shared across views (steering_head, *_body appear once)', () => {
    expect(map.keys.filter((k) => k === 'steering_head')).toHaveLength(1);
    expect(map.keys.filter((k) => k === 'e_rickshaw_body')).toHaveLength(1);
    expect(new Set(map.keys).size).toBe(map.keys.length);
  });

  it('assigns 0-based YOLO ids and 1-based COCO ids', () => {
    expect(yoloClassId(map, 'rickshaw_body')).toBe(0);
    expect(yoloClassId(map, 'electric_motor')).toBe(9);
    expect(cocoCategoryId(map, 'rickshaw_body')).toBe(1);
    expect(cocoCategoryId(map, 'electric_motor')).toBe(10);
  });

  it('throws for a component key absent from the schema', () => {
    expect(() => yoloClassId(map, 'not_a_component')).toThrow(/not present/);
    expect(() => cocoCategoryId(map, 'not_a_component')).toThrow(/not present/);
  });

  it('emits classes.txt as id-ordered lines with a trailing newline', () => {
    const text = yoloClassesText(map);
    const lines = text.split('\n');
    expect(text.endsWith('\n')).toBe(true);
    // 10 classes + the trailing empty element after the final newline.
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe('rickshaw_body');
    expect(lines[9]).toBe('electric_motor');
    expect(lines[10]).toBe('');
  });

  it('builds COCO categories with 1-based ids matching the label map', () => {
    const cats = cocoCategories(map);
    expect(cats).toHaveLength(10);
    expect(cats[0]).toEqual({ id: 1, name: 'rickshaw_body', supercategory: 'component' });
    expect(cats[9]).toEqual({ id: 10, name: 'electric_motor', supercategory: 'component' });
  });
});
