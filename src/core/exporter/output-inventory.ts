import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { annotatedRoot, assertInside, exportTargetDirs, outputRoot } from '@/core/filesystem/paths';
import type { AnnotationSchema } from '@/schemas/types';

/**
 * Read-only inventory of a workspace's DeshiA_Output tree.
 *
 * This is the output-side counterpart to the source scan: it never writes,
 * never touches the read-only source tree, and only reads inside the output
 * root (every path is asserted with `assertInside`). It reports what has
 * actually been written to disk so the annotator can confirm the exported
 * dataset independently of the database's status counts.
 */
/** Per (class, view) leaf tally — the finest breakdown grain. */
export interface OutputViewCounts {
  /** Schema view key (e.g. "side"). */
  viewKey: string;
  /** Human view label (e.g. "Side"). */
  viewLabel: string;
  /** Clean original copies under RAW/<class>/<view>/. */
  rawImages: number;
  /** Clean dataset images under ANNOTATED/<class>/<view>/images. */
  annotatedImages: number;
  /** Annotation files under ANNOTATED/<class>/<view>/annotations. */
  annotationFiles: number;
  /** Box-rendered previews under VISUALIZATIONS/<class>/<view>/. */
  visualizations: number;
  /** Bytes of every file counted in this leaf. */
  bytes: number;
}

/** Per-class rollup: the class totals plus each of its view leaves. */
export interface OutputClassCounts {
  /** Schema class key (e.g. "e_rickshaw"). */
  classKey: string;
  /** Human class label (e.g. "E-Rickshaw"). */
  classLabel: string;
  rawImages: number;
  annotatedImages: number;
  annotationFiles: number;
  visualizations: number;
  bytes: number;
  /** One entry per view declared by the schema for this class. */
  views: OutputViewCounts[];
}

export interface OutputInventory {
  /** Absolute DeshiA_Output root that was inspected. */
  root: string;
  /** Whether the DeshiA_Output tree exists at all. */
  exists: boolean;
  /** Clean original copies under RAW/. */
  rawImages: number;
  /** Clean dataset images under ANNOTATED/**\/images. */
  annotatedImages: number;
  /** VOC/COCO/YOLO files under ANNOTATED/**\/annotations. */
  annotationFiles: number;
  /** Box-rendered previews under VISUALIZATIONS/. */
  visualizations: number;
  /** Whether the dataset-level YOLO classes.txt exists. */
  hasClassesTxt: boolean;
  /** Total bytes of every regular file counted above. */
  totalBytes: number;
  /** Per-class → per-view breakdown, in schema declaration order. */
  classes: OutputClassCounts[];
}

/** Count regular files in a directory (0 if it does not exist), summing bytes. */
async function countDir(dir: string): Promise<{ count: number; bytes: number }> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { count: 0, bytes: 0 }; // missing leaf — nothing exported here yet
  }
  let count = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    count += 1;
    try {
      bytes += (await stat(path.join(dir, entry.name))).size;
    } catch {
      // A file that vanished mid-scan should not fail the whole inventory.
    }
  }
  return { count, bytes };
}

/**
 * Walk every (class, view) leaf declared by the schema and tally the RAW,
 * ANNOTATED (images + annotations) and VISUALIZATIONS outputs.
 */
export async function inventoryOutput(
  outputDir: string,
  schema: AnnotationSchema,
): Promise<OutputInventory> {
  const root = outputRoot(outputDir);

  const result: OutputInventory = {
    root,
    exists: false,
    rawImages: 0,
    annotatedImages: 0,
    annotationFiles: 0,
    visualizations: 0,
    hasClassesTxt: false,
    totalBytes: 0,
    classes: [],
  };

  try {
    result.exists = (await stat(root)).isDirectory();
  } catch {
    return result; // no DeshiA_Output tree yet
  }
  if (!result.exists) return result;

  for (const cls of schema.classes) {
    const classCounts: OutputClassCounts = {
      classKey: cls.key,
      classLabel: cls.label,
      rawImages: 0,
      annotatedImages: 0,
      annotationFiles: 0,
      visualizations: 0,
      bytes: 0,
      views: [],
    };

    for (const view of cls.views) {
      const dirs = exportTargetDirs(outputDir, cls.key, view.key);
      // Defensive: every leaf must resolve inside the output root.
      for (const dir of Object.values(dirs)) assertInside(root, dir);

      const [raw, annImages, annFiles, viz] = await Promise.all([
        countDir(dirs.raw),
        countDir(dirs.annotatedImages),
        countDir(dirs.annotatedAnnotations),
        countDir(dirs.visualizations),
      ]);

      const viewBytes = raw.bytes + annImages.bytes + annFiles.bytes + viz.bytes;
      classCounts.views.push({
        viewKey: view.key,
        viewLabel: view.label,
        rawImages: raw.count,
        annotatedImages: annImages.count,
        annotationFiles: annFiles.count,
        visualizations: viz.count,
        bytes: viewBytes,
      });

      classCounts.rawImages += raw.count;
      classCounts.annotatedImages += annImages.count;
      classCounts.annotationFiles += annFiles.count;
      classCounts.visualizations += viz.count;
      classCounts.bytes += viewBytes;

      result.rawImages += raw.count;
      result.annotatedImages += annImages.count;
      result.annotationFiles += annFiles.count;
      result.visualizations += viz.count;
      result.totalBytes += viewBytes;
    }

    result.classes.push(classCounts);
  }

  // Dataset-level YOLO class list lives at the ANNOTATED root.
  const classesTxt = path.join(annotatedRoot(outputDir), 'classes.txt');
  try {
    const st = await stat(classesTxt);
    result.hasClassesTxt = st.isFile();
    result.totalBytes += st.size;
  } catch {
    result.hasClassesTxt = false;
  }

  return result;
}
