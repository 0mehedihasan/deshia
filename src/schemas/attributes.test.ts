import { describe, expect, it } from 'vitest';
import {
  defaultAttributeValues,
  validateAttributeValue,
  validateAttributes,
  type AttributeDef,
} from '@/schemas/attributes';

describe('attribute validation', () => {
  it('enforces required fields', () => {
    const def: AttributeDef = { id: 'a', key: 'note', label: 'Note', type: 'text', required: true };
    expect(validateAttributeValue(def, null)).not.toBeNull();
    expect(validateAttributeValue(def, '')).not.toBeNull();
    expect(validateAttributeValue(def, 'ok')).toBeNull();
  });

  it('checks integer/decimal typing and numeric bounds', () => {
    const def: AttributeDef = { id: 'a', key: 'n', label: 'N', type: 'integer', min: 0, max: 10 };
    expect(validateAttributeValue(def, 3.5)).not.toBeNull();
    expect(validateAttributeValue(def, -1)).not.toBeNull();
    expect(validateAttributeValue(def, 11)).not.toBeNull();
    expect(validateAttributeValue(def, 7)).toBeNull();
  });

  it('validates single and multi choice against allowed options', () => {
    const single: AttributeDef = {
      id: 'a',
      key: 'c',
      label: 'C',
      type: 'single_choice',
      options: [{ value: 'x' }, { value: 'y' }],
    };
    expect(validateAttributeValue(single, 'z')).not.toBeNull();
    expect(validateAttributeValue(single, 'x')).toBeNull();
    const multi: AttributeDef = { ...single, key: 'm', type: 'multi_choice' };
    expect(validateAttributeValue(multi, ['x', 'z'])).not.toBeNull();
    expect(validateAttributeValue(multi, ['x', 'y'])).toBeNull();
  });

  it('builds default value bags and validates them in aggregate', () => {
    const defs: AttributeDef[] = [
      { id: 'a', key: 'm', label: 'M', type: 'multi_choice', options: [{ value: 'x' }] },
      { id: 'b', key: 'flag', label: 'Flag', type: 'boolean', defaultValue: false },
    ];
    expect(defaultAttributeValues(defs)).toEqual({ m: [], flag: false });
    expect(validateAttributes(defs, { m: [], flag: false })).toEqual([]);
  });
});
