import { describe, expect, it } from 'vitest';
import {
  createEmptyRecursiveSchema,
  createGroup,
  createLabel,
  generalPurposeTemplate,
  type SchemaNode,
} from '@/schemas/nodes';
import {
  collectIds,
  countNodes,
  findDuplicateIds,
  findNodeById,
  flattenLabels,
  isAnnotatable,
  maxDepth,
  nodePath,
} from '@/schemas/traverse';

function sampleForest(): SchemaNode[] {
  // Arbitrary, non-domain hierarchy to prove generality (any depth, any names).
  return [
    createGroup('Vehicle', {
      id: 'g_vehicle',
      children: [
        createGroup('Rickshaw', {
          id: 'g_rickshaw',
          children: [
            createLabel('Body', ['box', 'polygon'], { id: 'l_body' }),
            createLabel('Wheel', ['box'], { id: 'l_wheel', archived: true }),
          ],
        }),
      ],
    }),
    createLabel('Standalone', ['point'], { id: 'l_alone', enabled: false }),
  ];
}

describe('schema node constructors', () => {
  it('creates sensible group/label defaults', () => {
    const g = createGroup('G');
    expect(g.kind).toBe('group');
    expect(g.enabled && g.visible && !g.archived).toBe(true);
    const l = createLabel('L');
    expect(l.kind).toBe('label');
    expect(l.geometryTypes).toEqual(['box']);
    expect(l.attributes).toEqual([]);
  });
  it('empty + general template are neutral (no domain ontology baked in)', () => {
    expect(createEmptyRecursiveSchema().roots).toHaveLength(0);
    const t = generalPurposeTemplate();
    expect(countNodes(t.roots)).toEqual({ groups: 1, labels: 1, total: 2 });
  });
});

describe('recursive traversal', () => {
  const roots = sampleForest();
  it('finds nodes and breadcrumb paths at any depth', () => {
    expect(findNodeById(roots, 'l_body')?.name).toBe('Body');
    expect(nodePath(roots, 'l_body').map((n) => n.id)).toEqual([
      'g_vehicle',
      'g_rickshaw',
      'l_body',
    ]);
    expect(maxDepth(roots)).toBe(3);
  });
  it('flattens annotatable labels, excluding archived/disabled by default', () => {
    expect(flattenLabels(roots).map((n) => n.id)).toEqual(['l_body']);
    expect(
      flattenLabels(roots, { includeArchived: true, includeDisabled: true }).map((n) => n.id),
    ).toEqual(['l_body', 'l_wheel', 'l_alone']);
  });
  it('reports annotatability and detects duplicate ids', () => {
    expect(isAnnotatable(findNodeById(roots, 'l_body')!)).toBe(true);
    expect(isAnnotatable(findNodeById(roots, 'l_wheel')!)).toBe(false); // archived
    expect(isAnnotatable(findNodeById(roots, 'g_vehicle')!)).toBe(false); // group
    expect(collectIds(roots)).toHaveLength(5);
    expect(findDuplicateIds(roots)).toEqual([]);
  });
});
