import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { colorsForView, getComponent } from '@/core/annotation/engine';
import { colorForIndex } from '@/core/annotation/palette';
import { validateAnnotation } from '@/core/annotation/validate';
import { annotatedRoot, assertInside, outputRoot } from '@/core/filesystem/paths';
import type { AnnotationSchema } from '@/schemas/types';
import type { AnnotationState, ImageStatus } from '@/types/domain';
import {
  annotatedImageName,
  annotationCocoName,
  annotationXmlName,
  annotationYoloName,
  outputImageExt,
  rawImageName,
  visualizationName,
  YOLO_CLASSES_FILENAME,
} from './filenames';
import { generateCocoJson } from './coco';
import { buildLabelMap, yoloClassesText } from './labelmap';
import { ensureExportTarget } from './output-tree';
import { renderVisualization, type VizObject } from './visualization';
import { generateVocXml, type VocObjectInput } from './voc';
import { generateYoloTxt } from './yolo';

/**
 * Submission transaction orchestrator (see .claude/CLAUDE.md §11).
 *
 * Strict order:
 *   1. Validate
 *   2. Persist annotation (assumed already saved as a draft by the caller)
 *   3. Generate annotation files (Pascal VOC XML + COCO JSON + YOLO txt, plus
 *      the dataset-level YOLO classes.txt)
 *   4. Copy RAW (clean) image
 *   5. Copy ANNOTATED (clean) image + write every annotation file + render the
 *      box-annotated VISUALIZATIONS preview (the only image with boxes drawn)
 *   6. Verify every written file exists and is non-empty (an empty YOLO label is
 *      valid for an image with no objects, so that one file may be 0 bytes)
 *   7/8. Update DB + mark image ANNOTATED  ← performed by the caller AFTER
 *        this function returns ok, so DB mutation stays in the repository layer.
 *
 * This module performs steps 1 and 3–6 (pure filesystem/export work) and never
 * mutates the DB itself. It returns the outputs to persist and the ANNOTATED
 * status the caller should set only when `ok` is true.
 */

export interface ImageFileInfo {
  id: string;
  datasetIndex: number;
  originalPath: string;
  extension: string;
  width: number;
  height: number;
}

export interface ExportOutputs {
  rawImagePath: string;
  annotatedImagePath: string;
  annotationXmlPath: string;
  annotationCocoPath: string;
  annotationYoloPath: string;
  yoloClassesPath: string;
  /** Box-rendered preview under VISUALIZATIONS/ (the only image with boxes). */
  visualizationImagePath: string;
  relativePaths: string[];
}

export type ExportResult =
  | { ok: true; outputs: ExportOutputs; nextStatus: ImageStatus }
  | { ok: false; errors: string[] };

/**
 * Verify a written output exists as a file. `allowEmpty` permits a 0-byte file
 * (used only for a YOLO label describing an image with no objects — a valid
 * negative sample); every other output must be non-empty.
 */
async function verifyWritten(filePath: string, allowEmpty = false): Promise<void> {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new Error(`Output file missing: ${filePath}`);
  }
  if (!allowEmpty && info.size === 0) {
    throw new Error(`Output file empty: ${filePath}`);
  }
}

/** Copy a source image into `dest` as a clean image (never drawing boxes). */
async function copyCleanImage(src: string, dest: string, ext: string): Promise<void> {
  const pipeline = sharp(src, { failOn: 'none' });
  if (outputImageExt(ext) === 'png') {
    await pipeline.png().toFile(dest);
  } else {
    await pipeline.jpeg({ quality: 95 }).toFile(dest);
  }
}

/**
 * Run steps 1 and 3–6 of the submission transaction. Returns the written
 * outputs on success; on any failure returns errors and writes nothing the
 * caller should treat as complete (the draft is preserved by the caller).
 */
export async function exportImage(params: {
  schema: AnnotationSchema;
  outputDir: string;
  image: ImageFileInfo;
  state: AnnotationState;
}): Promise<ExportResult> {
  const { schema, outputDir, image, state } = params;

  // 1. Validate.
  const validation = validateAnnotation(schema, state);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors.map((e) => e.message) };
  }
  const classKey = state.classKey!;
  const viewKey = state.viewKey!;

  try {
    // 3. Generate annotation files. Every format exports the same objects: all
    //    boxes whose component is not explicitly NOT_VISIBLE. Object class names
    //    are the schema component keys (identical across VOC/COCO/YOLO); the id
    //    space comes from a deterministic, whole-schema label map so YOLO/COCO
    //    ids are stable and consistent across every (class, view) folder.
    const exported = state.boxes.filter((b) => b.visibility !== 'NOT_VISIBLE');
    const labelMap = buildLabelMap(schema);

    const vocObjects: VocObjectInput[] = exported.map((b) => ({
      name: b.componentKey,
      box: b.box,
      difficult: b.visibility === 'OCCLUDED',
    }));

    // Visualization objects reuse the workbench's deterministic per-component
    // colors (same map the canvas uses) and the schema's human label, so the
    // preview matches exactly what the annotator saw. Colors are keyed by
    // component, not render order, so they never shift between boxes.
    const vizColors = colorsForView(schema, classKey, viewKey);
    const vizObjects: VizObject[] = exported.map((b) => ({
      box: b.box,
      color: vizColors.get(b.componentKey) ?? colorForIndex(0),
      label: getComponent(schema, classKey, viewKey, b.componentKey)?.label ?? b.componentKey,
    }));

    const dirs = await ensureExportTarget(outputDir, classKey, viewKey);
    const root = outputRoot(outputDir);

    const rawName = rawImageName(classKey, viewKey, image.datasetIndex, image.extension);
    const annImageName = annotatedImageName(classKey, viewKey, image.datasetIndex, image.extension);
    const xmlName = annotationXmlName(classKey, viewKey, image.datasetIndex);
    const cocoName = annotationCocoName(classKey, viewKey, image.datasetIndex);
    const yoloName = annotationYoloName(classKey, viewKey, image.datasetIndex);
    const vizName = visualizationName(classKey, viewKey, image.datasetIndex, image.extension);

    const rawImagePath = path.join(dirs.raw, rawName);
    const annotatedImagePath = path.join(dirs.annotatedImages, annImageName);
    const annotationXmlPath = path.join(dirs.annotatedAnnotations, xmlName);
    const annotationCocoPath = path.join(dirs.annotatedAnnotations, cocoName);
    const annotationYoloPath = path.join(dirs.annotatedAnnotations, yoloName);
    const visualizationImagePath = path.join(dirs.visualizations, vizName);
    // The YOLO class list is a single dataset-level file (consistent ids across
    // all folders), so it lives at the ANNOTATED root, not under a leaf.
    const yoloClassesPath = path.join(annotatedRoot(outputDir), YOLO_CLASSES_FILENAME);

    // Confine every write to the output root.
    for (const p of [
      rawImagePath,
      annotatedImagePath,
      annotationXmlPath,
      annotationCocoPath,
      annotationYoloPath,
      yoloClassesPath,
      visualizationImagePath,
    ]) {
      assertInside(root, p);
    }

    const xml = generateVocXml({
      folder: path.basename(dirs.annotatedImages),
      filename: annImageName,
      path: annotatedImagePath,
      size: { width: image.width, height: image.height },
      objects: vocObjects,
    });
    const cocoJson = generateCocoJson({
      imageId: image.datasetIndex,
      fileName: annImageName,
      size: { width: image.width, height: image.height },
      objects: exported.map((b) => ({ name: b.componentKey, box: b.box })),
      labelMap,
    });
    const yoloTxt = generateYoloTxt(
      exported.map((b) => ({ name: b.componentKey, box: b.box })),
      labelMap,
    );
    const classesTxt = yoloClassesText(labelMap);

    // 4. Copy RAW (clean) image.
    await copyCleanImage(image.originalPath, rawImagePath, image.extension);
    // 5. Copy ANNOTATED (clean) image + write every annotation file.
    await copyCleanImage(image.originalPath, annotatedImagePath, image.extension);
    await writeFile(annotationXmlPath, xml, 'utf8');
    await writeFile(annotationCocoPath, cocoJson, 'utf8');
    await writeFile(annotationYoloPath, yoloTxt, 'utf8');
    await writeFile(yoloClassesPath, classesTxt, 'utf8');
    // 5b. Render the box-annotated visualization. This is the ONLY output with
    //     boxes drawn (CLAUDE.md §10); RAW and ANNOTATED stay clean. Source is
    //     read via Sharp and never mutated. The preview is a human convenience,
    //     NOT part of the dataset, so a rendering failure must not fail an
    //     otherwise-valid submission — it is isolated here and degrades to "no
    //     preview" rather than blocking the annotator.
    let visualizationRendered = false;
    try {
      await renderVisualization({
        srcPath: image.originalPath,
        destPath: visualizationImagePath,
        ext: image.extension,
        size: { width: image.width, height: image.height },
        objects: vizObjects,
      });
      await verifyWritten(visualizationImagePath);
      visualizationRendered = true;
    } catch (vizErr) {
      // eslint-disable-next-line no-console
      console.warn(
        `Visualization preview skipped for ${annImageName}: ${(vizErr as Error).message}`,
      );
    }

    // 6. Verify every written file exists and is non-empty. The YOLO label may
    //    be legitimately empty when the image has no exported objects.
    await verifyWritten(rawImagePath);
    await verifyWritten(annotatedImagePath);
    await verifyWritten(annotationXmlPath);
    await verifyWritten(annotationCocoPath);
    await verifyWritten(annotationYoloPath, exported.length === 0);
    await verifyWritten(yoloClassesPath);

    const rel = (p: string) => path.relative(outputDir, p);
    const relativePaths = [
      rel(rawImagePath),
      rel(annotatedImagePath),
      rel(annotationXmlPath),
      rel(annotationCocoPath),
      rel(annotationYoloPath),
      rel(yoloClassesPath),
    ];
    // Only advertise the preview if it actually rendered + verified above.
    if (visualizationRendered) relativePaths.push(rel(visualizationImagePath));

    return {
      ok: true,
      nextStatus: 'ANNOTATED',
      outputs: {
        rawImagePath,
        annotatedImagePath,
        annotationXmlPath,
        annotationCocoPath,
        annotationYoloPath,
        yoloClassesPath,
        visualizationImagePath,
        relativePaths,
      },
    };
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
}
