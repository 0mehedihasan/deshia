import { describe, expect, it } from 'vitest';
import {
  colorsForView,
  componentKeys,
  defaultVisibility,
  getComponent,
  isVisibilityAllowed,
  listClassKeys,
  listViewKeys,
  requiresBox,
  resolveComponents,
} from '@/core/annotation/engine';
import { RICKSHAW_SCHEMA } from '@/schemas/rickshaw';

describe('annotation engine (schema-driven)', () => {
  it('lists classes and views from the schema', () => {
    expect(listClassKeys(RICKSHAW_SCHEMA)).toEqual(['rickshaw', 'e_rickshaw']);
    expect(listViewKeys(RICKSHAW_SCHEMA, 'rickshaw')).toEqual(['front', 'side', 'back']);
  });

  it('resolves the Rickshaw Side components including a SEPARATE chain', () => {
    const keys = componentKeys(RICKSHAW_SCHEMA, 'rickshaw', 'side');
    expect(keys).toContain('chain');
    expect(keys).toContain('pedal_crank_assembly');
    // Chain must be its own component, never merged into pedal/crank.
    expect(keys.indexOf('chain')).not.toBe(keys.indexOf('pedal_crank_assembly'));
  });

  it('models the rear drive assembly, not a motor, on Rickshaw Back', () => {
    const keys = componentKeys(RICKSHAW_SCHEMA, 'rickshaw', 'back');
    expect(keys).toContain('rear_drive_assembly');
    expect(keys).not.toContain('electric_motor');
    expect(keys).not.toContain('motor');
  });

  it('treats the E-Rickshaw Side pedal as optional', () => {
    const pedal = getComponent(RICKSHAW_SCHEMA, 'e_rickshaw', 'side', 'pedal');
    expect(pedal).toBeDefined();
    expect(pedal!.required).toBe(false);
    expect(pedal!.box).toBe('optional');
    // Optional never forces a box, even when visible.
    expect(requiresBox(pedal!, 'VISIBLE')).toBe(false);
  });

  it('requires a box for a required component only when VISIBLE', () => {
    const body = getComponent(RICKSHAW_SCHEMA, 'rickshaw', 'front', 'rickshaw_body')!;
    expect(requiresBox(body, 'VISIBLE')).toBe(true);
    expect(requiresBox(body, 'OCCLUDED')).toBe(false);
    expect(requiresBox(body, 'NOT_VISIBLE')).toBe(false);
  });

  it('checks allowed visibilities and default visibility', () => {
    const body = getComponent(RICKSHAW_SCHEMA, 'rickshaw', 'front', 'rickshaw_body')!;
    expect(isVisibilityAllowed(body, 'VISIBLE')).toBe(true);
    expect(defaultVisibility(body)).toBe('VISIBLE');
  });

  it('assigns distinct, stable colors to every component in a view', () => {
    const colors = colorsForView(RICKSHAW_SCHEMA, 'rickshaw', 'side');
    const comps = resolveComponents(RICKSHAW_SCHEMA, 'rickshaw', 'side');
    expect(colors.size).toBe(comps.length);
    const bases = [...colors.values()].map((c) => c.base);
    expect(new Set(bases).size).toBe(comps.length);
  });

  it('returns empty for unknown class/view', () => {
    expect(resolveComponents(RICKSHAW_SCHEMA, 'nope', 'front')).toEqual([]);
    expect(componentKeys(RICKSHAW_SCHEMA, 'rickshaw', 'nope')).toEqual([]);
  });
});
