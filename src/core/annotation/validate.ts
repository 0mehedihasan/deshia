import type { AnnotationSchema, ResolvedComponent } from '@/schemas/types';
import type { AnnotationState, Visibility } from '@/types/domain';
import { isValidNormalizedBox } from './bbox';
import {
  defaultVisibility,
  getView,
  isVisibilityAllowed,
  requiresBox,
  resolveComponents,
} from './engine';

/**
 * Pre-submit annotation validation. Purely schema-driven — no ontology here.
 * `errors` block submission; `warnings` are advisory. Never throws.
 */

export interface AnnotationIssue {
  code: string;
  message: string;
  componentKey?: string;
  boxId?: string;
}

export interface AnnotationValidationResult {
  ok: boolean;
  errors: AnnotationIssue[];
  warnings: AnnotationIssue[];
}

export function validateAnnotation(
  schema: AnnotationSchema,
  state: AnnotationState,
): AnnotationValidationResult {
  const errors: AnnotationIssue[] = [];
  const warnings: AnnotationIssue[] = [];

  if (!state.classKey) {
    errors.push({ code: 'NO_CLASS', message: 'Select a class before submitting.' });
  }
  if (!state.viewKey) {
    errors.push({ code: 'NO_VIEW', message: 'Select a view before submitting.' });
  }
  if (!state.classKey || !state.viewKey) {
    return { ok: false, errors, warnings };
  }

  const view = getView(schema, state.classKey, state.viewKey);
  if (!view) {
    errors.push({
      code: 'UNKNOWN_VIEW',
      message: `Class/view "${state.classKey}/${state.viewKey}" is not in schema "${schema.id}".`,
    });
    return { ok: false, errors, warnings };
  }

  const components = resolveComponents(schema, state.classKey, state.viewKey);
  const byKey = new Map<string, ResolvedComponent>(components.map((c) => [c.key, c]));

  // Boxes: valid geometry + belong to a component in this view.
  const boxCountByComponent = new Map<string, number>();
  for (const b of state.boxes) {
    const comp = byKey.get(b.componentKey);
    if (!comp) {
      errors.push({
        code: 'ORPHAN_BOX',
        message: `Box references component "${b.componentKey}" which is not part of this view.`,
        componentKey: b.componentKey,
        boxId: b.id,
      });
      continue;
    }
    if (!isValidNormalizedBox(b.box)) {
      errors.push({
        code: 'INVALID_BOX',
        message: `Box for "${comp.label}" is out of bounds or degenerate.`,
        componentKey: b.componentKey,
        boxId: b.id,
      });
    }
    boxCountByComponent.set(b.componentKey, (boxCountByComponent.get(b.componentKey) ?? 0) + 1);
  }

  // Components: visibility validity + required-handling + box requirements.
  for (const comp of components) {
    const visibility: Visibility =
      state.componentVisibility[comp.key] ?? defaultVisibility(comp);

    if (!isVisibilityAllowed(comp, visibility)) {
      errors.push({
        code: 'BAD_VISIBILITY',
        message: `Visibility "${visibility}" is not allowed for "${comp.label}".`,
        componentKey: comp.key,
      });
    }

    const boxes = boxCountByComponent.get(comp.key) ?? 0;

    if (requiresBox(comp, visibility) && boxes === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_BOX',
        message: `"${comp.label}" is visible and requires a bounding box.`,
        componentKey: comp.key,
      });
    }

    if (comp.required && comp.box === 'none' && !state.componentVisibility[comp.key]) {
      warnings.push({
        code: 'REQUIRED_UNSET',
        message: `Confirm the visibility of required component "${comp.label}".`,
        componentKey: comp.key,
      });
    }

    if (comp.box !== 'required' && visibility !== 'VISIBLE' && boxes > 0) {
      warnings.push({
        code: 'BOX_WHILE_NOT_VISIBLE',
        message: `"${comp.label}" has a box but is marked ${visibility}.`,
        componentKey: comp.key,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
