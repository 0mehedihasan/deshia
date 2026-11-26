import type { DatasetStatistics } from './statistics';
import type { FormatValidation } from './export-validation';

export function buildResearchSummary(s: DatasetStatistics, datasetName: string): string {
  const processed = processedCount(s);
  const processingStatement =
    processed === s.images.total
      ? `${s.images.total} images were processed`
      : `${processed} of ${s.images.total} images were processed`;
  const categorySummary = s.categories
    .map((category) => `${category.label}: ${category.vehicleBodyInstances} vehicle-body instances`)
    .join('; ');
  const views = s.views.map((view) => view.label).join(' / ');
  const uniqueVehicles =
    s.uniquePhysicalVehicleCount === null ? 'Not recorded' : String(s.uniquePhysicalVehicleCount);
  return `Dataset: ${datasetName}. ${processingStatement}, of which ${s.images.annotated} were annotated and ${s.images.skipped} were skipped. ${s.vehicleBodies.instances} vehicle-body instances were annotated across ${s.images.annotated} annotated images${categorySummary ? ` (${categorySummary})` : ''}. The dataset contains ${s.annotations.toLocaleString()} component annotations across ${s.annotationClassCount} ontology-defined annotation classes. Unique physical vehicles: ${uniqueVehicles}. Views: ${views || 'Not available'}.`;
}

const number = (n: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(n);
const processedCount = (s: DatasetStatistics) =>
  s.images.annotated + s.images.skipped + s.images.error;

export function generateStatisticsMarkdown(
  s: DatasetStatistics,
  validation: FormatValidation[],
  datasetName: string,
): string {
  const classInstances = s.classes.reduce((sum, row) => sum + row.instances, 0);
  return `# Dataset Statistics

## Dataset Overview

${buildResearchSummary(s, datasetName)}

| Measure | Value |
|---|---:|
| Total images | ${s.images.total} |
| Processed images | ${processedCount(s)} |
| Annotated images | ${s.images.annotated} |
| Skipped images | ${s.images.skipped} |
| Error images | ${s.images.error} |
| Total annotation objects | ${s.annotations} |
| Vehicle-body instances | ${s.vehicleBodies.instances} |
| Unique physical vehicles | ${s.uniquePhysicalVehicleCount ?? 'Not recorded'} |
| Annotation classes | ${s.annotationClassCount} |
| Vehicle categories | ${s.categories.length} |
| Workflow completion | ${number(s.images.total ? (processedCount(s) / s.images.total) * 100 : 0)}% |
| Annotation coverage | ${number(s.images.coverage)}% |
| Mean objects/image | ${number(s.images.mean)} |
| Median objects/image | ${number(s.images.median)} |

## Class Distribution

| Annotation Class | Instances | Images | Coverage | % of Objects |
|---|---:|---:|---:|---:|
${s.classes.map((c) => `| ${c.label} | ${c.instances} | ${c.images} | ${number(c.coverage)}% | ${number(c.objectPercent)}% |`).join('\n')}

**Class instance sum:** ${classInstances} / ${s.annotations} (${s.classTotalsMatch ? 'matches' : 'does not match'}).

## Vehicle Category

| Category | Vehicle-body instances | Images containing category | Image coverage | Average per category image |
|---|---:|---:|---:|---:|
${s.categories.length ? s.categories.map((c) => `| ${c.label} | ${c.vehicleBodyInstances} | ${c.images} | ${number(c.percent)}% | ${number(c.averageVehiclesPerImage)} |`).join('\n') : 'Not available for this dataset.'}

## View Distribution

| View | Images | Percentage |
|---|---:|---:|
${s.views.length ? s.views.map((v) => `| ${v.label} | ${v.images} | ${number(v.percent)}% |`).join('\n') : 'Not available for this dataset.'}

## Export Validation

| Format | Status | Files expected | Found | Valid | Invalid | Missing files | Images | Objects parsed | Missing objects | Extra objects | Exportable / internal objects | Excluded | Class and box consistency |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
${validation.map((v) => `| ${v.format} | ${v.status} | ${v.expected} | ${v.found} | ${v.valid} | ${v.invalid} | ${v.missing} | ${v.imagesRepresented} | ${v.objectsParsed} | ${v.objectsMissing} | ${v.objectsExtra} | ${v.annotationsExportable} / ${v.annotationsTotal} | ${v.annotationsExcluded}${Object.keys(v.excludedByReason).length ? ` (${Object.entries(v.excludedByReason).map(([reason, count]) => `${reason}: ${count}`).join('; ')})` : ''} | ${v.classConsistent ? 'Yes' : 'No'} |`).join('\n')}

## Bounding Box Summary

Mean area: ${number(s.boxes.meanArea)} px²; median area: ${number(s.boxes.medianArea)} px²; mean width: ${number(s.boxes.meanWidth)} px; mean height: ${number(s.boxes.meanHeight)} px; mean aspect ratio: ${number(s.boxes.meanAspectRatio)}.

## Annotation Quality Checks

Workflow completion describes image processing status. Annotation coverage describes images containing objects; neither measures annotation accuracy.
`;
}

export function generateStatisticsCsv(
  s: DatasetStatistics,
  validation: FormatValidation[],
): string {
  const rows = [
    [
      'record_type',
      'name',
      'instances',
      'images',
      'coverage_percent',
      'object_percent',
      'expected',
      'found',
      'valid',
      'invalid',
      'missing',
      'images_represented',
      'objects_parsed',
      'objects_missing',
      'objects_extra',
      'class_consistent',
      'annotations_total',
      'annotations_exportable',
      'annotations_excluded',
      'exclusion_reasons',
      'objects_per_image',
    ],
  ];
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  rows.push([
    'dataset',
    'Component annotations',
    String(s.annotations),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  rows.push([
    'dataset',
    'Vehicle-body instances',
    String(s.vehicleBodies.instances),
    String(s.vehicleBodies.images),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    String(s.vehicleBodies.averagePerImage),
  ]);
  rows.push([
    'dataset',
    'Unique physical vehicles',
    s.uniquePhysicalVehicleCount === null ? 'Not recorded' : String(s.uniquePhysicalVehicleCount),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  for (const c of s.classes)
    rows.push([
      'class',
      quote(c.label),
      String(c.instances),
      String(c.images),
      String(c.coverage),
      String(c.objectPercent),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  for (const c of s.categories)
    rows.push([
      'category',
      quote(c.label),
      String(c.vehicleBodyInstances),
      String(c.images),
      String(c.percent),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      String(c.averageVehiclesPerImage),
    ]);
  for (const v of s.views)
    rows.push([
      'view',
      quote(v.label),
      '',
      String(v.images),
      String(v.percent),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  for (const v of validation)
    rows.push([
      'validation',
      quote(v.format),
      '',
      '',
      '',
      '',
      String(v.expected),
      String(v.found),
      String(v.valid),
      String(v.invalid),
      String(v.missing),
      String(v.imagesRepresented),
      String(v.objectsParsed),
      String(v.objectsMissing),
      String(v.objectsExtra),
      String(v.classConsistent),
      String(v.annotationsTotal),
      String(v.annotationsExportable),
      String(v.annotationsExcluded),
      quote(JSON.stringify(v.excludedByReason)),
      '',
    ]);
  return rows.map((row) => row.join(',')).join('\n') + '\n';
}

export function generateStatisticsJson(
  s: DatasetStatistics,
  validation: FormatValidation[],
): string {
  return JSON.stringify({ statistics: s, exportValidation: validation }, null, 2) + '\n';
}
