import { GEOMETRY_KINDS } from '@/core/geometry/types';
import type { AnnotationSchema } from './types';
import {
  SCHEMA_FORMAT_VERSION,
  createGroup,
  createLabel,
  type RecursiveSchema,
  type SchemaNode,
} from './nodes';
import { walkNodes } from './traverse';

/**
 * Safe migration between schema representations.
 *
 * `migrateFlatToRecursive` maps the legacy flat `AnnotationSchema`
 * (class → view → component) into the recursive node model WITHOUT losing the
 * ability to resolve existing annotations: every migrated node gets a
 * DETERMINISTIC id derived from its path (so re-running the migration is
 * idempotent) and carries `legacyKey` = the original key. Existing annotation
 * rows reference component keys; `findLabelByLegacyKey` bridges them to the new
 * stable node ids, so no annotation data is orphaned.
 */

function classId(schemaId: string, classKey: string): string {
  return `${schemaId}:class:${classKey}`;
}
function viewId(schemaId: string, classKey: string, viewKey: string): string {
  return `${schemaId}:view:${classKey}.${viewKey}`;
}
function compId(schemaId: string, classKey: string, viewKey: string, componentKey: string): string {
  return `${schemaId}:comp:${classKey}.${viewKey}.${componentKey}`;
}

/** Map a legacy flat schema into the recursive node model (idempotent). */
export function migrateFlatToRecursive(flat: AnnotationSchema): RecursiveSchema {
  const roots: SchemaNode[] = flat.classes.map((cls) =>
    createGroup(cls.label, {
      id: classId(flat.id, cls.key),
      legacyKey: cls.key,
      children: cls.views.map((view) =>
        createGroup(view.label, {
          id: viewId(flat.id, cls.key, view.key),
          legacyKey: view.key,
          children: view.components.map((comp) =>
            // The component workflow uses boxes; in the generalized Objects
            // editor the same label can be drawn with any supported geometry.
            createLabel(comp.label, [...GEOMETRY_KINDS], {
              id: compId(flat.id, cls.key, view.key, comp.key),
              legacyKey: comp.key,
              description: comp.hint,
            }),
          ),
        }),
      ),
    }),
  );
  return {
    formatVersion: SCHEMA_FORMAT_VERSION,
    id: flat.id,
    name: flat.name,
    description: flat.description,
    version: flat.version,
    roots,
  };
}

/** Resolve a label by its legacy component key (bridges old annotations). */
export function findLabelByLegacyKey(
  roots: readonly SchemaNode[],
  legacyKey: string,
): SchemaNode | undefined {
  let found: SchemaNode | undefined;
  walkNodes(roots, (n) => {
    if (!found && n.kind === 'label' && n.legacyKey === legacyKey) found = n;
  });
  return found;
}
