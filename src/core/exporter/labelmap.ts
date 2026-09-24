import type { AnnotationSchema } from '@/schemas/types';

/**
 * Deterministic label map derived from a schema.
 *
 * COCO and YOLO both need a stable integer id per object class. The id space is
 * the set of UNIQUE component keys across the WHOLE schema, in declaration order
 * (first occurrence wins) — so the same component key always maps to the same
 * id regardless of which (class, view) it appears under, and a single dataset
 * level `classes.txt` is consistent across every folder.
 *
 * The ontology still lives entirely in the schema (see .claude/CLAUDE.md golden
 * rule #1): this module only enumerates whatever schema it is handed.
 *
 *   YOLO class id  → 0-based (index)
 *   COCO category id → 1-based (index + 1)
 *   name (both) → the component key, matching VOC's <name> (machine-stable)
 */
export interface LabelMap {
  /** Unique component keys in schema declaration order (first occurrence wins). */
  keys: string[];
  /** Component key → 0-based position in `keys`. */
  index: ReadonlyMap<string, number>;
}

export function buildLabelMap(schema: AnnotationSchema): LabelMap {
  const keys: string[] = [];
  const index = new Map<string, number>();
  for (const cls of schema.classes) {
    for (const view of cls.views) {
      for (const comp of view.components) {
        if (!index.has(comp.key)) {
          index.set(comp.key, keys.length);
          keys.push(comp.key);
        }
      }
    }
  }
  return { keys, index };
}

/** 0-based YOLO class id for a component key. Throws if the key is unknown. */
export function yoloClassId(map: LabelMap, componentKey: string): number {
  const id = map.index.get(componentKey);
  if (id === undefined) {
    throw new Error(`Component "${componentKey}" is not present in the schema label map.`);
  }
  return id;
}

/** 1-based COCO category id for a component key. Throws if the key is unknown. */
export function cocoCategoryId(map: LabelMap, componentKey: string): number {
  return yoloClassId(map, componentKey) + 1;
}

/** COCO `categories` array — the full class list, 1-based ids. */
export interface CocoCategory {
  id: number;
  name: string;
  supercategory: string;
}

export function cocoCategories(map: LabelMap): CocoCategory[] {
  return map.keys.map((name, i) => ({ id: i + 1, name, supercategory: 'component' }));
}

/**
 * YOLO `classes.txt` content: one class name per line, ordered by 0-based class
 * id, terminated with a trailing newline. Line N (0-based) is class id N.
 */
export function yoloClassesText(map: LabelMap): string {
  return map.keys.map((k) => k).join('\n') + '\n';
}
