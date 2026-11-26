export interface ExportSelection<T> {
  exportable: T[];
  excluded: T[];
  excludedByReason: Record<string, number>;
}

/**
 * The one export policy for all formats. A stored box marked NOT_VISIBLE is
 * retained in the database/statistics, but excluded from detection labels;
 * the annotation validator separately warns when such a box is present.
 */
export function getExportableAnnotations<T extends { visibility: string }>(
  annotations: T[],
): ExportSelection<T> {
  const exportable: T[] = [];
  const excluded: T[] = [];
  for (const annotation of annotations) {
    (annotation.visibility === 'NOT_VISIBLE' ? excluded : exportable).push(annotation);
  }
  return {
    exportable,
    excluded,
    excludedByReason: excluded.length ? { NOT_VISIBLE: excluded.length } : {},
  };
}
