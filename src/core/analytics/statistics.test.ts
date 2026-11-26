import { describe, expect, it } from 'vitest';
import { calculateDatasetStatistics, type StatisticsBox, type StatisticsImage } from './statistics';
import type { AnnotationSchema } from '@/schemas/types';

const schema: AnnotationSchema = {
  id: 'test',
  version: 1,
  name: 'Test',
  classes: [
    {
      key: 'vehicle',
      label: 'Vehicle',
      views: [
        {
          key: 'side',
          label: 'Side',
          components: [
            {
              key: 'body',
              label: 'Body',
              required: false,
              box: 'optional',
              allowedVisibilities: ['VISIBLE'],
              entityInstance: { type: 'vehicle', categoryKey: 'vehicle' },
            },
          ],
        },
      ],
    },
  ],
};
const images: StatisticsImage[] = [
  {
    id: 'a',
    filename: 'a.jpg',
    width: 100,
    height: 100,
    status: 'ANNOTATED',
    classKey: 'vehicle',
    viewKey: 'side',
  },
  {
    id: 'b',
    filename: 'b.jpg',
    width: 200,
    height: 100,
    status: 'SKIPPED',
    classKey: null,
    viewKey: null,
  },
  {
    id: 'c',
    filename: 'c.jpg',
    width: 100,
    height: 100,
    status: 'PENDING',
    classKey: null,
    viewKey: null,
  },
];
const boxes: StatisticsBox[] = [
  {
    imageId: 'a',
    componentKey: 'body',
    xMin: 0.1,
    yMin: 0.2,
    xMax: 0.5,
    yMax: 0.7,
    visibility: 'VISIBLE',
  },
  {
    imageId: 'a',
    componentKey: 'body',
    xMin: 0.5,
    yMin: 0.5,
    xMax: 1,
    yMax: 1,
    visibility: 'OCCLUDED',
  },
];

describe('calculateDatasetStatistics', () => {
  it('calculates image workflow, coverage, class and geometry metrics from records', () => {
    const stats = calculateDatasetStatistics(images, boxes, schema);
    expect(stats.images).toMatchObject({
      total: 3,
      annotated: 1,
      skipped: 1,
      pending: 1,
      zeroObjects: 2,
      withObjects: 1,
      mean: 2 / 3,
      median: 0,
      min: 0,
      max: 2,
    });
    expect(stats.images.coverage).toBeCloseTo(100 / 3);
    expect(stats.annotations).toBe(2);
    expect(stats.classes[0]).toMatchObject({
      key: 'body',
      instances: 2,
      images: 1,
      meanPerPresentImage: 2,
      min: 2,
      max: 2,
    });
    expect(stats.classes[0]?.coverage).toBeCloseTo(100 / 3);
    expect(stats.boxes.meanArea).toBe(2250);
    expect(stats.boxes.meanWidth).toBe(45);
    expect(stats.visibility.map((v) => v.state).sort()).toEqual(['OCCLUDED', 'VISIBLE']);
  });

  it('flags malformed and suspicious boxes without removing them', () => {
    const invalid: StatisticsBox[] = [
      {
        imageId: 'a',
        componentKey: 'unknown',
        xMin: -0.1,
        yMin: 0,
        xMax: -0.2,
        yMax: 1,
        visibility: 'VISIBLE',
      },
    ];
    const stats = calculateDatasetStatistics(images, invalid, schema);
    expect(stats.annotations).toBe(1);
    expect(
      stats.boxes.issues.some(
        (issue) => issue.message.includes('Non-positive') && issue.severity === 'ERROR',
      ),
    ).toBe(true);
    expect(
      stats.boxes.issues.some(
        (issue) => issue.message.includes('Out-of-bounds') && issue.severity === 'ERROR',
      ),
    ).toBe(true);
  });

  it('treats full-image boxes as informational rather than errors', () => {
    const large: StatisticsBox[] = [
      {
        imageId: 'a',
        componentKey: 'body',
        xMin: 0,
        yMin: 0,
        xMax: 1,
        yMax: 1,
        visibility: 'VISIBLE',
      },
    ];
    const stats = calculateDatasetStatistics(images, large, schema);
    expect(stats.boxes.issues).toEqual([
      { severity: 'INFO', message: 'Large but plausible box for body on a.jpg' },
    ]);
  });

  it('separates plausible large boxes from unusually large boxes', () => {
    const candidates: StatisticsBox[] = [
      {
        imageId: 'a',
        componentKey: 'body',
        xMin: 0,
        yMin: 0,
        xMax: 0.88,
        yMax: 1,
        visibility: 'VISIBLE',
      },
      {
        imageId: 'a',
        componentKey: 'body',
        xMin: 0,
        yMin: 0,
        xMax: 0.92,
        yMax: 1,
        visibility: 'VISIBLE',
      },
    ];
    const stats = calculateDatasetStatistics(images, candidates, schema);
    expect(stats.boxes.issues.map((issue) => issue.severity)).toEqual(['INFO', 'WARNING']);
  });

  it('derives annotation class and category counts from ontology and metadata', () => {
    const stats = calculateDatasetStatistics(images, boxes, schema);
    expect(stats.annotationClassCount).toBe(1);
    expect(stats.categories).toHaveLength(1);
    expect(stats.classTotalsMatch).toBe(true);
    expect(stats.vehicleBodies.instances).toBe(2);
    expect(stats.vehicleBodies.images).toBe(1);
    expect(stats.uniquePhysicalVehicleCount).toBeNull();
    expect(stats.viewLabelsDoNotDetermineVehicleIdentity).toBe(true);
  });

  it('counts multiple vehicle bodies per image and many-to-one category coverage', () => {
    const multiSchema: AnnotationSchema = {
      id: 'multi',
      version: 1,
      name: 'Multi vehicle',
      classes: [
        {
          key: 'rickshaw',
          label: 'Rickshaw',
          views: [
            {
              key: 'front',
              label: 'Front',
              components: [
                {
                  key: 'r_body',
                  label: 'Rickshaw body',
                  required: false,
                  box: 'optional',
                  allowedVisibilities: ['VISIBLE'],
                  entityInstance: { type: 'vehicle', categoryKey: 'rickshaw' },
                },
              ],
            },
          ],
        },
        {
          key: 'electric',
          label: 'Electric',
          views: [
            {
              key: 'side',
              label: 'Side',
              components: [
                {
                  key: 'e_body',
                  label: 'Electric body',
                  required: false,
                  box: 'optional',
                  allowedVisibilities: ['VISIBLE'],
                  entityInstance: { type: 'vehicle', categoryKey: 'electric' },
                },
              ],
            },
          ],
        },
      ],
    };
    const sampleImages: StatisticsImage[] = ['1', '2', '3'].map((id) => ({
      id,
      filename: `${id}.jpg`,
      width: 100,
      height: 100,
      status: 'ANNOTATED',
      classKey: null,
      viewKey: id === '1' ? 'front' : id === '2' ? 'side' : 'front',
    }));
    const boxFor = (imageId: string, componentKey: string): StatisticsBox => ({
      imageId,
      componentKey,
      xMin: 0,
      yMin: 0,
      xMax: 0.5,
      yMax: 0.5,
      visibility: 'VISIBLE',
    });
    const result = calculateDatasetStatistics(
      sampleImages,
      [
        boxFor('1', 'r_body'),
        boxFor('2', 'r_body'),
        boxFor('2', 'r_body'),
        boxFor('3', 'r_body'),
        boxFor('3', 'e_body'),
      ],
      multiSchema,
    );
    expect(result.images.total).toBe(3);
    expect(result.vehicleBodies.instances).toBe(5);
    expect(result.vehicleBodies.images).toBe(3);
    expect(result.vehicleBodies.maxPerImage).toBe(2);
    expect(result.vehicleBodies.averagePerImage).toBeCloseTo(5 / 3);
    expect(
      result.categories.map(({ key, vehicleBodyInstances, images }) => ({
        key,
        vehicleBodyInstances,
        images,
      })),
    ).toEqual([
      { key: 'rickshaw', vehicleBodyInstances: 4, images: 3 },
      { key: 'electric', vehicleBodyInstances: 1, images: 1 },
    ]);
    expect(result.categories.reduce((sum, category) => sum + category.images, 0)).toBeGreaterThan(
      result.images.total,
    );
    expect(result.uniquePhysicalVehicleCount).toBeNull();
    expect(result.viewLabelsDoNotDetermineVehicleIdentity).toBe(true);
  });
});
