import type { AnnotationSchema } from '@/schemas/types';
import type { ImageStatus } from '@/types/domain';

export interface StatisticsImage {
  id: string;
  filename: string;
  width: number;
  height: number;
  status: ImageStatus;
  classKey: string | null;
  viewKey: string | null;
}
export interface StatisticsBox {
  imageId: string;
  componentKey: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  visibility: string;
  vehicleInstanceId?: string | null;
}
export interface DatasetStatistics {
  annotationClassCount: number;
  categories: Array<{
    key: string;
    label: string;
    images: number;
    percent: number;
    vehicleBodyInstances: number;
    averageVehiclesPerImage: number;
  }>;
  vehicleBodies: {
    instances: number;
    images: number;
    maxPerImage: number;
    averagePerImage: number;
  };
  uniquePhysicalVehicleCount: number | null;
  vehicleEntityTypeAvailable: boolean;
  viewLabelsDoNotDetermineVehicleIdentity: true;
  images: {
    total: number;
    annotated: number;
    skipped: number;
    error: number;
    pending: number;
    inProgress: number;
    zeroObjects: number;
    withObjects: number;
    coverage: number;
    objectCoverage: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    standardDeviation: number;
    distribution: Array<{ bucket: string; count: number }>;
  };
  annotations: number;
  classes: Array<{
    key: string;
    label: string;
    parent: string | null;
    instances: number;
    images: number;
    coverage: number;
    meanPerPresentImage: number;
    min: number;
    max: number;
    objectPercent: number;
    meanWidth: number;
    meanHeight: number;
    medianWidth: number;
    medianHeight: number;
    meanArea: number;
    medianArea: number;
    meanAspectRatio: number;
  }>;
  views: Array<{ key: string; label: string; images: number; percent: number }>;
  categoriesAvailable: boolean;
  visibility: Array<{ state: string; instances: number; percent: number }>;
  classTotalsMatch: boolean;
  boxes: {
    meanArea: number;
    medianArea: number;
    minArea: number;
    maxArea: number;
    meanWidth: number;
    meanHeight: number;
    meanAspectRatio: number;
    issues: Array<{ severity: 'ERROR' | 'WARNING' | 'INFO'; message: string }>;
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

export function calculateDatasetStatistics(
  images: StatisticsImage[],
  boxes: StatisticsBox[],
  schema: AnnotationSchema,
): DatasetStatistics {
  const byImage = new Map(images.map((i) => [i.id, 0]));
  const imageById = new Map(images.map((i) => [i.id, i]));
  const schemaComponents = schema.classes.flatMap((cls) =>
    cls.views.flatMap((view) =>
      view.components.map(
        (component) =>
          [
            component.key,
            {
              key: component.key,
              label: component.label,
              parent: cls.key,
              entityInstance: component.entityInstance,
            },
          ] as const,
      ),
    ),
  );
  const allSchemaComponents = [...new Map(schemaComponents).values()];
  const entityComponents = new Map(
    allSchemaComponents
      .filter((component) => component.entityInstance)
      .map((component) => [component.key, component.entityInstance!] as const),
  );
  const counts = new Map<string, string[]>();
  const boxMetrics = new Map<
    string,
    Array<{ width: number; height: number; area: number; ratio: number }>
  >();
  const visibility = new Map<string, number>();
  const vehicleBoxes: StatisticsBox[] = [];
  const issues: DatasetStatistics['boxes']['issues'] = [];
  const knownComponents = new Set(allSchemaComponents.map((component) => component.key));
  for (const box of boxes) {
    byImage.set(box.imageId, (byImage.get(box.imageId) ?? 0) + 1);
    const per = counts.get(box.componentKey) ?? [];
    per.push(box.imageId);
    counts.set(box.componentKey, per);
    const img = imageById.get(box.imageId);
    if (!img || img.width <= 0 || img.height <= 0) {
      issues.push({ severity: 'ERROR', message: `Invalid image dimensions for ${box.imageId}` });
      continue;
    }
    if (!knownComponents.has(box.componentKey))
      issues.push({
        severity: 'ERROR',
        message: `Invalid class ID ${box.componentKey} on ${img.filename}`,
      });
    if (entityComponents.get(box.componentKey)?.type === 'vehicle') vehicleBoxes.push(box);
    if (!['VISIBLE', 'NOT_VISIBLE', 'OCCLUDED'].includes(box.visibility))
      issues.push({
        severity: 'ERROR',
        message: `Invalid visibility state ${box.visibility} on ${img.filename}`,
      });
    const width = (box.xMax - box.xMin) * img.width;
    const height = (box.yMax - box.yMin) * img.height;
    const area = width * height;
    const ratio = height === 0 ? 0 : width / height;
    const metrics = boxMetrics.get(box.componentKey) ?? [];
    metrics.push({ width, height, area, ratio });
    boxMetrics.set(box.componentKey, metrics);
    visibility.set(box.visibility, (visibility.get(box.visibility) ?? 0) + 1);
    if (width <= 0 || height <= 0)
      issues.push({
        severity: 'ERROR',
        message: `Non-positive box dimensions for ${box.componentKey} on ${img.filename}`,
      });
    if (
      ![box.xMin, box.yMin, box.xMax, box.yMax].every(Number.isFinite) ||
      box.xMin < 0 ||
      box.yMin < 0 ||
      box.xMax > 1 ||
      box.yMax > 1
    )
      issues.push({
        severity: 'ERROR',
        message: `Out-of-bounds or non-finite coordinates for ${box.componentKey} on ${img.filename}`,
      });
    if (area / (img.width * img.height) < 0.0001)
      issues.push({
        severity: 'WARNING',
        message: `Extremely small box for ${box.componentKey} on ${img.filename}`,
      });
    const areaFraction = area / (img.width * img.height);
    if (areaFraction > 0.95 || (areaFraction > 0.8 && areaFraction <= 0.9))
      issues.push({
        severity: 'INFO',
        message: `Large but plausible box for ${box.componentKey} on ${img.filename}`,
      });
    else if (areaFraction > 0.9)
      issues.push({
        severity: 'WARNING',
        message: `Unusually large box for ${box.componentKey} on ${img.filename}`,
      });
  }
  const imageCounts = [...byImage.values()];
  const totalImages = images.length;
  const objectCount = boxes.length;
  const mean = totalImages ? objectCount / totalImages : 0;
  const variance = totalImages
    ? imageCounts.reduce((sum, n) => sum + (n - mean) ** 2, 0) / totalImages
    : 0;
  const bucketDefs: Array<[string, (n: number) => boolean]> = [
    ['0', (n) => n === 0],
    ['1', (n) => n === 1],
    ['2', (n) => n === 2],
    ['3', (n) => n === 3],
    ['4', (n) => n === 4],
    ['5', (n) => n === 5],
    ['6–10', (n) => n >= 6 && n <= 10],
    ['11–20', (n) => n >= 11 && n <= 20],
    ['21+', (n) => n > 20],
  ];
  const schemaViews = [
    ...new Map(
      schema.classes.flatMap((cls) => cls.views.map((view) => [view.key, view] as const)),
    ).values(),
  ];
  const views = schemaViews
    .map((view) => {
      const count = images.filter((i) => i.viewKey === view.key).length;
      return {
        key: view.key,
        label: view.label,
        images: count,
        percent: totalImages ? (count / totalImages) * 100 : 0,
      };
    })
    .filter((v) => v.images > 0);
  const categoryLabels = new Map(schema.classes.map((cls) => [cls.key, cls.label]));
  const categoryBoxes = new Map<string, StatisticsBox[]>();
  for (const box of vehicleBoxes) {
    const categoryKey = entityComponents.get(box.componentKey)?.categoryKey;
    if (!categoryKey) continue;
    const list = categoryBoxes.get(categoryKey) ?? [];
    list.push(box);
    categoryBoxes.set(categoryKey, list);
  }
  const categoryKeys = [
    ...new Set(
      [...entityComponents.values()]
        .filter((entity) => entity.type === 'vehicle')
        .map((entity) => entity.categoryKey),
    ),
  ];
  const categories = categoryKeys.map((key) => {
    const categoryInstances = categoryBoxes.get(key) ?? [];
    const categoryImageIds = new Set(categoryInstances.map((box) => box.imageId));
    return {
      key,
      label: categoryLabels.get(key) ?? key,
      images: categoryImageIds.size,
      percent: totalImages ? (categoryImageIds.size / totalImages) * 100 : 0,
      vehicleBodyInstances: categoryInstances.length,
      averageVehiclesPerImage: categoryImageIds.size
        ? categoryInstances.length / categoryImageIds.size
        : 0,
    };
  });
  const vehicleCountsByImage = new Map<string, number>();
  for (const box of vehicleBoxes)
    vehicleCountsByImage.set(box.imageId, (vehicleCountsByImage.get(box.imageId) ?? 0) + 1);
  const vehicleIdentityComplete =
    vehicleBoxes.length > 0 && vehicleBoxes.every((box) => box.vehicleInstanceId);
  const metricRows = (key: string) => boxMetrics.get(key) ?? [];
  const classRows = allSchemaComponents.map((component) => {
    const refs = counts.get(component.key) ?? [];
    const perImage = new Map<string, number>();
    for (const imageId of refs) perImage.set(imageId, (perImage.get(imageId) ?? 0) + 1);
    const vals = metricRows(component.key);
    const imageCount = perImage.size;
    const widths = vals.map((v) => v.width),
      heights = vals.map((v) => v.height),
      areas = vals.map((v) => v.area),
      ratios = vals.map((v) => v.ratio);
    const perImageCounts = [...perImage.values()];
    return {
      key: component.key,
      label: component.label,
      parent: component.parent,
      instances: refs.length,
      images: imageCount,
      coverage: totalImages ? (imageCount / totalImages) * 100 : 0,
      meanPerPresentImage: imageCount ? refs.length / imageCount : 0,
      min: imageCount ? Math.min(...perImageCounts) : 0,
      max: imageCount ? Math.max(...perImageCounts) : 0,
      objectPercent: objectCount ? (refs.length / objectCount) * 100 : 0,
      meanWidth: widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 0,
      meanHeight: heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 0,
      medianWidth: median(widths),
      medianHeight: median(heights),
      meanArea: areas.length ? areas.reduce((a, b) => a + b, 0) / areas.length : 0,
      medianArea: median(areas),
      meanAspectRatio: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0,
    };
  });
  const areas = boxes.map((b) => {
    const img = imageById.get(b.imageId);
    return img ? Math.max(0, (b.xMax - b.xMin) * img.width * (b.yMax - b.yMin) * img.height) : 0;
  });
  const annotated = images.filter((i) => i.status === 'ANNOTATED').length;
  const classInstances = classRows.reduce((sum, component) => sum + component.instances, 0);
  return {
    annotationClassCount: allSchemaComponents.length,
    vehicleBodies: {
      instances: vehicleBoxes.length,
      images: vehicleCountsByImage.size,
      maxPerImage: vehicleCountsByImage.size ? Math.max(...vehicleCountsByImage.values()) : 0,
      averagePerImage: totalImages ? vehicleBoxes.length / totalImages : 0,
    },
    uniquePhysicalVehicleCount: vehicleIdentityComplete
      ? new Set(vehicleBoxes.map((box) => box.vehicleInstanceId)).size
      : null,
    vehicleEntityTypeAvailable: [...entityComponents.values()].some(
      (entity) => entity.type === 'vehicle',
    ),
    viewLabelsDoNotDetermineVehicleIdentity: true,
    classTotalsMatch: classInstances === objectCount,
    categories,
    images: {
      total: totalImages,
      annotated,
      skipped: images.filter((i) => i.status === 'SKIPPED').length,
      error: images.filter((i) => i.status === 'ERROR').length,
      pending: images.filter((i) => i.status === 'PENDING').length,
      inProgress: images.filter((i) => i.status === 'IN_PROGRESS').length,
      zeroObjects: imageCounts.filter((n) => n === 0).length,
      withObjects: imageCounts.filter((n) => n > 0).length,
      coverage: totalImages ? (annotated / totalImages) * 100 : 0,
      objectCoverage: totalImages
        ? (imageCounts.filter((n) => n > 0).length / totalImages) * 100
        : 0,
      mean,
      median: median(imageCounts),
      min: imageCounts.length ? Math.min(...imageCounts) : 0,
      max: imageCounts.length ? Math.max(...imageCounts) : 0,
      standardDeviation: Math.sqrt(variance),
      distribution: bucketDefs.map(([bucket, pred]) => ({
        bucket,
        count: imageCounts.filter(pred).length,
      })),
    },
    annotations: objectCount,
    classes: classRows,
    views,
    categoriesAvailable: categories.length > 0,
    visibility: [...visibility].map(([state, instances]) => ({
      state,
      instances,
      percent: objectCount ? (instances / objectCount) * 100 : 0,
    })),
    boxes: {
      meanArea: areas.length ? areas.reduce((a, b) => a + b, 0) / areas.length : 0,
      medianArea: median(areas),
      minArea: areas.length ? Math.min(...areas) : 0,
      maxArea: areas.length ? Math.max(...areas) : 0,
      meanWidth: boxes.length
        ? boxes.reduce(
            (s, b) => s + (b.xMax - b.xMin) * (imageById.get(b.imageId)?.width ?? 0),
            0,
          ) / boxes.length
        : 0,
      meanHeight: boxes.length
        ? boxes.reduce(
            (s, b) => s + (b.yMax - b.yMin) * (imageById.get(b.imageId)?.height ?? 0),
            0,
          ) / boxes.length
        : 0,
      meanAspectRatio: boxes.length
        ? boxes.reduce((s, b) => {
            const i = imageById.get(b.imageId);
            const h = (b.yMax - b.yMin) * (i?.height ?? 1);
            return s + (h ? ((b.xMax - b.xMin) * (i?.width ?? 1)) / h : 0);
          }, 0) / boxes.length
        : 0,
      issues,
    },
  };
}
