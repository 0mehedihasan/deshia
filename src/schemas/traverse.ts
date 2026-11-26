import type { RecursiveSchema, SchemaNode } from './nodes';

/**
 * Pure recursive-schema traversal. These operate on a node forest at any depth
 * and never mutate it. Used by the schema editor, breadcrumbs, label pickers,
 * validation and migration.
 */

/** Depth-first walk; the visitor receives each node and its ancestor chain. */
export function walkNodes(
  roots: readonly SchemaNode[],
  visit: (node: SchemaNode, parents: SchemaNode[]) => void,
  parents: SchemaNode[] = [],
): void {
  for (const node of roots) {
    visit(node, parents);
    if (node.children.length > 0) walkNodes(node.children, visit, [...parents, node]);
  }
}

/** Find a node by its stable id anywhere in the forest. */
export function findNodeById(roots: readonly SchemaNode[], id: string): SchemaNode | undefined {
  let found: SchemaNode | undefined;
  walkNodes(roots, (n) => {
    if (!found && n.id === id) found = n;
  });
  return found;
}

/** The ancestor-to-node path (breadcrumb), inclusive. Empty if not found. */
export function nodePath(roots: readonly SchemaNode[], id: string): SchemaNode[] {
  let path: SchemaNode[] = [];
  walkNodes(roots, (n, parents) => {
    if (path.length === 0 && n.id === id) path = [...parents, n];
  });
  return path;
}

/** All annotatable LABEL nodes (plus annotatable groups), optionally archived. */
export function flattenLabels(
  roots: readonly SchemaNode[],
  opts: { includeArchived?: boolean; includeDisabled?: boolean } = {},
): SchemaNode[] {
  const out: SchemaNode[] = [];
  walkNodes(roots, (n) => {
    const annotatable = n.kind === 'label' || n.annotatable === true;
    if (!annotatable) return;
    if (!opts.includeArchived && n.archived) return;
    if (!opts.includeDisabled && !n.enabled) return;
    out.push(n);
  });
  return out;
}

/** Can this node receive new annotations right now? */
export function isAnnotatable(node: SchemaNode): boolean {
  const kindOk = node.kind === 'label' || node.annotatable === true;
  return kindOk && node.enabled && !node.archived;
}

/** Every node id in document order (used for duplicate detection). */
export function collectIds(roots: readonly SchemaNode[]): string[] {
  const ids: string[] = [];
  walkNodes(roots, (n) => ids.push(n.id));
  return ids;
}

/** Ids that appear more than once (a corrupt/invalid schema). */
export function findDuplicateIds(roots: readonly SchemaNode[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of collectIds(roots)) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/** Maximum nesting depth (roots = depth 1). */
export function maxDepth(roots: readonly SchemaNode[]): number {
  let max = 0;
  walkNodes(roots, (_n, parents) => {
    max = Math.max(max, parents.length + 1);
  });
  return max;
}

/** Counts for dashboards and sanity checks. */
export function countNodes(roots: readonly SchemaNode[]): {
  groups: number;
  labels: number;
  total: number;
} {
  let groups = 0;
  let labels = 0;
  walkNodes(roots, (n) => {
    if (n.kind === 'group') groups += 1;
    else labels += 1;
  });
  return { groups, labels, total: groups + labels };
}

/** Convenience: schema-level label flattening. */
export function schemaLabels(schema: RecursiveSchema): SchemaNode[] {
  return flattenLabels(schema.roots);
}
