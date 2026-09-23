import type {
  AnnotationSchema,
  ClassDef,
  ComponentDef,
  ResolvedComponent,
  ViewDef,
} from '@/schemas/types';
import type { Visibility } from '@/types/domain';
import { assignPaletteColors, type AnnotationColor } from './palette';

/**
 * Schema-driven annotation engine.
 *
 * This module contains NO dataset ontology (see .claude/CLAUDE.md golden rule
 * #1). It only resolves whatever schema it is handed: classes → views →
 * components → visibility/box rules, plus deterministic color assignment.
 */

export function getClass(schema: AnnotationSchema, classKey: string): ClassDef | undefined {
  return schema.classes.find((c) => c.key === classKey);
}

export function getView(
  schema: AnnotationSchema,
  classKey: string,
  viewKey: string,
): ViewDef | undefined {
  return getClass(schema, classKey)?.views.find((v) => v.key === viewKey);
}

export function listClassKeys(schema: AnnotationSchema): string[] {
  return schema.classes.map((c) => c.key);
}

export function listViewKeys(schema: AnnotationSchema, classKey: string): string[] {
  return getClass(schema, classKey)?.views.map((v) => v.key) ?? [];
}

/**
 * Resolve the ordered, UI-ready component list for a (class, view). The order is
 * the schema author's order and is STABLE for the session — palette assignment
 * depends on it (see palette.ts), so adding a box never recolors a component.
 */
export function resolveComponents(
  schema: AnnotationSchema,
  classKey: string,
  viewKey: string,
): ResolvedComponent[] {
  const view = getView(schema, classKey, viewKey);
  if (!view) return [];
  return view.components.map((c) => ({ ...c, classKey, viewKey }));
}

/** Ordered component keys for a (class, view) — the palette assignment order. */
export function componentKeys(
  schema: AnnotationSchema,
  classKey: string,
  viewKey: string,
): string[] {
  return resolveComponents(schema, classKey, viewKey).map((c) => c.key);
}

/** Deterministic, stable color map for the components of a (class, view). */
export function colorsForView(
  schema: AnnotationSchema,
  classKey: string,
  viewKey: string,
): Map<string, AnnotationColor> {
  return assignPaletteColors(componentKeys(schema, classKey, viewKey));
}

/**
 * Whether a component requires a bounding box at the given visibility.
 *  - box 'none'      → never requires a box.
 *  - box 'optional'  → box allowed but never required.
 *  - box 'required'  → box required only when the component is VISIBLE
 *                      (OCCLUDED/NOT_VISIBLE never force a box).
 */
export function requiresBox(component: ComponentDef, visibility: Visibility): boolean {
  if (component.box !== 'required') return false;
  return visibility === 'VISIBLE';
}

/** Whether a visibility state is permitted for a component. */
export function isVisibilityAllowed(component: ComponentDef, visibility: Visibility): boolean {
  return component.allowedVisibilities.includes(visibility);
}

/** The default visibility for a freshly-presented component. */
export function defaultVisibility(component: ComponentDef): Visibility {
  return component.allowedVisibilities.includes('VISIBLE')
    ? 'VISIBLE'
    : component.allowedVisibilities[0]!;
}

/** Look up a single component definition within a (class, view). */
export function getComponent(
  schema: AnnotationSchema,
  classKey: string,
  viewKey: string,
  componentKey: string,
): ResolvedComponent | undefined {
  return resolveComponents(schema, classKey, viewKey).find((c) => c.key === componentKey);
}
