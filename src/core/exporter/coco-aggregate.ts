import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { annotatedRoot } from '@/core/filesystem/paths';

/**
 * Build one dataset-level COCO document from the per-image files DeshiA writes
 * on every submission. Image ids come from the persistent datasetIndex and are
 * already unique; annotation ids and category ids are remapped to be globally
 * consistent. The per-image files remain untouched.
 */

interface CocoLike {
  info?: unknown;
  images: Array<Record<string, unknown> & { id: number }>;
  annotations: Array<
    Record<string, unknown> & { id: number; image_id: number; category_id: number }
  >;
  categories: Array<Record<string, unknown> & { id: number; name: string }>;
}

async function cocoFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await cocoFiles(full)));
    else if (entry.name.startsWith('annotated_') && entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

export function mergeCocoDocuments(docs: readonly CocoLike[]): CocoLike {
  const categoryIds = new Map<string, number>();
  const categories: Array<Record<string, unknown> & { id: number; name: string }> = [];
  const images: CocoLike['images'] = [];
  const annotations: CocoLike['annotations'] = [];
  const seenImages = new Set<number>();
  let nextAnnotationId = 1;

  for (const doc of docs) {
    const categoryRemap = new Map<number, number>();
    for (const category of doc.categories ?? []) {
      const existing = categoryIds.get(category.name);
      if (existing !== undefined) {
        categoryRemap.set(category.id, existing);
        continue;
      }
      const id = categories.length + 1;
      categoryIds.set(category.name, id);
      categoryRemap.set(category.id, id);
      categories.push({ ...category, id });
    }
    for (const image of doc.images ?? []) {
      if (seenImages.has(image.id)) continue;
      seenImages.add(image.id);
      images.push(image);
    }
    for (const annotation of doc.annotations ?? []) {
      annotations.push({
        ...annotation,
        id: nextAnnotationId++,
        category_id: categoryRemap.get(annotation.category_id) ?? annotation.category_id,
      });
    }
  }

  return {
    info: {
      description: 'DeshiA aggregated annotation export',
      version: '1.0',
      generator: 'DeshiA',
    },
    images,
    annotations,
    categories,
  };
}

/** Write `annotations.coco.json` at the ANNOTATED root; returns image count. */
export async function rebuildAggregateCoco(outputDir: string): Promise<number> {
  const root = annotatedRoot(outputDir);
  const files = await cocoFiles(root).catch(() => []);
  const docs: CocoLike[] = [];
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as CocoLike).images) &&
        Array.isArray((parsed as CocoLike).annotations)
      ) {
        docs.push(parsed as CocoLike);
      }
    } catch {
      // A corrupt per-image file never blocks the aggregate of the others.
    }
  }
  const merged = mergeCocoDocuments(docs);
  await writeFile(path.join(root, 'annotations.coco.json'), JSON.stringify(merged, null, 2) + '\n');
  return merged.images.length;
}
