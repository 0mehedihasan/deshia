import { describe, expect, it } from 'vitest';
import {
  aspectRatio,
  calculateImageMetadataStatistics,
  generateImageMetadataCsv,
  generateImageMetadataJson,
  generateImageMetadataMarkdown,
  type ImageMetadataRecord,
  type SourceDuplicateMetadataRecord,
} from './statistics';

function record(overrides: Partial<ImageMetadataRecord> = {}): ImageMetadataRecord {
  return {
    id: 'image-1',
    filename: 'one.jpg',
    originalPath: '/dataset/one.jpg',
    extension: 'jpg',
    detectedFormat: 'jpeg',
    mimeType: 'image/jpeg',
    colorMode: 'srgb, 3 channels',
    width: 4032,
    height: 3024,
    fileSize: 1024,
    checksum: 'a'.repeat(64),
    metadataStatus: 'ANALYZED',
    metadataError: null,
    datasetIndex: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe('dataset image metadata statistics and reports', () => {
  it('reduces exact aspect ratios and calculates resolution percentages', () => {
    expect(aspectRatio(4032, 3024).label).toBe('4:3');
    expect(aspectRatio(1080, 1920).label).toBe('9:16');
    expect(aspectRatio(100, 100).label).toBe('1:1');
    const stats = calculateImageMetadataStatistics(
      [
        record(),
        record({
          id: 'image-2',
          filename: 'two.png',
          originalPath: '/dataset/two.png',
          extension: 'png',
          detectedFormat: 'png',
          mimeType: 'image/png',
          width: 1920,
          height: 1080,
          checksum: 'b'.repeat(64),
          fileSize: 3072,
        }),
        record({
          id: 'image-3',
          filename: 'three.jpg',
          originalPath: '/dataset/three.jpg',
          checksum: 'a'.repeat(64),
        }),
        record({
          id: 'failed',
          filename: 'bad.jpg',
          originalPath: '/dataset/bad.jpg',
          width: 0,
          height: 0,
          fileSize: 512,
          checksum: '',
          metadataStatus: 'FAILED',
          metadataError: 'corrupt',
        }),
      ],
      '/dataset',
    );
    expect(stats.totalImages).toBe(4);
    expect(stats.analyzedImages).toBe(3);
    expect(stats.failedImages).toBe(1);
    expect(stats.uniqueResolutions).toBe(2);
    expect(stats.resolutions[0]).toMatchObject({ resolution: '4032 × 3024', images: 2 });
    expect(stats.resolutions[0]?.percent).toBeCloseTo(200 / 3);
    expect(stats.totalStorageBytes).toBe(5632);
    expect(stats.fileSizeDistribution.reduce((sum, row) => sum + row.images, 0)).toBe(4);
    expect(stats.duplicateGroups[0]?.images).toBe(2);
    expect(
      stats.validationIssues.some((issue) =>
        issue.message.includes('does not match detected MIME'),
      ),
    ).toBe(false);
    expect(stats.images[0]?.relative_path).toBe('one.jpg');
    expect(JSON.stringify(stats.images)).not.toContain('/dataset');
  });

  it('flags extension and detected MIME disagreement', () => {
    const stats = calculateImageMetadataStatistics(
      [record({ extension: 'heic', detectedFormat: 'jpeg', mimeType: 'image/jpeg' })],
      '/dataset',
    );
    expect(stats.validationIssues[0]?.message).toContain('does not match detected MIME');
  });

  it('includes duplicate source files in source totals and exports without creating image records', () => {
    const duplicate: SourceDuplicateMetadataRecord = {
      id: 'duplicate-1',
      filename: 'copy.jpg',
      originalPath: '/dataset/sub/copy.jpg',
      extension: 'jpg',
      detectedFormat: 'jpeg',
      mimeType: 'image/jpeg',
      colorMode: 'srgb, 3 channels',
      width: 4032,
      height: 3024,
      fileSize: 1024,
      checksum: 'a'.repeat(64),
      modifiedAt: 0,
      createdAt: 0,
      duplicateOfImageId: 'image-1',
    };
    const stats = calculateImageMetadataStatistics([record()], '/dataset', [duplicate]);
    expect(stats.totalImages).toBe(2);
    expect(stats.importedImageRecords).toBe(1);
    expect(stats.duplicateFilesDetected).toBe(1);
    expect(stats.analyzedImages).toBe(2);
    expect(stats.totalStorageBytes).toBe(2048);
    expect(stats.duplicateGroups[0]?.images).toBe(2);
    expect(stats.images[1]).toMatchObject({
      record_type: 'DUPLICATE_SOURCE_FILE',
      duplicate_of_filename: 'one.jpg',
      relative_path: 'sub/copy.jpg',
    });
  });

  it('exports one CSV row per image and reproducible JSON and Markdown summaries', () => {
    const stats = calculateImageMetadataStatistics(
      [record({ filename: 'photo,"one".jpg' })],
      '/dataset',
    );
    const csv = generateImageMetadataCsv(stats.images);
    expect(csv).toContain('"photo,""one"".jpg"');
    const json = JSON.parse(
      generateImageMetadataJson(
        { id: 'set', name: 'Research set', version: 2 },
        '2026-10-15T00:00:00.000Z',
        stats,
      ),
    );
    expect(json.metadataSchemaVersion).toBe(1);
    expect(json.deshiaVersion).toBeTruthy();
    expect(json.statistics.analyzedImages).toBe(1);
    expect(json.images).toHaveLength(1);
    const report = generateImageMetadataMarkdown(
      { id: 'set', name: 'Research set', version: 2 },
      '2026-10-15T00:00:00.000Z',
      stats,
    );
    expect(report).toContain('4032 × 3024');
    expect(report).toContain('SHA-256 over original file bytes');
    expect(report).not.toContain('/dataset/');
  });
});
