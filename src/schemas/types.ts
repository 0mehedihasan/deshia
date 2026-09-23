import type { Visibility } from '@/types/domain';

/**
 * Schema type vocabulary. A schema is DATA that drives the annotation engine —
 * the ontology (Rickshaw, views, components) lives here, never in the engine.
 */

/** Whether a component needs a bounding box, given its visibility. */
export type BoxRule = 'required' | 'optional' | 'none';

export interface ComponentDef {
  /** Stable machine key, snake_case, unique within its view (e.g. "chain"). */
  key: string;
  /** Human display label (e.g. "Chain"). */
  label: string;
  /** Must this component be handled (box present or explicitly not-visible)? */
  required: boolean;
  /** Bounding-box requirement when the component is VISIBLE. */
  box: BoxRule;
  /** Visibility states the annotator may choose for this component. */
  allowedVisibilities: Visibility[];
  /** Optional annotator hint shown in the UI. */
  hint?: string;
}

export interface ViewDef {
  key: string;
  label: string;
  components: ComponentDef[];
}

export interface ClassDef {
  key: string;
  label: string;
  views: ViewDef[];
}

export interface AnnotationSchema {
  id: string;
  version: number;
  name: string;
  description?: string;
  classes: ClassDef[];
}

/** A flattened, UI-ready component descriptor resolved for a (class, view). */
export interface ResolvedComponent extends ComponentDef {
  classKey: string;
  viewKey: string;
}
