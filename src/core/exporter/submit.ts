import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { colorsForView, getComponent } from '@/core/annotation/engine';
import { assignPaletteColors, colorForIndex } from '@/core/annotation/palette';
import { validateAnnotation } from '@/core/annotation/validate';
import { annotatedRoot, assertInside, outputRoot } from '@/core/filesystem/paths';
import type { AnnotationSchema } from '@/schemas/types';
import type { AnnotationState, ImageStatus, NormalizedBox, RedactionCircle } from '@/types/domain';
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
import { buildRedactionComposites, type RedactionComposite } from './redaction-render';
import { renderVisualization, type VizObject } from './visualization';
import { generateVocXml, type VocObjectInput } from './voc';
import { generateYoloTxt } from './yolo';
import { createStoredZip } from './zip';
import { rebuildAggregateCoco } from './coco-aggregate';
import { getExportableAnnotations } from './annotation-selection';
import {
  buildObjectLabelMap,
  exportableObjects,
  objectNormalizedBox,
  generateCvatXmlForObjects,
  nativeObjectProject,
  objectsToBoxes,
} from './object-formats';
import { validateObjects } from '@/core/annotation/objects';
import { schemaLabels } from '@/schemas/traverse';
import type { RecursiveSchema } from '@/schemas/nodes';

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
  /** Dataset-level merged COCO document. */
  aggregateCocoPath: string;
  /** CVAT XML for generalized objects (only present in Objects mode). */
  cvatXmlPath?: string;
  /** Native lossless project entry (only present in Objects mode). */
  nativeProjectPath?: string;
  /** CVAT 1.1 ZIP archive (only present in Objects mode). */
  cvatZipPath?: string;
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

/**
 * Copy a source image into `dest` (never drawing annotation boxes), optionally
 * baking in face-redaction blur patches. RAW and ANNOTATED both use this: they
 * stay free of any drawn boxes (§10), but faces marked for privacy are blurred
 * into every published copy. The read-only source is only ever read.
 */
async function writeImageCopy(
  src: string,
  dest: string,
  ext: string,
  redactionComposites: RedactionComposite[],
): Promise<void> {
  let pipeline = sharp(src, { failOn: 'none' });
  if (redactionComposites.length > 0) {
    pipeline = pipeline.composite(redactionComposites);
  }
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
  /** User-authored schema definition used for object label ids and validation. */
  recursiveSchema?: RecursiveSchema | null;
}): Promise<ExportResult> {
  const { schema, outputDir, image, state } = params;
  const objectsMode = state.objects.length > 0;

  // 1. Validate. Objects mode validates the generalized model against the
  // published label definitions; component mode keeps the Rickshaw checks.
  if (objectsMode) {
    const labels = params.recursiveSchema ? schemaLabels(params.recursiveSchema) : [];
    const issues = validateObjects(state.objects, new Map(labels.map((l) => [l.id, l])));
    if (issues.length > 0) {
      return { ok: false, errors: issues.map((i) => `${i.objectId ?? 'object'}: ${i.message}`) };
    }
  } else {
    const validation = validateAnnotation(schema, state);
    if (!validation.ok) {
      return { ok: false, errors: validation.errors.map((e) => e.message) };
    }
  }
  const classKey = objectsMode ? 'objects' : state.classKey!;
  const viewKey = objectsMode ? 'all' : state.viewKey!;

  try {
    // 3. Generate annotation files. Every format uses the shared selection
    //    policy: boxes marked NOT_VISIBLE remain in storage but are excluded.
    //    Object class names are the schema component keys (identical across
    //    VOC/COCO/YOLO); the id
    //    space comes from a deterministic, whole-schema label map so YOLO/COCO
    //    ids are stable and consistent across every (class, view) folder.
    const exported = getExportableAnnotations(state.boxes).exportable;
    let labelMap = buildLabelMap(schema);
    let vocObjects: VocObjectInput[] = exported.map((b) => ({
      name: b.componentKey,
      box: b.box,
      difficult: b.visibility === 'OCCLUDED',
    }));
    let cocoObjects: Array<{ name: string; box: NormalizedBox }> = exported.map((b) => ({
      name: b.componentKey,
      box: b.box,
    }));
    let yoloObjects: Array<{ name: string; box: NormalizedBox }> = cocoObjects;
    let vizObjects: VizObject[] = exported.map((b) => ({
      box: b.box,
      color: colorsForView(schema, classKey, viewKey).get(b.componentKey) ?? colorForIndex(0),
      label: getComponent(schema, classKey, viewKey, b.componentKey)?.label ?? b.componentKey,
    }));
    let cvatXml: string | null = null;
    let nativeProject: string | null = null;

    if (objectsMode) {
      const labels = params.recursiveSchema ? schemaLabels(params.recursiveSchema) : [];
      labelMap = buildObjectLabelMap(params.recursiveSchema ?? null);
      const converted = objectsToBoxes(state.objects, {
        width: image.width,
        height: image.height,
      });
      vocObjects = converted.objects.map((o) => ({
        name: o.name,
        box: o.box,
        difficult: o.occluded,
      }));
      cocoObjects = converted.objects.map((o) => ({ name: o.name, box: o.box }));
      yoloObjects = cocoObjects;
      const colors = assignPaletteColors(labels.map((l) => l.id));
      const names = new Map(state.objects.map((o) => [o.id, o.labelName]));
      vizObjects = converted.objects.map((o) => ({
        box: o.box,
        color: colors.get(o.labelId) ?? colorForIndex(0),
        label: names.get(o.id) ?? o.name,
      }));
      cvatXml = generateCvatXmlForObjects({
        fileName: annotatedImageName(classKey, viewKey, image.datasetIndex, image.extension),
        size: { width: image.width, height: image.height },
        objects: state.objects,
        schema: params.recursiveSchema ?? null,
      });
      nativeProject = nativeObjectProject({
        schema: params.recursiveSchema ?? null,
        objects: state.objects,
        mediaId: image.id,
        width: image.width,
        height: image.height,
      });
    }

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
    const cvatXmlPath = path.join(
      dirs.annotatedAnnotations,
      `objects_${String(image.datasetIndex).padStart(3, '0')}.xml`,
    );
    const nativeProjectPath = path.join(
      dirs.annotatedAnnotations,
      `objects_${String(image.datasetIndex).padStart(3, '0')}.json`,
    );
    const cvatZipPath = path.join(
      dirs.annotatedAnnotations,
      `objects_${String(image.datasetIndex).padStart(3, '0')}_cvat.zip`,
    );

    // Confine every write to the output root.
    for (const p of [
      rawImagePath,
      annotatedImagePath,
      annotationXmlPath,
      annotationCocoPath,
      annotationYoloPath,
      yoloClassesPath,
      cvatXmlPath,
      nativeProjectPath,
      cvatZipPath,
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
      objects: cocoObjects,
      labelMap,
    });
    const yoloTxt = generateYoloTxt(yoloObjects, labelMap);
    const classesTxt = yoloClassesText(labelMap);

    // Face/privacy blur patches, computed once from the source and baked into
    // every published copy (RAW + ANNOTATED + VISUALIZATIONS). Empty when the
    // annotator marked no faces, so the no-redaction path is unchanged. The
    // source image itself is never modified (golden rule #4).
    const labelRedactions: RedactionCircle[] =
      objectsMode && params.recursiveSchema
        ? (() => {
            const labels = schemaLabels(params.recursiveSchema!);
            const redactIds = new Set(labels.filter((l) => l.redactOnExport).map((l) => l.id));
            if (redactIds.size === 0) return [];
            const shortest = Math.min(image.width, image.height);
            return exportableObjects(state.objects)
              .filter((o) => redactIds.has(o.labelId))
              .flatMap((o, i) => {
                const b = objectNormalizedBox(o, { width: image.width, height: image.height });
                const cx = (b.xMin + b.xMax) / 2;
                const cy = (b.yMin + b.yMax) / 2;
                const radiusPx = Math.max(1, shortest * 0.025);
                return [
                  {
                    id: `label_redaction_${o.id}_${i}`,
                    cx,
                    cy,
                    r: image.width > 0 ? radiusPx / image.width : 0,
                  },
                ];
              });
          })()
        : [];
    const redactionComposites = await buildRedactionComposites(
      image.originalPath,
      { width: image.width, height: image.height },
      [...(state.redactions ?? []), ...labelRedactions],
    );

    // 4. Copy RAW image (no boxes; faces blurred if any).
    await writeImageCopy(image.originalPath, rawImagePath, image.extension, redactionComposites);
    // 5. Copy ANNOTATED image (no boxes; faces blurred if any) + annotation files.
    await writeImageCopy(
      image.originalPath,
      annotatedImagePath,
      image.extension,
      redactionComposites,
    );
    await writeFile(annotationXmlPath, xml, 'utf8');
    await writeFile(annotationCocoPath, cocoJson, 'utf8');
    await writeFile(annotationYoloPath, yoloTxt, 'utf8');
    await writeFile(yoloClassesPath, classesTxt, 'utf8');
    if (cvatXml !== null) await writeFile(cvatXmlPath, cvatXml, 'utf8');
    if (nativeProject !== null) await writeFile(nativeProjectPath, nativeProject, 'utf8');
    if (cvatXml !== null) {
      const archive = createStoredZip([
        { name: 'annotations.xml', data: Buffer.from(cvatXml, 'utf8') },
        {
          name: `images/${path.basename(annotatedImagePath)}`,
          data: await readFile(image.originalPath),
        },
      ]);
      await writeFile(cvatZipPath, archive);
    }
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
        redactionComposites,
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
    if (cvatXml !== null) await verifyWritten(cvatXmlPath);
    if (nativeProject !== null) await verifyWritten(nativeProjectPath);
    if (cvatXml !== null) await verifyWritten(cvatZipPath);

    // Dataset-level COCO: merge every per-image document written so far.
    await rebuildAggregateCoco(outputDir);
    const aggregateCocoPath = path.join(annotatedRoot(outputDir), 'annotations.coco.json');
    await verifyWritten(aggregateCocoPath);

    const rel = (p: string) => path.relative(outputDir, p);
    const relativePaths = [
      rel(rawImagePath),
      rel(annotatedImagePath),
      rel(annotationXmlPath),
      rel(annotationCocoPath),
      rel(annotationYoloPath),
      rel(yoloClassesPath),
      rel(aggregateCocoPath),
      ...(cvatXml !== null ? [rel(cvatXmlPath)] : []),
      ...(nativeProject !== null ? [rel(nativeProjectPath)] : []),
      ...(cvatXml !== null ? [rel(cvatZipPath)] : []),
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
        aggregateCocoPath,
        cvatXmlPath: cvatXml !== null ? cvatXmlPath : undefined,
        nativeProjectPath: nativeProject !== null ? nativeProjectPath : undefined,
        cvatZipPath: cvatXml !== null ? cvatZipPath : undefined,
        visualizationImagePath,
        relativePaths,
      },
    };
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
}
