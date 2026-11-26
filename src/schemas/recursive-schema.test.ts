import { describe, expect, it } from 'vitest';
import { RICKSHAW_SCHEMA } from '@/schemas/rickshaw';
import { findLabelByLegacyKey, migrateFlatToRecursive } from '@/schemas/migrate';
import { collectIds, flattenLabels, maxDepth } from '@/schemas/traverse';
import {
  parseRecursiveSchemaJson,
  serializeRecursiveSchema,
  validateRecursiveSchema,
} from '@/schemas/nodes-validate';

const flatComponentCount = RICKSHAW_SCHEMA.classes.flatMap((c) =>
  c.views.flatMap((v) => v.components),
).length;

describe('flat -> recursive migration (safe, reference-preserving)', () => {
  it('maps class/view/component into a 3-deep node forest', () => {
    const rec = migrateFlatToRecursive(RICKSHAW_SCHEMA);
    expect(rec.formatVersion).toBe(1);
    expect(rec.roots).toHaveLength(RICKSHAW_SCHEMA.classes.length);
    expect(maxDepth(rec.roots)).toBe(3);
    expect(flattenLabels(rec.roots)).toHaveLength(flatComponentCount);
  });

  it('bridges legacy component keys so existing annotations still resolve', () => {
    const rec = migrateFlatToRecursive(RICKSHAW_SCHEMA);
    const chain = findLabelByLegacyKey(rec.roots, 'chain');
    expect(chain?.name).toBe('Chain');
    expect(chain?.kind).toBe('label');
    expect(chain?.geometryTypes).toEqual(['box']);
  });

  it('uses deterministic ids (idempotent) and renaming never changes an id', () => {
    const a = migrateFlatToRecursive(RICKSHAW_SCHEMA);
    const b = migrateFlatToRecursive(RICKSHAW_SCHEMA);
    expect(collectIds(a.roots)).toEqual(collectIds(b.roots));
    const chain = findLabelByLegacyKey(a.roots, 'chain')!;
    const id = chain.id;
    chain.name = 'Renamed';
    expect(chain.id).toBe(id);
  });
});

describe('recursive schema import validation (untrusted JSON)', () => {
  const rec = migrateFlatToRecursive(RICKSHAW_SCHEMA);

  it('accepts a valid schema and rejects malformed input', () => {
    expect(validateRecursiveSchema(rec).ok).toBe(true);
    expect(validateRecursiveSchema(42).ok).toBe(false);
    expect(validateRecursiveSchema({}).ok).toBe(false);
  });

  it('refuses an unsupported future format version', () => {
    const res = validateRecursiveSchema({ ...rec, formatVersion: 999 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toMatch(/unsupported/i);
  });

  it('rejects duplicate node ids', () => {
    const dup = {
      formatVersion: 1,
      id: 's',
      name: 's',
      version: 1,
      roots: [
        {
          id: 'dupe',
          kind: 'group',
          name: 'A',
          enabled: true,
          archived: false,
          visible: true,
          children: [],
        },
        {
          id: 'dupe',
          kind: 'group',
          name: 'B',
          enabled: true,
          archived: false,
          visible: true,
          children: [],
        },
      ],
    };
    const res = validateRecursiveSchema(dup);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toMatch(/duplicate/i);
  });

  it('round-trips through native JSON without loss', () => {
    const back = parseRecursiveSchemaJson(serializeRecursiveSchema(rec));
    expect(back.ok).toBe(true);
    if (back.ok) expect(flattenLabels(back.schema.roots)).toHaveLength(flatComponentCount);
  });
});
