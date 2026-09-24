import { describe, expect, it } from 'vitest';
import { layoutVizRects, type VizObject, type VizRect } from '@/core/exporter/visualization';
import type { AnnotationColor } from '@/core/annotation/palette';

// base #123456 → r18 g52 b86; the fill string is intentionally different so a
// test can prove the tiles are colored from `base`, not parsed from `fill`.
const COLOR: AnnotationColor = {
  base: '#123456',
  border: '#123456',
  fill: 'rgba(9, 9, 9, 0.1)',
  labelBg: 'rgba(4, 5, 6, 0.9)',
  labelText: '#123456',
};

function obj(over: Partial<VizObject> = {}): VizObject {
  return {
    box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.8 },
    color: COLOR,
    label: 'Chain',
    ...over,
  };
}

describe('layoutVizRects', () => {
  it('emits one translucent fill plus four opaque border strips per object', () => {
    const rects = layoutVizRects({ width: 800, height: 600 }, [obj()]);
    // 0.1..0.5 * 800 = x80 w320 ; 0.2..0.8 * 600 = y120 h360 ; stroke = round(600*0.004) = 2
    expect(rects).toEqual<VizRect[]>([
      { left: 80, top: 120, width: 320, height: 360, r: 18, g: 52, b: 86, alpha: 0.1 }, // fill
      { left: 80, top: 120, width: 320, height: 2, r: 18, g: 52, b: 86, alpha: 1 }, // top
      { left: 80, top: 478, width: 320, height: 2, r: 18, g: 52, b: 86, alpha: 1 }, // bottom
      { left: 80, top: 120, width: 2, height: 360, r: 18, g: 52, b: 86, alpha: 1 }, // left
      { left: 398, top: 120, width: 2, height: 360, r: 18, g: 52, b: 86, alpha: 1 }, // right
    ]);
  });

  it('colors every tile from the component base hex, not the fill string', () => {
    const rects = layoutVizRects({ width: 800, height: 600 }, [obj()]);
    for (const rect of rects) {
      expect({ r: rect.r, g: rect.g, b: rect.b }).toEqual({ r: 18, g: 52, b: 86 });
    }
    // exactly one translucent tile (the interior fill), the rest opaque borders.
    expect(rects.filter((r) => r.alpha === FILL_TEST_ALPHA)).toHaveLength(1);
    expect(rects.filter((r) => r.alpha === 1)).toHaveLength(4);
  });

  it('keeps every tile inside the image bounds even for an edge-to-edge box', () => {
    const size = { width: 100, height: 100 };
    const rects = layoutVizRects(size, [obj({ box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } })]);
    for (const r of rects) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.width).toBeGreaterThanOrEqual(1);
      expect(r.height).toBeGreaterThanOrEqual(1);
      expect(r.left + r.width).toBeLessThanOrEqual(size.width);
      expect(r.top + r.height).toBeLessThanOrEqual(size.height);
    }
  });

  it('returns no tiles for a zero-object (background) image', () => {
    expect(layoutVizRects({ width: 640, height: 480 }, [])).toEqual([]);
  });

  it('is deterministic: identical inputs yield identical tiles', () => {
    const a = layoutVizRects({ width: 640, height: 480 }, [obj()]);
    const b = layoutVizRects({ width: 640, height: 480 }, [obj()]);
    expect(a).toEqual(b);
  });
});

// Mirrors the module's interior-fill opacity; kept local so the test needs no
// export of an implementation constant.
const FILL_TEST_ALPHA = 0.1;
