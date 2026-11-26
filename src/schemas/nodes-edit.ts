import type { GeometryKind } from '@/core/geometry/types';
import type { AttributeDef } from './attributes';
import type { SchemaNode } from './nodes';

/**
 * Pure immutable tree editing for recursive schemas. The UI holds a plain
 * `RecursiveSchema` in React state and applies these helpers; nothing here
 * touches React, the DB or the filesystem.
 */

function mapTree(
  nodes: readonly SchemaNode[],
  id: string,
  fn: (node: SchemaNode) => SchemaNode,
): SchemaNode[] {
  return nodes.map((node) => {
    const next = node.id === id ? fn(node) : node;
    if (next.children.length === 0) return next;
    const children = mapTree(next.children, id, fn);
    return children === next.children ? next : { ...next, children };
  });
}

/** Add a node as a root child, or inside a group by id. */
export function insertNode(
  roots: readonly SchemaNode[],
  parentId: string | null,
  node: SchemaNode,
): SchemaNode[] {
  if (parentId === null) return [...roots, node];
  return mapTree(roots, parentId, (parent) => ({
    ...parent,
    children: [...parent.children, node],
  }));
}

/** Replace one node by id (identity-safe when not found). */
export function updateNode(
  roots: readonly SchemaNode[],
  id: string,
  patch: Partial<SchemaNode>,
): SchemaNode[] {
  return mapTree(roots, id, (node) => ({ ...node, ...patch, id: node.id }));
}

/** Remove a node and its whole subtree by id. */
export function removeNode(roots: readonly SchemaNode[], id: string): SchemaNode[] {
  const filter = (nodes: readonly SchemaNode[]): SchemaNode[] =>
    nodes
      .filter((n) => n.id !== id)
      .map((n) => (n.children.length === 0 ? n : { ...n, children: filter(n.children) }));
  return filter(roots);
}

/** Move a node one slot up/down among its siblings. */
export function moveNode(
  roots: readonly SchemaNode[],
  id: string,
  direction: 'up' | 'down',
): SchemaNode[] {
  const splice = (nodes: SchemaNode[]): boolean => {
    const index = nodes.findIndex((n) => n.id === id);
    if (index >= 0) {
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= nodes.length) return false;
      const copy = [...nodes];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved!);
      nodes.splice(0, nodes.length, ...copy);
      return true;
    }
    return nodes.some((n) => n.children.length > 0 && splice(n.children));
  };
  const copy = [...roots];
  splice(copy);
  return copy;
}

/** Append or replace an attribute definition on a label node. */
export function upsertAttribute(
  roots: readonly SchemaNode[],
  nodeId: string,
  attribute: AttributeDef,
): SchemaNode[] {
  return mapTree(roots, nodeId, (node) => {
    const exists = node.attributes?.some((a) => a.id === attribute.id || a.key === attribute.key);
    const attributes = exists
      ? (node.attributes ?? []).map((a) =>
          a.id === attribute.id || a.key === attribute.key ? attribute : a,
        )
      : [...(node.attributes ?? []), attribute];
    return { ...node, attributes };
  });
}

/** Remove one attribute definition from a label node. */
export function removeAttribute(
  roots: readonly SchemaNode[],
  nodeId: string,
  attributeId: string,
): SchemaNode[] {
  return mapTree(roots, nodeId, (node) => ({
    ...node,
    attributes: (node.attributes ?? []).filter((a) => a.id !== attributeId),
  }));
}

/** Toggle a geometry kind on a label (adds or removes, never duplicates). */
export function toggleGeometryType(
  roots: readonly SchemaNode[],
  nodeId: string,
  kind: GeometryKind,
): SchemaNode[] {
  return mapTree(roots, nodeId, (node) => {
    const current = node.geometryTypes ?? [];
    return {
      ...node,
      geometryTypes: current.includes(kind)
        ? current.filter((g) => g !== kind)
        : [...current, kind],
    };
  });
}
