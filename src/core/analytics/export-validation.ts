import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AnnotationSchema } from '@/schemas/types';
import {
  annotatedImageName,
  annotationCocoName,
  annotationXmlName,
  annotationYoloName,
} from '@/core/exporter/filenames';
import { annotatedRoot, exportTargetDirs } from '@/core/filesystem/paths';
import { buildLabelMap } from '@/core/exporter/labelmap';
import { getExportableAnnotations } from '@/core/exporter/annotation-selection';
import { normalizedToPixel, normalizedToVocPixels } from '@/core/annotation/bbox';
import { isValidNormalizedBox } from '@/core/annotation/bbox';
import type { StatisticsBox, StatisticsImage } from './statistics';

export interface FormatValidation {
  format: 'Pascal VOC' | 'COCO' | 'YOLO';
  status: 'PASS' | 'WARNING' | 'ERROR' | 'Not generated';
  expected: number;
  found: number;
  valid: number;
  invalid: number;
  missing: number;
  imagesRepresented: number;
  objectsParsed: number;
  objectsMissing: number;
  objectsExtra: number;
  annotationsTotal: number;
  annotationsExportable: number;
  annotationsExcluded: number;
  excludedByReason: Record<string, number>;
  classConsistent: boolean;
  details: string[];
}

type ExportImage = Pick<
  StatisticsImage,
  'id' | 'filename' | 'width' | 'height' | 'classKey' | 'viewKey'
> & { status: string; datasetIndex: number; extension: string };
const exists = async (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

function tagValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((match) =>
    match[1]!.trim(),
  );
}

function xmlIsWellFormed(xml: string): boolean {
  const stack: string[] = [];
  for (const match of xml.matchAll(/<\/?([A-Za-z][\w.-]*)\b[^>]*>/g)) {
    const token = match[0]!;
    const name = match[1]!;
    if (token.startsWith('</')) {
      if (stack.pop() !== name) return false;
    } else if (!token.endsWith('/>')) stack.push(name);
  }
  return stack.length === 0 && /^\s*<annotation>/.test(xml) && /<\/annotation>\s*$/.test(xml);
}

function finish(result: FormatValidation, generated: boolean): FormatValidation {
  if (!generated) result.status = 'Not generated';
  else if (result.invalid > 0) result.status = 'ERROR';
  else if (result.missing > 0 || result.valid !== result.expected || !result.classConsistent)
    result.status = 'WARNING';
  else result.status = 'PASS';
  return result;
}

/** Validate each emitted per-image format against its corresponding DB boxes. */
export async function validateExportFormats(
  outputDir: string,
  images: ExportImage[],
  boxes: StatisticsBox[],
  schema: AnnotationSchema,
): Promise<FormatValidation[]> {
  const expected = images.filter(
    (image) => image.status === 'ANNOTATED' && image.classKey && image.viewKey,
  );
  const boxesByImage = new Map<string, StatisticsBox[]>();
  let annotationsTotal = 0;
  let annotationsExportable = 0;
  const excludedByReason: Record<string, number> = {};
  for (const box of boxes) {
    const rows = boxesByImage.get(box.imageId) ?? [];
    rows.push(box);
    boxesByImage.set(box.imageId, rows);
  }
  for (const rows of boxesByImage.values()) {
    const selection = getExportableAnnotations(rows);
    annotationsTotal += rows.length;
    annotationsExportable += selection.exportable.length;
    for (const [reason, count] of Object.entries(selection.excludedByReason))
      excludedByReason[reason] = (excludedByReason[reason] ?? 0) + count;
  }
  const map = buildLabelMap(schema);
  const yoloMapPath = path.join(annotatedRoot(outputDir), 'classes.txt');
  const yoloMapExists = await exists(yoloMapPath);
  const yoloClasses = yoloMapExists
    ? (await readFile(yoloMapPath, 'utf8')).split(/\r?\n/).filter(Boolean)
    : [];
  const specs: Array<{ format: FormatValidation['format']; extension: string }> = [
    { format: 'Pascal VOC', extension: 'xml' },
    { format: 'COCO', extension: 'json' },
    { format: 'YOLO', extension: 'txt' },
  ];
  const results: FormatValidation[] = [];
  for (const spec of specs) {
    const result: FormatValidation = {
      format: spec.format,
      status: 'Not generated',
      expected: expected.length,
      found: 0,
      valid: 0,
      invalid: 0,
      missing: 0,
      imagesRepresented: 0,
      objectsParsed: 0,
      objectsMissing: 0,
      objectsExtra: 0,
      annotationsTotal,
      annotationsExportable,
      annotationsExcluded: annotationsTotal - annotationsExportable,
      excludedByReason,
      classConsistent: true,
      details: [],
    };
    const expectedFiles = new Set<string>();
    for (const image of expected) {
      const cls = image.classKey!;
      const view = image.viewKey!;
      const dirs = exportTargetDirs(outputDir, cls, view);
      const name =
        spec.format === 'Pascal VOC'
          ? annotationXmlName(cls, view, image.datasetIndex)
          : spec.format === 'COCO'
            ? annotationCocoName(cls, view, image.datasetIndex)
            : annotationYoloName(cls, view, image.datasetIndex);
      const file = path.join(dirs.annotatedAnnotations, name);
      expectedFiles.add(file);
      if (!(await exists(file))) {
        result.missing++;
        continue;
      }
      try {
        const content = await readFile(file, 'utf8');
        const selection = getExportableAnnotations(boxesByImage.get(image.id) ?? []);
        const expectedBoxes = selection.exportable;
        if (image.width <= 0 || image.height <= 0)
          throw new Error('Database image dimensions are invalid');
        if (expectedBoxes.some((box) =>
          !isValidNormalizedBox({ xMin: box.xMin, yMin: box.yMin, xMax: box.xMax, yMax: box.yMax }) ||
          !map.index.has(box.componentKey),
        )) throw new Error('Database contains an invalid box or class mapping');
        const expectedClasses = [...new Set(expectedBoxes.map((box) => box.componentKey))].sort();
        if (spec.format === 'Pascal VOC') {
          if (
            !xmlIsWellFormed(content) ||
            tagValues(content, 'filename')[0] !==
              annotatedImageName(cls, view, image.datasetIndex, image.extension)
          )
            throw new Error('Malformed XML or filename mismatch');
          const objectNodes = [...content.matchAll(/<object>([\s\S]*?)<\/object>/g)];
          if (
            tagValues(content, 'width')[0] !== String(image.width) ||
            tagValues(content, 'height')[0] !== String(image.height) ||
            objectNodes.length !== expectedBoxes.length
          )
            throw new Error('VOC image dimensions or object structure are invalid');
          const names: string[] = [];
          const objectAlreadyMatched = new Set<number>();
          for (const object of objectNodes) {
            const name = tagValues(object[1]!, 'name')[0] ?? '';
            names.push(name);
            const coordinates = ['xmin', 'ymin', 'xmax', 'ymax'].map((tag) =>
              Number(tagValues(object[1]!, tag)[0]),
            );
            if (
              coordinates.some((value) => !Number.isFinite(value)) ||
              coordinates[0]! < 1 ||
              coordinates[1]! < 1 ||
              coordinates[2]! > image.width ||
              coordinates[3]! > image.height ||
              coordinates[2]! <= coordinates[0]! ||
              coordinates[3]! <= coordinates[1]!
            )
              throw new Error('Invalid VOC bounding-box coordinates');
            const matchIndex = expectedBoxes.findIndex((box, index) => {
              if (box.componentKey !== name || objectAlreadyMatched.has(index)) return false;
              const wanted = normalizedToVocPixels(
                { xMin: box.xMin, yMin: box.yMin, xMax: box.xMax, yMax: box.yMax },
                { width: image.width, height: image.height },
              );
              return [wanted.xmin, wanted.ymin, wanted.xmax, wanted.ymax].join(',') === coordinates.join(',');
            });
            if (matchIndex < 0) result.classConsistent = false;
            else objectAlreadyMatched.add(matchIndex);
          }
          result.objectsMissing += expectedBoxes.length - objectAlreadyMatched.size;
          result.objectsExtra += objectNodes.length - objectAlreadyMatched.size;
          if (names.some((name) => !map.index.has(name)))
            throw new Error('VOC contains an invalid class ID');
          result.objectsParsed += names.length;
          if (
            names.length !== expectedBoxes.length ||
            [...new Set(names)].sort().join('|') !== expectedClasses.join('|')
          )
            result.classConsistent = false;
        } else if (spec.format === 'COCO') {
          const document = JSON.parse(content) as {
            images?: Array<{ id: number; file_name: string; width: number; height: number }>;
            annotations?: Array<{ category_id: number }>;
            categories?: Array<{ id: number; name: string }>;
          };
          if (
            !Array.isArray(document.images) ||
            document.images.length !== 1 ||
            !Array.isArray(document.annotations) ||
            !Array.isArray(document.categories)
          )
            throw new Error('Invalid COCO structure');
          if (
            document.images[0]?.id !== image.datasetIndex ||
            document.images[0]?.file_name !==
              annotatedImageName(cls, view, image.datasetIndex, image.extension)
          )
            throw new Error('COCO image reference mismatch');
          if (
            document.images[0]?.width !== image.width ||
            document.images[0]?.height !== image.height
          )
            throw new Error('COCO image dimensions mismatch');
          const categoryNames = new Map(
            document.categories.map((category) => [category.id, category.name]),
          );
          const names = document.annotations.map(
            (annotation) => categoryNames.get(annotation.category_id) ?? '',
          );
          if (names.some((name) => !map.index.has(name)))
            throw new Error('COCO contains an invalid class ID');
          if (
            document.annotations.some((annotation) => {
              const className = categoryNames.get(annotation.category_id);
              return !className || annotation.category_id !== map.index.get(className)! + 1;
            })
          )
            throw new Error('COCO category IDs do not match the schema label map');
          const matchedCoco = new Set<number>();
          for (const annotation of document.annotations) {
            const coords = (annotation as unknown as { bbox?: unknown }).bbox;
            if (
              !Array.isArray(coords) ||
              coords.length !== 4 ||
              coords.some((value) => typeof value !== 'number' || !Number.isFinite(value)) ||
              coords[2]! <= 0 ||
              coords[3]! <= 0 ||
              coords[0]! < 0 ||
              coords[1]! < 0 ||
              coords[0]! + coords[2]! > image.width + 0.01 ||
              coords[1]! + coords[3]! > image.height + 0.01
            )
              throw new Error('Invalid COCO bounding-box coordinates');
            const className = categoryNames.get(annotation.category_id) ?? '';
            const matchIndex = expectedBoxes.findIndex((box, index) => {
              if (box.componentKey !== className || matchedCoco.has(index)) return false;
              const px = normalizedToPixel({ xMin: box.xMin, yMin: box.yMin, xMax: box.xMax, yMax: box.yMax }, { width: image.width, height: image.height });
              const wanted = [px.xMin, px.yMin, px.xMax - px.xMin, px.yMax - px.yMin].map((value) => Math.round(value * 100) / 100);
              return wanted.every((value, index) => Math.abs(value - (coords[index] as number)) <= 0.011);
            });
            if (matchIndex < 0) result.classConsistent = false;
            else matchedCoco.add(matchIndex);
          }
          result.objectsMissing += expectedBoxes.length - matchedCoco.size;
          result.objectsExtra += document.annotations.length - matchedCoco.size;
          result.objectsParsed += names.length;
          if (
            names.length !== expectedBoxes.length ||
            [...new Set(names)].sort().join('|') !== expectedClasses.join('|') ||
            names.some((name) => !map.index.has(name))
          )
            result.classConsistent = false;
        } else {
          if (!yoloMapExists || yoloClasses.join('|') !== map.keys.join('|'))
            throw new Error('YOLO classes.txt is missing or inconsistent with schema');
          const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
          const ids: number[] = [];
          const matchedYolo = new Set<number>();
          for (const line of lines) {
            const fields = line.trim().split(/\s+/);
            if (fields.length !== 5) throw new Error('YOLO row must contain five values');
            const values = fields.map(Number);
            if (
              values.some((value) => !Number.isFinite(value)) ||
              !Number.isInteger(values[0]) ||
              values[0]! < 0 ||
              values[0]! >= yoloClasses.length ||
              values.slice(1).some((value) => value < 0 || value > 1)
            )
              throw new Error('Invalid YOLO class ID or normalized coordinates');
            ids.push(values[0]!);
            const name = yoloClasses[values[0]!]!;
            const matchIndex = expectedBoxes.findIndex((candidate, index) => {
              if (candidate.componentKey !== name || matchedYolo.has(index)) return false;
              const cx = (candidate.xMin + candidate.xMax) / 2;
              const cy = (candidate.yMin + candidate.yMax) / 2;
              return `${cx.toFixed(6)}:${cy.toFixed(6)}:${(candidate.xMax - candidate.xMin).toFixed(6)}:${(candidate.yMax - candidate.yMin).toFixed(6)}` === `${values[1]!.toFixed(6)}:${values[2]!.toFixed(6)}:${values[3]!.toFixed(6)}:${values[4]!.toFixed(6)}`;
            });
            if (matchIndex < 0) result.classConsistent = false;
            else matchedYolo.add(matchIndex);
          }
          result.objectsMissing += expectedBoxes.length - matchedYolo.size;
          result.objectsExtra += lines.length - matchedYolo.size;
          result.objectsParsed += ids.length;
          const names = ids.map((id) => yoloClasses[id]!);
          if (
            names.length !== expectedBoxes.length ||
            [...new Set(names)].sort().join('|') !== expectedClasses.join('|')
          )
            result.classConsistent = false;
        }
        const imageFile = path.join(
          dirs.annotatedImages,
          annotatedImageName(cls, view, image.datasetIndex, image.extension),
        );
        if (!(await exists(imageFile))) throw new Error('Referenced exported image is missing');
        result.valid++;
        result.imagesRepresented++;
      } catch (error) {
        result.invalid++;
        result.details.push(`${name}: ${(error as Error).message}`);
      }
    }
    const actualFiles = new Set<string>();
    const targets = new Set(
      schema.classes.flatMap((cls) =>
        cls.views.map(
          (view) => exportTargetDirs(outputDir, cls.key, view.key).annotatedAnnotations,
        ),
      ),
    );
    for (const directory of targets) {
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.toLowerCase().endsWith(`.${spec.extension}`))
            actualFiles.add(path.join(directory, entry.name));
        }
      } catch {
        /* a missing output directory contributes no files */
      }
    }
    result.found = actualFiles.size;
    const orphanFiles = [...actualFiles].filter((file) => !expectedFiles.has(file));
    if (orphanFiles.length) {
      result.invalid += orphanFiles.length;
      result.details.push(
        `${orphanFiles.length} orphan ${spec.extension.toUpperCase()} file(s) do not map to an annotated image.`,
      );
    }
    const generated = result.found > 0 || (spec.format === 'YOLO' && yoloMapExists);
    if (!result.classConsistent)
      result.details.push('Parsed classes or object boxes do not match the canonical database annotations.');
    if (result.objectsMissing || result.objectsExtra)
      result.details.push(`${result.objectsMissing} missing object(s); ${result.objectsExtra} extra or duplicate object(s).`);
    results.push(finish(result, generated));
  }
  return results;
}
