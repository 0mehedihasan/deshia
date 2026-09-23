import { describe, expect, it } from 'vitest';
import { parseSchemaJson, validateSchema } from '@/schemas/validate';
import { RICKSHAW_SCHEMA } from '@/schemas/rickshaw';

describe('schema validation', () => {
  it('accepts the built-in Rickshaw schema', () => {
    const r = validateSchema(RICKSHAW_SCHEMA);
    expect(r.ok).toBe(true);
  });

  it('rejects non-snake_case keys', () => {
    const r = validateSchema({
      id: 'Bad Id',
      version: 1,
      name: 'x',
      classes: [{ key: 'a', label: 'A', views: [{ key: 'v', label: 'V', components: [] }] }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate class keys', () => {
    const r = validateSchema({
      id: 'dup',
      version: 1,
      name: 'x',
      classes: [
        { key: 'a', label: 'A', views: [{ key: 'v', label: 'V', components: [] }] },
        { key: 'a', label: 'A2', views: [{ key: 'v', label: 'V', components: [] }] },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/class keys must be unique/);
  });

  it('rejects duplicate component keys within a view', () => {
    const r = validateSchema({
      id: 'dup2',
      version: 1,
      name: 'x',
      classes: [
        {
          key: 'a',
          label: 'A',
          views: [
            {
              key: 'v',
              label: 'V',
              components: [
                { key: 'c', label: 'C', required: true, box: 'required', allowedVisibilities: ['VISIBLE'] },
                { key: 'c', label: 'C2', required: true, box: 'required', allowedVisibilities: ['VISIBLE'] },
              ],
            },
          ],
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects unknown extra properties (strict)', () => {
    const r = validateSchema({
      id: 'strict',
      version: 1,
      name: 'x',
      surprise: true,
      classes: [{ key: 'a', label: 'A', views: [{ key: 'v', label: 'V', components: [] }] }],
    });
    expect(r.ok).toBe(false);
  });

  it('parseSchemaJson reports invalid JSON without throwing', () => {
    const r = parseSchemaJson('{ not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/invalid JSON/);
  });

  it('parseSchemaJson round-trips a valid schema', () => {
    const r = parseSchemaJson(JSON.stringify(RICKSHAW_SCHEMA));
    expect(r.ok).toBe(true);
  });
});
