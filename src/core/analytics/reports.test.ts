import { describe, expect, it } from 'vitest';
import {
  generateStatisticsCsv,
  generateStatisticsJson,
  generateStatisticsMarkdown,
  buildResearchSummary,
} from './reports';
import type { DatasetStatistics } from './statistics';
import type { FormatValidation } from './export-validation';

const stats: DatasetStatistics = {
  annotationClassCount: 1,
  vehicleEntityTypeAvailable: true,
  vehicleBodies: { instances: 3, images: 2, maxPerImage: 2, averagePerImage: 1.5 },
  uniquePhysicalVehicleCount: null,
  viewLabelsDoNotDetermineVehicleIdentity: true,
  classTotalsMatch: true,
  categories: [
    {
      key: 'group',
      label: 'Group',
      images: 2,
      percent: 100,
      vehicleBodyInstances: 3,
      averageVehiclesPerImage: 1.5,
    },
  ],
  images: {
    total: 2,
    annotated: 1,
    skipped: 1,
    error: 0,
    pending: 0,
    inProgress: 0,
    zeroObjects: 0,
    withObjects: 2,
    coverage: 50,
    objectCoverage: 100,
    mean: 1.5,
    median: 1.5,
    min: 1,
    max: 2,
    standardDeviation: 0.5,
    distribution: [
      { bucket: '1', count: 1 },
      { bucket: '2', count: 1 },
    ],
  },
  annotations: 3,
  classes: [
    {
      key: 'part',
      label: 'Part',
      parent: 'group',
      instances: 3,
      images: 2,
      coverage: 100,
      meanPerPresentImage: 1.5,
      min: 1,
      max: 2,
      objectPercent: 100,
      meanWidth: 10,
      meanHeight: 10,
      medianWidth: 10,
      medianHeight: 10,
      meanArea: 100,
      medianArea: 100,
      meanAspectRatio: 1,
    },
  ],
  views: [{ key: 'view', label: 'View', images: 2, percent: 100 }],
  categoriesAvailable: true,
  visibility: [{ state: 'VISIBLE', instances: 3, percent: 100 }],
  boxes: {
    meanArea: 100,
    medianArea: 100,
    minArea: 100,
    maxArea: 100,
    meanWidth: 10,
    meanHeight: 10,
    meanAspectRatio: 1,
    issues: [],
  },
};
const validation: FormatValidation[] = [
  {
    format: 'Pascal VOC',
    status: 'PASS',
    expected: 1,
    found: 1,
    valid: 1,
    invalid: 0,
    missing: 0,
    imagesRepresented: 1,
    objectsParsed: 3,
    objectsMissing: 0,
    objectsExtra: 0,
    annotationsTotal: 3,
    annotationsExportable: 2,
    annotationsExcluded: 1,
    excludedByReason: { NOT_VISIBLE: 1 },
    classConsistent: true,
    details: [],
  },
  {
    format: 'COCO',
    status: 'Not generated',
    expected: 1,
    found: 0,
    valid: 0,
    invalid: 0,
    missing: 1,
    imagesRepresented: 0,
    objectsParsed: 0,
    objectsMissing: 0,
    objectsExtra: 0,
    annotationsTotal: 3,
    annotationsExportable: 2,
    annotationsExcluded: 1,
    excludedByReason: { NOT_VISIBLE: 1 },
    classConsistent: true,
    details: [],
  },
];

describe('statistics report exports', () => {
  it('writes dynamic research values and validation results to Markdown', () => {
    const report = generateStatisticsMarkdown(stats, validation, 'Example data');
    expect(report).toContain(
      '2 images were processed, of which 1 were annotated and 1 were skipped',
    );
    expect(report).toContain('| Part | 3 | 2 | 100% | 100% |');
    expect(report).toContain('| COCO | Not generated | 1 | 0 | 0 |');
    expect(report).not.toMatch(/\[N\]|XXXX|TBD|Not calculated/);
    expect(report).toContain('3 vehicle-body instances were annotated across 1 annotated images');
    expect(report).toContain('Unique physical vehicles: Not recorded');
    expect(buildResearchSummary(stats, 'Example data')).toContain('Dataset: Example data');
  });

  it('serializes the same calculated values in JSON and CSV', () => {
    const json = JSON.parse(generateStatisticsJson(stats, validation)) as {
      statistics: DatasetStatistics;
      exportValidation: FormatValidation[];
    };
    expect(json.statistics.annotations).toBe(3);
    expect(json.exportValidation[1]?.status).toBe('Not generated');
    const csv = generateStatisticsCsv(stats, validation);
    expect(csv).toContain('class,"Part",3,2,100,100');
    expect(csv).toContain('validation,"Pascal VOC",,,,,1,1,1,0,0,1,3,0,0,true,3,2,1,');
  });
});
