import type { GeometryKind } from '@/core/geometry/types';
import type { AttributeDef } from './attributes';

/**
 * Recursive, general-purpose schema model.
 *
 * A schema is a forest of nodes nestable to any practical depth. Two node kinds:
 *  - GROUP: organizational only; NOT annotatable unless `annotatable` is set.
 *  - LABEL: an assignable class; carries the geometry types it allows and its
 *    custom attributes.
 *
 * STABLE IDENTITY: `id` is the permanent reference. Annotations store the label
 * `id`, so renaming `name` never breaks existing annotations. Ids are never
 * reused. This model is additive to the legacy flat `AnnotationSchema`; a
 * migration (see `migrate.ts`) maps the built-in Rickshaw schema into it.
 */

export const SCHEMA_FORMAT_VERSION = 1;

export type SchemaNodeKind = 'group' | 'label';

export interface SchemaNode {
  /** Permanent stable id (reference target for annotations). */
  id: string;
  kind: SchemaNodeKind;
  /** Display name — renamable without breaking references. */
  name: string;
  description?: string;
  /** Optional explicit color (hex). When absent the UI assigns deterministically. */
  color?: string;
  /** Soft toggles. Disabled/archived labels cannot receive NEW annotations. */
  enabled: boolean;
  archived: boolean;
  /** Default visibility of the node's objects in the workspace. */
  visible: boolean;
  /** LABEL only: geometry kinds this class may be drawn with. */
  geometryTypes?: GeometryKind[];
  /** LABEL only: custom attributes. */
  attributes?: AttributeDef[];
  /** LABEL only: bake this object's region into exported image copies. */
  redactOnExport?: boolean;
  /** GROUP escape hatch: allow a group to also be annotatable if explicitly set. */
  annotatable?: boolean;
  /** Legacy key bridge (e.g. the flat-schema componentKey) for safe migration. */
  legacyKey?: string;
  children: SchemaNode[];
}

export interface RecursiveSchema {
  /** Native schema FORMAT version (migration pivot). */
  formatVersion: number;
  id: string;
  name: string;
  description?: string;
  /** Author-managed content version (bumped on edits). */
  version: number;
  roots: SchemaNode[];
}

let nodeCounter = 0;
/** Generate a unique, stable-once-created node id. */
export function newNodeId(prefix = 'node'): string {
  nodeCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${nodeCounter}`;
}

/** Create a GROUP node (organizational, not annotatable by default). */
export function createGroup(name: string, overrides: Partial<SchemaNode> = {}): SchemaNode {
  return {
    id: overrides.id ?? newNodeId('grp'),
    kind: 'group',
    name,
    enabled: true,
    archived: false,
    visible: true,
    children: [],
    ...overrides,
  };
}

/** Create a LABEL node (an assignable class) with its allowed geometry types. */
export function createLabel(
  name: string,
  geometryTypes: GeometryKind[] = ['box'],
  overrides: Partial<SchemaNode> = {},
): SchemaNode {
  return {
    id: overrides.id ?? newNodeId('lbl'),
    kind: 'label',
    name,
    enabled: true,
    archived: false,
    visible: true,
    geometryTypes,
    attributes: [],
    children: [],
    ...overrides,
  };
}

/** An empty schema — the "start from scratch" onboarding path. */
export function createEmptyRecursiveSchema(name = 'Untitled project'): RecursiveSchema {
  return {
    formatVersion: SCHEMA_FORMAT_VERSION,
    id: newNodeId('schema'),
    name,
    version: 1,
    roots: [],
  };
}

/**
 * A minimal, DOMAIN-NEUTRAL starter template (one group + one generic label).
 * Offered as an OPTIONAL starting point only — it imposes no domain ontology.
 */
export function generalPurposeTemplate(): RecursiveSchema {
  return {
    formatVersion: SCHEMA_FORMAT_VERSION,
    id: newNodeId('schema'),
    name: 'General template',
    description: 'A neutral starting point: one group and one object label. Edit freely.',
    version: 1,
    roots: [createGroup('Objects', { children: [createLabel('Object', ['box'])] })],
  };
}
