import { describe, expect, it } from 'vitest';
import { validateAnnotation } from '@/core/annotation/validate';
import { RICKSHAW_SCHEMA } from '@/schemas/rickshaw';
import type { AnnotationState } from '@/types/domain';

function baseState(overrides: Partial<AnnotationState> = {}): AnnotationState {
  return {
    imageId: 'img_1',
    schemaId: 'rickshaw',
    schemaVersion: 1,
    classKey: 'rickshaw',
    viewKey: 'front',
    componentVisibility: {},
    boxes: [],
    status: 'DRAFT',
    annotationVersion: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const fullBox = { xMin: 0.1, yMin: 0.1, xMax: 0.9, yMax: 0.9 };

describe('annotation validation', () => {
  it('errors when class or view is missing', () => {
    const r = validateAnnotation(RICKSHAW_SCHEMA, baseState({ classKey: null }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'NO_CLASS')).toBe(true);
  });

  it('requires boxes for required VISIBLE components', () => {
    // Rickshaw/front requires rickshaw_body + steering_head, both default VISIBLE.
    const r = validateAnnotation(RICKSHAW_SCHEMA, baseState());
    expect(r.ok).toBe(false);
    expect(r.errors.filter((e) => e.code === 'MISSING_REQUIRED_BOX').length).toBe(2);
  });

  it('passes when required VISIBLE components have boxes', () => {
    const now = 0;
    const r = validateAnnotation(
      RICKSHAW_SCHEMA,
      baseState({
        componentVisibility: { rickshaw_body: 'VISIBLE', steering_head: 'VISIBLE' },
        boxes: [
          { id: 'b1', componentKey: 'rickshaw_body', box: fullBox, visibility: 'VISIBLE', createdAt: now, updatedAt: now },
          { id: 'b2', componentKey: 'steering_head', box: { xMin: 0.2, yMin: 0.2, xMax: 0.4, yMax: 0.4 }, visibility: 'VISIBLE', createdAt: now, updatedAt: now },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('does not require a box when a required component is NOT_VISIBLE', () => {
    const now = 0;
    const r = validateAnnotation(
      RICKSHAW_SCHEMA,
      baseState({
        componentVisibility: { rickshaw_body: 'VISIBLE', steering_head: 'NOT_VISIBLE' },
        boxes: [
          { id: 'b1', componentKey: 'rickshaw_body', box: fullBox, visibility: 'VISIBLE', createdAt: now, updatedAt: now },
        ],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('flags orphan boxes not belonging to the view', () => {
    const now = 0;
    const r = validateAnnotation(
      RICKSHAW_SCHEMA,
      baseState({
        componentVisibility: { rickshaw_body: 'VISIBLE', steering_head: 'VISIBLE' },
        boxes: [
          { id: 'b1', componentKey: 'rickshaw_body', box: fullBox, visibility: 'VISIBLE', createdAt: now, updatedAt: now },
          { id: 'b2', componentKey: 'steering_head', box: fullBox, visibility: 'VISIBLE', createdAt: now, updatedAt: now },
          { id: 'b3', componentKey: 'chain', box: fullBox, visibility: 'VISIBLE', createdAt: now, updatedAt: now },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'ORPHAN_BOX')).toBe(true);
  });

  it('flags invalid geometry', () => {
    const now = 0;
    const r = validateAnnotation(
      RICKSHAW_SCHEMA,
      baseState({
        componentVisibility: { rickshaw_body: 'VISIBLE', steering_head: 'NOT_VISIBLE' },
        boxes: [
          { id: 'b1', componentKey: 'rickshaw_body', box: { xMin: 0.9, yMin: 0.9, xMax: 0.1, yMax: 0.1 }, visibility: 'VISIBLE', createdAt: now, updatedAt: now },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'INVALID_BOX')).toBe(true);
  });

  it('allows submitting E-Rickshaw Side without a pedal (optional)', () => {
    const now = 0;
    const r = validateAnnotation(
      RICKSHAW_SCHEMA,
      baseState({
        classKey: 'e_rickshaw',
        viewKey: 'side',
        componentVisibility: {
          e_rickshaw_body: 'VISIBLE',
          electric_drive_area: 'VISIBLE',
          pedal: 'NOT_VISIBLE',
        },
        boxes: [
          { id: 'b1', componentKey: 'e_rickshaw_body', box: fullBox, visibility: 'VISIBLE', createdAt: now, updatedAt: now },
          { id: 'b2', componentKey: 'electric_drive_area', box: { xMin: 0.3, yMin: 0.3, xMax: 0.6, yMax: 0.6 }, visibility: 'VISIBLE', createdAt: now, updatedAt: now },
        ],
      }),
    );
    expect(r.ok).toBe(true);
  });
});
