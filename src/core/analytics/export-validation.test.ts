import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnnotationSchema } from '@/schemas/types';
import { exportTargetDirs } from '@/core/filesystem/paths';
import {
  annotatedImageName,
  annotationCocoName,
  annotationXmlName,
  annotationYoloName,
} from '@/core/exporter/filenames';
import { buildLabelMap } from '@/core/exporter/labelmap';
import { generateCocoJson } from '@/core/exporter/coco';
import { generateVocXml } from '@/core/exporter/voc';
import { generateYoloTxt } from '@/core/exporter/yolo';
import { validateExportFormats } from './export-validation';
import { getExportableAnnotations } from '@/core/exporter/annotation-selection';
import type { StatisticsBox } from './statistics';

const schema: AnnotationSchema = {
  id: 'test',
  version: 1,
  name: 'Test schema',
  classes: [
    {
      key: 'kind',
      label: 'Kind',
      views: [
        {
          key: 'front',
          label: 'Front',
          components: [
            {
              key: 'part',
              label: 'Part',
              required: false,
              box: 'optional',
              allowedVisibilities: ['VISIBLE'],
            },
          ],
        },
      ],
    },
  ],
};
const image = {
  id: 'img',
  datasetIndex: 4,
  filename: 'source.png',
  extension: 'png',
  width: 100,
  height: 80,
  status: 'ANNOTATED',
  classKey: 'kind',
  viewKey: 'front',
} as const;
const boxes: StatisticsBox[] = [
  {
    imageId: 'img',
    componentKey: 'part',
    xMin: 0.1,
    yMin: 0.2,
    xMax: 0.6,
    yMax: 0.8,
    visibility: 'VISIBLE',
  },
];
const box = { xMin: 0.1, yMin: 0.2, xMax: 0.6, yMax: 0.8 };
let tempRoot = '';
afterEach(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = '';
});

describe('validateExportFormats', () => {
  it('passes only after all three actual formats, images, objects, and classes validate', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'deshia-validation-'));
    const dirs = exportTargetDirs(tempRoot, 'kind', 'front');
    await Promise.all([
      mkdir(dirs.annotatedAnnotations, { recursive: true }),
      mkdir(dirs.annotatedImages, { recursive: true }),
      mkdir(path.join(tempRoot, 'DeshiA_Output', 'ANNOTATED'), { recursive: true }),
    ]);
    const stemImage = annotatedImageName('kind', 'front', 4, 'png');
    await writeFile(path.join(dirs.annotatedImages, stemImage), 'image');
    await writeFile(
      path.join(dirs.annotatedAnnotations, annotationXmlName('kind', 'front', 4)),
      generateVocXml({
        folder: 'images',
        filename: stemImage,
        path: stemImage,
        size: { width: 100, height: 80 },
        objects: [{ name: 'part', box }],
      }),
    );
    await writeFile(
      path.join(dirs.annotatedAnnotations, annotationCocoName('kind', 'front', 4)),
      generateCocoJson({
        imageId: 4,
        fileName: stemImage,
        size: { width: 100, height: 80 },
        objects: [{ name: 'part', box }],
        labelMap: buildLabelMap(schema),
      }),
    );
    await writeFile(
      path.join(dirs.annotatedAnnotations, annotationYoloName('kind', 'front', 4)),
      generateYoloTxt([{ name: 'part', box }], buildLabelMap(schema)),
    );
    await writeFile(path.join(tempRoot, 'DeshiA_Output', 'ANNOTATED', 'classes.txt'), 'part\n');
    const results = await validateExportFormats(tempRoot, [image], boxes, schema);
    expect(results.map((result) => result.status)).toEqual(['PASS', 'PASS', 'PASS']);
    expect(
      results.map(
        ({
          expected,
          found,
          valid,
          invalid,
          missing,
          imagesRepresented,
        objectsParsed,
          annotationsTotal,
          annotationsExportable,
          annotationsExcluded,
          excludedByReason,
          classConsistent,
        }) => ({
          expected,
          found,
          valid,
          invalid,
          missing,
          imagesRepresented,
          objectsParsed,
          annotationsTotal,
          annotationsExportable,
          annotationsExcluded,
          excludedByReason,
          classConsistent,
        }),
      ),
    ).toEqual(
      Array(3).fill({
        expected: 1,
        found: 1,
        valid: 1,
        invalid: 0,
        missing: 0,
        imagesRepresented: 1,
        objectsParsed: 1,
        annotationsTotal: 1,
        annotationsExportable: 1,
        annotationsExcluded: 0,
        excludedByReason: {},
        classConsistent: true,
      }),
    );
  });

  it('reports Not generated when no format files exist', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'deshia-validation-empty-'));
    const results = await validateExportFormats(tempRoot, [image], boxes, schema);
    expect(results.map((result) => result.status)).toEqual([
      'Not generated',
      'Not generated',
      'Not generated',
    ]);
    expect(results.every((result) => result.valid === 0 && result.missing === 1)).toBe(true);
  });

  it('reports ERROR for malformed generated annotation files', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'deshia-validation-malformed-'));
    const dirs = exportTargetDirs(tempRoot, 'kind', 'front');
    await mkdir(dirs.annotatedAnnotations, { recursive: true });
    await writeFile(
      path.join(dirs.annotatedAnnotations, annotationXmlName('kind', 'front', 4)),
      '<annotation><object></annotation>',
    );
    const results = await validateExportFormats(tempRoot, [image], boxes, schema);
    expect(results[0]?.status).toBe('ERROR');
    expect(results[0]?.invalid).toBe(1);
    expect(results[1]?.status).toBe('Not generated');
  });

  it('reports NOT_VISIBLE records separately from format-exportable objects', () => {
    const selection = getExportableAnnotations([
      { ...boxes[0]!, visibility: 'VISIBLE' },
      { ...boxes[0]!, visibility: 'OCCLUDED' },
      { ...boxes[0]!, visibility: 'NOT_VISIBLE' },
    ]);
    expect(selection.exportable).toHaveLength(2);
    expect(selection.excludedByReason).toEqual({ NOT_VISIBLE: 1 });
  });

  it('validates the shared policy across VOC, COCO, and YOLO without hidden boxes', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'deshia-validation-visibility-'));
    const dirs = exportTargetDirs(tempRoot, 'kind', 'front');
    await Promise.all([
      mkdir(dirs.annotatedAnnotations, { recursive: true }),
      mkdir(dirs.annotatedImages, { recursive: true }),
      mkdir(path.join(tempRoot, 'DeshiA_Output', 'ANNOTATED'), { recursive: true }),
    ]);
    const source = [
      { ...boxes[0]!, visibility: 'VISIBLE' },
      { ...boxes[0]!, xMin: 0.2, xMax: 0.7, visibility: 'OCCLUDED' },
      { ...boxes[0]!, xMin: 0.3, xMax: 0.8, visibility: 'NOT_VISIBLE' },
    ];
    const selected = getExportableAnnotations(source).exportable;
    const objects = selected.map((entry) => ({
      name: entry.componentKey,
      box: { xMin: entry.xMin, yMin: entry.yMin, xMax: entry.xMax, yMax: entry.yMax },
    }));
    const stemImage = annotatedImageName('kind', 'front', 4, 'png');
    await writeFile(path.join(dirs.annotatedImages, stemImage), 'image');
    await writeFile(
      path.join(dirs.annotatedAnnotations, annotationXmlName('kind', 'front', 4)),
      generateVocXml({ folder: 'images', filename: stemImage, path: stemImage, size: { width: 100, height: 80 }, objects }),
    );
    await writeFile(
      path.join(dirs.annotatedAnnotations, annotationCocoName('kind', 'front', 4)),
      generateCocoJson({ imageId: 4, fileName: stemImage, size: { width: 100, height: 80 }, objects, labelMap: buildLabelMap(schema) }),
    );
    await writeFile(
      path.join(dirs.annotatedAnnotations, annotationYoloName('kind', 'front', 4)),
      generateYoloTxt(objects, buildLabelMap(schema)),
    );
    await writeFile(path.join(tempRoot, 'DeshiA_Output', 'ANNOTATED', 'classes.txt'), 'part\n');
    const results = await validateExportFormats(tempRoot, [image], source, schema);
    expect(results.map((result) => result.status)).toEqual(['PASS', 'PASS', 'PASS']);
    expect(results.map((result) => result.objectsParsed)).toEqual([2, 2, 2]);
    expect(results.map((result) => [result.annotationsTotal, result.annotationsExportable, result.annotationsExcluded])).toEqual(
      Array(3).fill([3, 2, 1]),
    );
    expect(results.every((result) => result.excludedByReason.NOT_VISIBLE === 1)).toBe(true);
  });
});
