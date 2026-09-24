import { describe, expect, it } from 'vitest';
import { buildLabelMap, yoloClassId } from '@/core/exporter/labelmap';
import { generateYoloTxt } from '@/core/exporter/yolo';
import { RICKSHAW_SCHEMA } from '@/schemas';

describe('generateYoloTxt', () => {
  const map = buildLabelMap(RICKSHAW_SCHEMA);

  it('writes one line per object: <class_id> <cx> <cy> <w> <h>, all 6-decimal normalized', () => {
    const text = generateYoloTxt(
      [
        { name: 'rickshaw_body', box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.8 } },
        { name: 'chain', box: { xMin: 0.5, yMin: 0.6, xMax: 0.7, yMax: 0.75 } },
      ],
      map,
    );

    expect(text).toBe(
      '0 0.300000 0.500000 0.400000 0.600000\n' +
        `${yoloClassId(map, 'chain')} 0.600000 0.675000 0.200000 0.150000\n`,
    );
  });

  it('ends every non-empty file with a trailing newline', () => {
    const text = generateYoloTxt(
      [{ name: 'rickshaw_body', box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } }],
      map,
    );
    expect(text.endsWith('\n')).toBe(true);
    expect(text.split('\n').filter((l) => l.length > 0)).toEqual([
      '0 0.500000 0.500000 1.000000 1.000000',
    ]);
  });

  it('emits an empty string for a zero-object (background) image', () => {
    expect(generateYoloTxt([], map)).toBe('');
  });

  it('throws when an object references a component key absent from the schema', () => {
    expect(() =>
      generateYoloTxt(
        [{ name: 'not_a_component', box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } }],
        map,
      ),
    ).toThrow(/not present/);
  });
});
