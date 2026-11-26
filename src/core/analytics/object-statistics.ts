import type { AnnotationObject } from '@/types/domain';
import { geometryTypeOf } from '@/core/annotation/objects';

/**
 * Local research analytics for the generalized object layer. Pure and
 * deterministic: no DB/filesystem/React dependencies.
 */

export interface ObjectStatistics {
  total: number;
  byGeometry: Record<string, number>;
  byLabel: Record<string, number>;
  occluded: number;
  locked: number;
  hidden: number;
  objectsWithTracks: number;
  trackCount: number;
  distinctFrames: number;
  objectsWithAttributes: number;
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

export function computeObjectStatistics(objects: readonly AnnotationObject[]): ObjectStatistics {
  const byGeometry: Record<string, number> = {};
  const byLabel: Record<string, number> = {};
  const tracks = new Set<string>();
  const frames = new Set<number>();
  let occluded = 0;
  let locked = 0;
  let hidden = 0;
  let objectsWithAttributes = 0;
  let objectsWithTracks = 0;

  for (const obj of objects) {
    increment(byGeometry, geometryTypeOf(obj.geometry));
    increment(byLabel, obj.labelName || obj.labelId);
    if (obj.occluded) occluded += 1;
    if (obj.locked) locked += 1;
    if (!obj.visible) hidden += 1;
    if (obj.trackId) {
      tracks.add(obj.trackId);
      objectsWithTracks += 1;
    }
    frames.add(obj.frameNumber);
    if (Object.keys(obj.attributes).length > 0) objectsWithAttributes += 1;
  }

  return {
    total: objects.length,
    byGeometry,
    byLabel,
    occluded,
    locked,
    hidden,
    objectsWithTracks,
    trackCount: tracks.size,
    distinctFrames: frames.size,
    objectsWithAttributes,
  };
}

/** Human-readable Markdown report for download alongside exports. */
export function objectStatisticsMarkdown(stats: ObjectStatistics): string {
  const rows = (record: Record<string, number>): string =>
    Object.entries(record)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, value]) => `| ${key} | ${value} |`)
      .join('\n');

  return `# DeshiA object statistics

- Objects: ${stats.total}
- Occluded: ${stats.occluded}
- Hidden: ${stats.hidden}
- Locked: ${stats.locked}
- Objects in a track: ${stats.objectsWithTracks} (${stats.trackCount} tracks)
- Distinct frames: ${stats.distinctFrames}
- Objects with attributes: ${stats.objectsWithAttributes}

## By geometry

| Geometry | Count |
| --- | --- |
${rows(stats.byGeometry) || '| — | 0 |'}

## By label

| Label | Count |
| --- | --- |
${rows(stats.byLabel) || '| — | 0 |'}
`;
}
