import { describe, expect, it } from 'vitest';
import {
  annotatedImageName,
  annotationXmlName,
  formatIndex,
  outputImageExt,
  rawImageName,
  visualizationName,
} from '@/core/exporter/filenames';

describe('output filenames', () => {
  it('zero-pads the dataset index to at least 3 digits', () => {
    expect(formatIndex(0)).toBe('000');
    expect(formatIndex(7)).toBe('007');
    expect(formatIndex(42)).toBe('042');
    expect(formatIndex(1234)).toBe('1234');
  });

  it('rejects invalid indices', () => {
    expect(() => formatIndex(-1)).toThrow();
    expect(() => formatIndex(1.5)).toThrow();
  });

  it('normalizes output image extension (png kept, others → jpg)', () => {
    expect(outputImageExt('png')).toBe('png');
    expect(outputImageExt('.PNG')).toBe('png');
    expect(outputImageExt('jpeg')).toBe('jpg');
    expect(outputImageExt('webp')).toBe('jpg');
    expect(outputImageExt('heic')).toBe('jpg');
  });

  it('builds raw/annotated/xml/viz names from datasetIndex', () => {
    expect(rawImageName('rickshaw', 'side', 3, 'jpg')).toBe('raw_rickshaw_side_003.jpg');
    expect(annotatedImageName('e_rickshaw', 'back', 12, 'png')).toBe('annotated_e_rickshaw_back_012.png');
    expect(annotationXmlName('rickshaw', 'front', 5)).toBe('annotated_rickshaw_front_005.xml');
    expect(visualizationName('rickshaw', 'side', 3, 'jpg')).toBe('viz_rickshaw_side_003.jpg');
  });

  it('sanitizes class/view segments into filenames', () => {
    expect(rawImageName('Rick Shaw', 'Side View', 1, 'jpg')).toBe('raw_rick_shaw_side_view_001.jpg');
  });
});
