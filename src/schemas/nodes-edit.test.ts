import { describe, expect, it } from 'vitest';
import { createGroup, createLabel } from './nodes';
import {
  insertNode,
  moveNode,
  removeAttribute,
  removeNode,
  toggleGeometryType,
  upsertAttribute,
  updateNode,
} from './nodes-edit';

describe('recursive schema tree editing', () => {
  const group = createGroup('Vehicles', { id: 'g1' });
  const car = createLabel('Car', ['box'], { id: 'car' });

  it('inserts roots and children without mutating the original', () => {
    const roots = insertNode([group], null, car);
    expect(roots).toHaveLength(2);
    expect(
      insertNode(roots, 'g1', createLabel('Bus', ['box'], { id: 'bus' }))[0]?.children,
    ).toHaveLength(1);
  });

  it('updates and removes nodes by id across depths', () => {
    const roots = insertNode([group], 'g1', car);
    const renamed = updateNode(roots, 'car', { name: 'Automobile' });
    expect(renamed[0]?.children[0]?.name).toBe('Automobile');
    expect(removeNode(renamed, 'car')[0]?.children).toHaveLength(0);
    expect(removeNode(renamed, 'missing')).toEqual(renamed);
  });

  it('moves siblings up and down', () => {
    const a = createLabel('A', ['box'], { id: 'a' });
    const b = createLabel('B', ['box'], { id: 'b' });
    const roots = insertNode([a], null, b);
    expect(moveNode(roots, 'b', 'up').map((n) => n.id)).toEqual(['b', 'a']);
    expect(moveNode(roots, 'a', 'down').map((n) => n.id)).toEqual(['b', 'a']);
    expect(moveNode(roots, 'a', 'up')).toEqual(roots);
  });

  it('upserts attributes and toggles geometry types idempotently', () => {
    const attr = { id: 'a1', key: 'color', label: 'Color', type: 'text' as const };
    let roots = upsertAttribute([car], 'car', attr);
    expect(roots[0]?.attributes).toHaveLength(1);
    roots = upsertAttribute(roots, 'car', { ...attr, label: 'Body color' });
    expect(roots[0]?.attributes).toHaveLength(1);
    expect(roots[0]?.attributes?.[0]?.label).toBe('Body color');
    roots = toggleGeometryType(roots, 'car', 'polygon');
    expect(roots[0]?.geometryTypes).toEqual(['box', 'polygon']);
    roots = toggleGeometryType(roots, 'car', 'box');
    expect(roots[0]?.geometryTypes).toEqual(['polygon']);
    expect(removeAttribute(roots, 'car', 'a1')[0]?.attributes).toEqual([]);
  });
});
