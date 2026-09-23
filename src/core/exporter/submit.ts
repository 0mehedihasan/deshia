import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { validateAnnotation } from '@/core/annotation/validate';
import { assertInside, outputRoot } from '@/core/filesystem/paths';
import type { AnnotationSchema } from '@/schemas/types';
import type { AnnotationState, ImageStatus } from '@/types/domain';
import {
  annotatedImageName,
  annotationXmlName,
  outputImageExt,
  rawImageName,
} from './filenames';
import { ensureExportTarget } from './output-tree';
import { generateVocXml, type VocObjectInput } from './voc';

/**
 * Submission transaction orchestrator (see .claude/CLAUDE.md §11).
 *
 * Strict order:
 *   1. Validate
 *   2. Persist annotation (assumed already saved as a draft by the caller)
 *   3. Generate VOC XML
 *   4. Copy RAW (clean) image
 *   5. Copy ANNOTATED (clean) image + write XML
 *   6. Verify every written file exists and is non-empty
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
  relativePaths: string[];
}

export type ExportResult =
  | { ok: true; outputs: ExportOutputs; nextStatus: ImageStatus }
  | { ok: false; errors: string[] };

async function verifyNonEmpty(filePath: string): Promise<void> {
  const info = await stat(filePath);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`Output file missing or empty: ${filePath}`);
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
    // 3. Generate VOC XML.
    const objects: VocObjectInput[] = state.boxes
      .filter((b) => b.visibility !== 'NOT_VISIBLE')
      .map((b) => ({
        name: b.componentKey,
        box: b.box,
        difficult: b.visibility === 'OCCLUDED',
      }));

    const dirs = await ensureExportTarget(outputDir, classKey, viewKey);
    const root = outputRoot(outputDir);

    const rawName = rawImageName(classKey, viewKey, image.datasetIndex, image.extension);
    const annImageName = annotatedImageName(classKey, viewKey, image.datasetIndex, image.extension);
    const xmlName = annotationXmlName(classKey, viewKey, image.datasetIndex);

    const rawImagePath = path.join(dirs.raw, rawName);
    const annotatedImagePath = path.join(dirs.annotatedImages, annImageName);
    const annotationXmlPath = path.join(dirs.annotatedAnnotations, xmlName);

    // Confine every write to the output root.
    for (const p of [rawImagePath, annotatedImagePath, annotationXmlPath]) {
      assertInside(root, p);
    }

    const xml = generateVocXml({
      folder: path.basename(dirs.annotatedImages),
      filename: annImageName,
      path: annotatedImagePath,
      size: { width: image.width, height: image.height },
      objects,
    });

    // 4. Copy RAW (clean) image.
    await copyCleanImage(image.originalPath, rawImagePath, image.extension);
    // 5. Copy ANNOTATED (clean) image + write XML.
    await copyCleanImage(image.originalPath, annotatedImagePath, image.extension);
    await writeFile(annotationXmlPath, xml, 'utf8');

    // 6. Verify every written file exists and is non-empty.
    await verifyNonEmpty(rawImagePath);
    await verifyNonEmpty(annotatedImagePath);
    await verifyNonEmpty(annotationXmlPath);

    const rel = (p: string) => path.relative(outputDir, p);
    return {
      ok: true,
      nextStatus: 'ANNOTATED',
      outputs: {
        rawImagePath,
        annotatedImagePath,
        annotationXmlPath,
        relativePaths: [rel(rawImagePath), rel(annotatedImagePath), rel(annotationXmlPath)],
      },
    };
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
}
