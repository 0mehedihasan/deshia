import type { ImageSize, NormalizedBox } from '@/types/domain';
import type { Geometry, NormPoint } from './types';
import { rotatedBoxBounds, rotatedBoxCorners, rotatedBoxCenter } from './rotated-box';
import { vertexBounds, polygonCentroid, pointBounds } from './shapes';
import { ellipseBounds } from './extended-shapes';

/**
 * Geometry-kind-agnostic helpers used by selection, culling and export. These
 * never mutate or re-interpret the geometry; they only read it. No silent
 * conversion between kinds happens here — `geometryToPolygon` is an EXPLICIT,
 * documented export conversion, not an in-place edit.
 */

/** Axis-aligned normalized bounds enclosing any geometry. */
export function geometryBounds(g: Geometry, size: ImageSize): NormalizedBox {
  switch (g.kind) {
    case 'box':
      return g.box;
    case 'rotated_box':
      return rotatedBoxBounds(g, size);
    case 'polygon':
    case 'polyline':
      return vertexBounds(g.points);
    case 'point':
      return pointBounds(g.point);
    case 'points':
    case 'cuboid':
      return vertexBounds(g.points);
    case 'ellipse':
      return ellipseBounds(g);
    default:
      return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  }
}

/** Representative center of any geometry (for labels / rotation pivots). */
export function geometryCenter(g: Geometry, _size: ImageSize): NormPoint {
  switch (g.kind) {
    case 'box':
      return { x: (g.box.xMin + g.box.xMax) / 2, y: (g.box.yMin + g.box.yMax) / 2 };
    case 'rotated_box':
      return rotatedBoxCenter(g);
    case 'polygon':
      return polygonCentroid(g.points);
    case 'polyline': {
      const b = vertexBounds(g.points);
      return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2 };
    }
    case 'point':
      return g.point;
    case 'points':
    case 'cuboid': {
      const b = vertexBounds(g.points);
      return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2 };
    }
    case 'ellipse':
      return { x: g.cx, y: g.cy };
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * EXPLICIT polygon-vertex view of a geometry, for exporters that support
 * polygons. A rotated box becomes its 4 rotated corners (rotation preserved); a
 * polygon/polyline returns its own vertices; a point returns a single vertex; an
 * axis-aligned box returns its 4 corners. The caller decides whether the target
 * format can accept this — nothing is discarded silently.
 */
export function geometryToPolygon(g: Geometry, size: ImageSize): NormPoint[] {
  switch (g.kind) {
    case 'box':
      return [
        { x: g.box.xMin, y: g.box.yMin },
        { x: g.box.xMax, y: g.box.yMin },
        { x: g.box.xMax, y: g.box.yMax },
        { x: g.box.xMin, y: g.box.yMax },
      ];
    case 'rotated_box':
      return rotatedBoxCorners(g, size);
    case 'polygon':
    case 'polyline':
      return g.points.map((p) => ({ x: p.x, y: p.y }));
    case 'point':
      return [{ x: g.point.x, y: g.point.y }];
    case 'points':
    case 'cuboid':
      return g.points.map((p) => ({ x: p.x, y: p.y }));
    case 'ellipse': {
      // Explicit sampled view for polygon-capable exporters; never an in-place edit.
      const steps = 32;
      const rad = (((g.angle % 360) + 360) % 360) * (Math.PI / 180);
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      return Array.from({ length: steps }, (_, i) => {
        const t = (i / steps) * Math.PI * 2;
        const lx = Math.cos(t) * g.rx;
        const ly = Math.sin(t) * g.ry;
        return { x: g.cx + lx * c - ly * s, y: g.cy + lx * s + ly * c };
      });
    }
    default:
      return [];
  }
}

/** Is this geometry rotated (and therefore not natively AABB-representable)? */
export function isRotatedGeometry(g: Geometry): boolean {
  if (g.kind === 'rotated_box' || g.kind === 'ellipse') return g.angle % 360 !== 0;
  return false;
}
