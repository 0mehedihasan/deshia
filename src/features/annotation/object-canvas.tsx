'use client';

import * as React from 'react';
import {
  Circle,
  Ellipse,
  Image as KonvaImage,
  Label,
  Layer,
  Line,
  Rect,
  Stage,
  Tag,
  Text,
  Transformer,
} from 'react-konva';
import Konva from 'konva';
import { normalizedBoxFromCorners } from '@/core/annotation/bbox';
import type { AnnotationObject, NormalizedBox } from '@/types/domain';
import type { Geometry, GeometryKind, NormPoint } from '@/core/geometry/types';
import { geometryBounds } from '@/core/geometry/convert';
import { distanceToSegmentPx } from '@/core/geometry/distance';
import {
  fitView,
  imageNormToStage,
  stageToImageNorm,
  zoomViewAt,
  panView,
  type CanvasView,
} from '@/core/geometry/transform';
import { CUBOID_EDGES, cuboidFromBox } from '@/core/geometry/extended-shapes';
import { geometryVertices, simplifyFreehand } from '@/core/annotation/snapping';

/**
 * CVAT-parity object canvas.
 *
 * Renders the source image (never modified) plus independent, schema-labelled
 * objects of every supported geometry. It owns only presentation and pointer
 * gestures: geometry stays normalized in the Zustand draft and is converted to
 * stage pixels here, exactly like the component-box canvas.
 */

export type ObjectTool = 'select' | GeometryKind;

export interface CanvasObject extends AnnotationObject {
  /** Semantic color for this label (border + label text). */
  color: string;
}

export interface ObjectCanvasProps {
  imageUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  objects: CanvasObject[];
  selectedId: string | null;
  /** Multi-selection (Ctrl/Cmd+A, Shift-click) — all selected shapes get handles. */
  selectedIds: string[];
  tool: ObjectTool;
  /** Rectangle draw mode: drag two corners or click four corners. */
  rectangleMethod?: 'two-point' | 'four-point';
  /** Label to assign to newly drawn objects. */
  activeLabelId: string | null;
  /** Increment to finish an in-progress path (Enter / Finish button). */
  finishToken: number;
  onAddObject: (geometry: Geometry) => void;
  onUpdateGeometry: (id: string, geometry: Geometry) => void;
  onUpdateVertex: (id: string, index: number, point: NormPoint) => void;
  onSelect: (id: string | null) => void;
  /** Insert a vertex after the given segment index (double-click an edge). */
  onInsertVertex?: (id: string, index: number, point: NormPoint) => void;
  /** Remove a vertex (right-click a vertex handle). */
  onDeleteVertex?: (id: string, index: number) => void;
  /** Rename an object's display label (double-click its on-canvas text). */
  onRenameObject?: (id: string, name: string) => void;
  /** Rubber-band selection of all objects intersecting the rectangle. */
  onSelectObjects?: (ids: string[]) => void;
  /** Display-only image adjustments; never touch source or exported bytes. */
  adjustments?: { brightness: number; contrast: number; gamma: number };
  /** Called when the source frame/image fails to load (e.g. ffmpeg missing). */
  onImageError?: (message: string) => void;
}

export interface ObjectCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

type PixelPoint = { x: number; y: number };

const HANDLE_FILL = '#F04438';
const HANDLE_RING = '#FFFFFF';

export const ObjectCanvas = React.forwardRef<ObjectCanvasHandle, ObjectCanvasProps>(
  function ObjectCanvas(props, ref) {
    const {
      naturalWidth,
      naturalHeight,
      objects,
      selectedId,
      selectedIds,
      tool,
      rectangleMethod = 'two-point',
      activeLabelId,
      onImageError,
    } = props;
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [size, setSize] = React.useState({ width: 0, height: 0 });
    const [img, setImg] = React.useState<HTMLImageElement | null>(null);
    const imageRef = React.useRef<Konva.Image>(null);
    const adjustments = props.adjustments ?? { brightness: 0, contrast: 0, gamma: 0 };

    // Display-only Konva filters on a cached image node. Source and exported
    // bytes are untouched.
    React.useEffect(() => {
      const node = imageRef.current;
      if (!node || !img) return;
      node.cache();
      const filters: Array<(imageData: ImageData) => void> = [];
      if (adjustments.brightness !== 0) filters.push(Konva.Filters.Brighten);
      if (adjustments.contrast !== 0) filters.push(Konva.Filters.Contrast);
      if (adjustments.gamma !== 0) {
        const exponent = 1 / (1 + adjustments.gamma);
        filters.push((imageData: ImageData) => {
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 * Math.pow(data[i]! / 255, exponent);
            data[i + 1] = 255 * Math.pow(data[i + 1]! / 255, exponent);
            data[i + 2] = 255 * Math.pow(data[i + 2]! / 255, exponent);
          }
        });
      }
      node.filters(filters);
      node.brightness(adjustments.brightness);
      node.contrast(adjustments.contrast);
      node.getLayer()?.batchDraw();
    }, [img, adjustments.brightness, adjustments.contrast, adjustments.gamma]);

    React.useEffect(() => {
      const image = new window.Image();
      image.crossOrigin = 'anonymous';
      image.src = props.imageUrl;
      image.onload = () => setImg(image);
      image.onerror = () => onImageError?.('Frame could not be loaded.');
      return () => {
        image.onload = null;
      };
    }, [props.imageUrl, onImageError]);

    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const r = entries[0]?.contentRect;
        if (r) setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const imageSize = { width: naturalWidth, height: naturalHeight };
    const baseView = fitView(size.width, size.height, imageSize);
    const [viewOverride, setViewOverride] = React.useState<CanvasView | null>(null);
    const view = viewOverride ?? baseView;
    const pxW = naturalWidth * view.scale;
    const pxH = naturalHeight * view.scale;

    const toStage = React.useCallback(
      (p: NormPoint): PixelPoint => imageNormToStage(p, view, imageSize),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [view.scale, view.offsetX, view.offsetY, naturalWidth, naturalHeight],
    );

    const toNorm = React.useCallback(
      (p: PixelPoint): NormPoint => stageToImageNorm(p, view, imageSize),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [view.scale, view.offsetX, view.offsetY, naturalWidth, naturalHeight],
    );

    const zoomAt = React.useCallback(
      (factor: number, point: PixelPoint) =>
        setViewOverride((current) => zoomViewAt(current ?? baseView, factor, point)),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [baseView.scale, baseView.offsetX, baseView.offsetY],
    );

    React.useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => zoomAt(1.25, { x: size.width / 2, y: size.height / 2 }),
        zoomOut: () => zoomAt(0.8, { x: size.width / 2, y: size.height / 2 }),
        fit: () => setViewOverride(null),
      }),
      [zoomAt, size.width, size.height],
    );

    const localPoint = React.useCallback((clientX: number, clientY: number): PixelPoint => {
      const r = containerRef.current?.getBoundingClientRect();
      return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
    }, []);

    // ---- drag-to-draw (rectangle / rotated box / ellipse / cuboid) -----------
    const [rectDraft, setRectDraft] = React.useState<{ a: PixelPoint; b: PixelPoint } | null>(null);
    const [fourPoints, setFourPoints] = React.useState<NormPoint[]>([]);
    const dragTool =
      tool === 'box' || tool === 'rotated_box' || tool === 'ellipse' || tool === 'cuboid';

    const latestDrag = React.useRef({
      rectDraft,
      tool,
      activeLabelId,
      toNorm,
      onAddObject: props.onAddObject,
    });
    React.useEffect(() => {
      latestDrag.current = {
        rectDraft,
        tool,
        activeLabelId,
        toNorm,
        onAddObject: props.onAddObject,
      };
    });

    const isDragging = rectDraft !== null;
    React.useEffect(() => {
      if (!isDragging) return;
      const onMove = (ev: MouseEvent) => {
        const p = localPoint(ev.clientX, ev.clientY);
        setRectDraft((d) => (d ? { ...d, b: p } : d));
      };
      const onUp = (ev: MouseEvent) => {
        const {
          rectDraft: d,
          tool: activeTool,
          activeLabelId: labelId,
          toNorm: tn,
          onAddObject: add,
        } = latestDrag.current;
        setRectDraft(null);
        if (!d || !labelId) return;
        const a = tn(d.a);
        const b = tn(localPoint(ev.clientX, ev.clientY));
        const box = normalizedBoxFromCorners(a.x, a.y, b.x, b.y);
        if (!box) return;
        let geometry: Geometry;
        if (activeTool === 'rotated_box') {
          geometry = {
            kind: 'rotated_box',
            cx: (box.xMin + box.xMax) / 2,
            cy: (box.yMin + box.yMax) / 2,
            w: box.xMax - box.xMin,
            h: box.yMax - box.yMin,
            angle: 0,
          };
        } else if (activeTool === 'ellipse') {
          geometry = {
            kind: 'ellipse',
            cx: (box.xMin + box.xMax) / 2,
            cy: (box.yMin + box.yMax) / 2,
            rx: (box.xMax - box.xMin) / 2,
            ry: (box.yMax - box.yMin) / 2,
            angle: 0,
          };
        } else if (activeTool === 'cuboid') {
          geometry = cuboidFromBox(box.xMin, box.yMin, box.xMax, box.yMax);
        } else {
          geometry = { kind: 'box', box };
        }
        add(geometry);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    }, [isDragging, localPoint]);

    // ---- click-to-add paths (polygon / polyline / points) --------------------
    const [path, setPath] = React.useState<NormPoint[]>([]);
    const pathTool = tool === 'polygon' || tool === 'polyline' || tool === 'points';

    const finishPath = React.useCallback(() => {
      const points = path;
      setPath([]);
      if (!activeLabelId || points.length === 0) return;
      if (tool === 'points') {
        props.onAddObject({ kind: 'points', points });
      } else if (tool === 'polygon' && points.length >= 3) {
        props.onAddObject({ kind: 'polygon', points });
      } else if (tool === 'polyline' && points.length >= 2) {
        props.onAddObject({ kind: 'polyline', points });
      }
    }, [path, activeLabelId, tool, props]);

    const latestPath = React.useRef({ path, finishPath });
    React.useEffect(() => {
      latestPath.current = { path, finishPath };
    });

    React.useEffect(() => {
      if (props.finishToken > 0) latestPath.current.finishPath();
    }, [props.finishToken]);

    React.useEffect(() => {
      if (!pathTool) setPath([]);
    }, [pathTool]);

    const [cursor, setCursor] = React.useState<PixelPoint | null>(null);
    const [panStart, setPanStart] = React.useState<{
      pointer: PixelPoint;
      view: CanvasView;
    } | null>(null);
    const [selectDraft, setSelectDraft] = React.useState<{ a: PixelPoint; b: PixelPoint } | null>(
      null,
    );
    const [freehand, setFreehand] = React.useState<NormPoint[] | null>(null);

    // Shift-drag freehand: sample the pointer and simplify to a path on release.
    const latestFreehand = React.useRef({
      freehand,
      toNorm,
      localPoint,
      activeLabelId,
      tool,
      onAddObject: props.onAddObject,
    });
    React.useEffect(() => {
      latestFreehand.current = {
        freehand,
        toNorm,
        localPoint,
        activeLabelId,
        tool,
        onAddObject: props.onAddObject,
      };
    });
    const isPanning = panStart !== null;
    React.useEffect(() => {
      if (!isPanning) return;
      const onMove = (ev: MouseEvent) => {
        const p = localPoint(ev.clientX, ev.clientY);
        setViewOverride(
          panView(panStart!.view, p.x - panStart!.pointer.x, p.y - panStart!.pointer.y),
        );
      };
      const onUp = () => setPanStart(null);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    }, [isPanning, panStart, localPoint]);

    React.useEffect(() => {
      if (!selectDraft) return;
      const onMove = (ev: MouseEvent) => {
        const p = localPoint(ev.clientX, ev.clientY);
        setSelectDraft((d) => (d ? { ...d, b: p } : d));
      };
      const onUp = (ev: MouseEvent) => {
        const p = localPoint(ev.clientX, ev.clientY);
        const d = selectDraft;
        setSelectDraft(null);
        if (Math.abs(p.x - d.a.x) < 4 && Math.abs(p.y - d.a.y) < 4) return;
        const xMin = Math.min(d.a.x, p.x);
        const xMax = Math.max(d.a.x, p.x);
        const yMin = Math.min(d.a.y, p.y);
        const yMax = Math.max(d.a.y, p.y);
        const ids = objects
          .filter((o) => {
            const b = geometryBounds(o.geometry, imageSize);
            const tl = imageNormToStage({ x: b.xMin, y: b.yMin }, view, imageSize);
            const br = imageNormToStage({ x: b.xMax, y: b.yMax }, view, imageSize);
            return tl.x <= xMax && br.x >= xMin && tl.y <= yMax && br.y >= yMin;
          })
          .map((o) => o.id);
        props.onSelectObjects?.(ids);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectDraft, localPoint]);

    const isFreehand = freehand !== null;
    React.useEffect(() => {
      if (!isFreehand) return;
      const onMove = (ev: MouseEvent) => {
        const p = latestFreehand.current.localPoint(ev.clientX, ev.clientY);
        const norm = latestFreehand.current.toNorm(p);
        setFreehand((points) => (points ? [...points, norm] : points));
      };
      const onUp = () => {
        const latest = latestFreehand.current;
        const points = simplifyFreehand(latest.freehand ?? [], {
          width: naturalWidth,
          height: naturalHeight,
        });
        setFreehand(null);
        if (!latest.activeLabelId || points.length < 2) return;
        latest.onAddObject(
          latest.tool === 'polygon' ? { kind: 'polygon', points } : { kind: 'polyline', points },
        );
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    }, [isFreehand, localPoint, toNorm, naturalWidth, naturalHeight]);

    const snapCandidates = React.useMemo(
      () => objects.flatMap((o) => geometryVertices(o.geometry)),
      [objects],
    );

    const onStageDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      if (e.evt.button === 1) {
        e.evt.preventDefault();
        const pos = stage.getPointerPosition();
        if (pos) setPanStart({ pointer: pos, view });
        return;
      }
      const shift = e.evt.shiftKey;
      if (shift && (tool === 'polygon' || tool === 'polyline')) {
        const pos = stage.getPointerPosition();
        if (!pos || !activeLabelId) return;
        setFreehand([toNorm(pos)]);
        return;
      }
      if (tool === 'box' && rectangleMethod === 'four-point') {
        if (!activeLabelId) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        const next = [...fourPoints, toNorm(pos)];
        if (next.length < 4) {
          setFourPoints(next);
          return;
        }
        const xs = next.map((p) => p.x);
        const ys = next.map((p) => p.y);
        const box = {
          xMin: Math.min(...xs),
          yMin: Math.min(...ys),
          xMax: Math.max(...xs),
          yMax: Math.max(...ys),
        };
        setFourPoints([]);
        if (normalizedBoxFromCorners(box.xMin, box.yMin, box.xMax, box.yMax)) {
          props.onAddObject({ kind: 'box', box });
        }
        return;
      }
      if (dragTool || tool === 'point') {
        if (!activeLabelId) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        if (tool === 'point') {
          props.onAddObject({ kind: 'point', point: toNorm(pos) });
          return;
        }
        setRectDraft({ a: pos, b: pos });
        return;
      }
      if (pathTool) {
        if (!activeLabelId) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        const candidateStagePoints = snapCandidates.map(toStage);
        let p = toNorm(pos);
        const nearest = candidateStagePoints.reduce<{ index: number; dist: number }>(
          (best, candidate, index) => {
            const dist = Math.hypot(candidate.x - pos.x, candidate.y - pos.y);
            return dist < best.dist ? { index, dist } : best;
          },
          { index: -1, dist: Infinity },
        );
        if (nearest.index >= 0 && nearest.dist <= 10 && !e.evt.ctrlKey && !e.evt.metaKey) {
          p = { ...snapCandidates[nearest.index]! };
        }
        // Clicking the first vertex closes a polygon.
        if (tool === 'polygon' && path.length >= 3) {
          const first = path[0]!;
          if (Math.hypot((p.x - first.x) * pxW, (p.y - first.y) * pxH) < 10) {
            finishPath();
            return;
          }
        }
        setPath((current) => [...current, p]);
        return;
      }
      // select: deselect only on the bare stage/image.
      if (e.target === stage || e.target.name() === 'bg') {
        const pos = stage.getPointerPosition();
        if (pos && props.onSelectObjects) setSelectDraft({ a: pos, b: pos });
        props.onSelect(null);
      }
    };

    const onStageDblClick = () => {
      if (pathTool) latestPath.current.finishPath();
    };

    // Esc cancels an in-progress path or rubber-band.
    React.useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setPath([]);
          setRectDraft(null);
          setFourPoints([]);
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    const ordered = React.useMemo(
      () => [...objects].sort((a, b) => a.zOrder - b.zOrder),
      [objects],
    );

    const draftRect = rectDraft
      ? {
          x: Math.min(rectDraft.a.x, rectDraft.b.x),
          y: Math.min(rectDraft.a.y, rectDraft.b.y),
          width: Math.abs(rectDraft.b.x - rectDraft.a.x),
          height: Math.abs(rectDraft.b.y - rectDraft.a.y),
        }
      : null;

    const pathPixels = path.map(toStage);

    return (
      <div
        ref={containerRef}
        className="relative h-full w-full"
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
      >
        {size.width > 0 && size.height > 0 && (
          <Stage
            width={size.width}
            height={size.height}
            onMouseDown={onStageDown}
            onDblClick={onStageDblClick}
            onMouseMove={(e) => setCursor(e.target.getStage()?.getPointerPosition() ?? null)}
            onMouseLeave={() => setCursor(null)}
            onWheel={(e) => {
              e.evt.preventDefault();
              const pos = e.target.getStage()?.getPointerPosition();
              if (pos) zoomAt(e.evt.deltaY < 0 ? 1.1 : 0.9, pos);
            }}
          >
            <Layer>
              {img && (
                <KonvaImage
                  ref={imageRef}
                  image={img}
                  name="bg"
                  x={view.offsetX}
                  y={view.offsetY}
                  width={pxW}
                  height={pxH}
                />
              )}
            </Layer>
            <Layer>
              {ordered
                .filter((o) => o.visible && !o.outside)
                .map((obj) => (
                  <ObjectShape
                    key={obj.id}
                    object={obj}
                    size={{ width: naturalWidth, height: naturalHeight }}
                    stageSize={{ width: pxW, height: pxH }}
                    toStage={toStage}
                    toNorm={toNorm}
                    selected={obj.id === selectedId || selectedIds.includes(obj.id)}
                    editable={tool === 'select' && !obj.locked}
                    onSelect={() => props.onSelect(obj.id)}
                    onGeometry={(g) => props.onUpdateGeometry(obj.id, g)}
                    onVertex={(index, p) => props.onUpdateVertex(obj.id, index, p)}
                    onInsertVertex={(index, p) => props.onInsertVertex?.(obj.id, index, p)}
                    onDeleteVertex={(index) => props.onDeleteVertex?.(obj.id, index)}
                    onRename={(name) => props.onRenameObject?.(obj.id, name)}
                  />
                ))}
              {draftRect && (
                <Rect
                  {...draftRect}
                  stroke={activeColorFor(activeLabelId, objects)}
                  strokeWidth={1.5}
                  dash={[6, 4]}
                  fill="rgba(77,163,255,0.12)"
                  listening={false}
                />
              )}
              {pathPixels.length > 0 && (
                <>
                  {pathPixels.map((p, i) => (
                    <Circle
                      key={`p${i}`}
                      x={p.x}
                      y={p.y}
                      radius={4}
                      fill="#F5F7FA"
                      stroke="#0B0D10"
                      strokeWidth={1}
                      listening={false}
                    />
                  ))}
                  {pathPixels.length > 1 && (
                    <Line
                      points={pathPixels.flatMap((p) => [p.x, p.y])}
                      stroke="#4DA3FF"
                      strokeWidth={1.5}
                      dash={[6, 4]}
                      closed={tool === 'polygon'}
                      listening={false}
                    />
                  )}
                </>
              )}
              {fourPoints.length > 0 && (
                <>
                  {fourPoints.map((p, i) => {
                    const sp = toStage(p);
                    return (
                      <Circle
                        key={`fp${i}`}
                        x={sp.x}
                        y={sp.y}
                        radius={4}
                        fill="#F5B942"
                        stroke="#0B0D10"
                        strokeWidth={1}
                        listening={false}
                      />
                    );
                  })}
                  <Text
                    x={8}
                    y={8}
                    text={`4-point rectangle: ${fourPoints.length}/4 corners`}
                    fontSize={12}
                    fill="#F5B942"
                    listening={false}
                  />
                </>
              )}
              {selectDraft && (
                <Rect
                  x={Math.min(selectDraft.a.x, selectDraft.b.x)}
                  y={Math.min(selectDraft.a.y, selectDraft.b.y)}
                  width={Math.abs(selectDraft.b.x - selectDraft.a.x)}
                  height={Math.abs(selectDraft.b.y - selectDraft.a.y)}
                  stroke="#4DA3FF"
                  strokeWidth={1}
                  dash={[4, 3]}
                  fill="rgba(77,163,255,0.08)"
                  listening={false}
                />
              )}
              {freehand && freehand.length > 1 && (
                <Line
                  points={freehand.map(toStage).flatMap((p) => [p.x, p.y])}
                  stroke="#4DA3FF"
                  strokeWidth={1.5}
                  dash={[6, 4]}
                  closed={tool === 'polygon'}
                  listening={false}
                />
              )}
              {cursor && tool !== 'select' && (
                <>
                  <Line
                    points={[cursor.x, 0, cursor.x, size.height]}
                    stroke="#F04438"
                    strokeWidth={1}
                    opacity={0.5}
                    listening={false}
                  />
                  <Line
                    points={[0, cursor.y, size.width, cursor.y]}
                    stroke="#F04438"
                    strokeWidth={1}
                    opacity={0.5}
                    listening={false}
                  />
                </>
              )}
              {draftRect && (
                <Text
                  x={draftRect.x}
                  y={Math.max(0, draftRect.y - 20)}
                  text={`${Math.round(draftRect.width)} × ${Math.round(draftRect.height)} px`}
                  fontSize={11}
                  fontFamily="monospace"
                  fill="#F5F7FA"
                  listening={false}
                />
              )}
            </Layer>
          </Stage>
        )}
      </div>
    );
  },
);

function activeColorFor(labelId: string | null, objects: CanvasObject[]): string {
  return objects.find((o) => o.labelId === labelId)?.color ?? '#4DA3FF';
}

interface ShapeProps {
  object: CanvasObject;
  size: { width: number; height: number };
  /** Rendered image size in stage pixels (normalized × stageSize). */
  stageSize: { width: number; height: number };
  toStage: (p: NormPoint) => PixelPoint;
  toNorm: (p: PixelPoint) => NormPoint;
  selected: boolean;
  editable: boolean;
  onSelect: () => void;
  onGeometry: (g: Geometry) => void;
  onVertex: (index: number, p: NormPoint) => void;
  onInsertVertex?: (index: number, p: NormPoint) => void;
  onDeleteVertex?: (index: number) => void;
  onRename?: (name: string) => void;
}

/** Render one object and its edit handles. */
function ObjectShape(props: ShapeProps) {
  const {
    object,
    size,
    stageSize,
    toStage,
    toNorm,
    selected,
    editable,
    onSelect,
    onGeometry,
    onVertex,
    onInsertVertex,
    onDeleteVertex,
    onRename,
  } = props;
  const shapeRef = React.useRef<Konva.Shape>(null);
  const trRef = React.useRef<Konva.Transformer>(null);
  const color = object.color;
  const strokeWidth = selected ? 2.5 : 1.5;
  const dash = object.occluded ? [6, 4] : undefined;
  const fill = `${color}1A`;
  const common = {
    name: 'object',
    stroke: color,
    strokeWidth,
    dash,
    fill,
    draggable: editable,
    onClick: onSelect,
    onTap: onSelect,
    listening: editable || selected,
  };

  React.useEffect(() => {
    if (selected && trRef.current && shapeRef.current && supportsTransformer(object.geometry)) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected, object.geometry]);

  const moveBy = (dxPx: number, dyPx: number) => {
    const a = toNorm({ x: dxPx, y: dyPx });
    const b = toNorm({ x: 0, y: 0 });
    onGeometry(offsetGeometryLocal(object.geometry, a.x - b.x, a.y - b.y));
  };

  // Konva drag gives absolute positions; compute delta from the geometry's
  // original top-left rather than tracking a private field.
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>, origin: PixelPoint) => {
    const node = e.target;
    moveBy(node.x() - origin.x, node.y() - origin.y);
  };

  const g = object.geometry;
  const bounds = geometryBounds(g, size);
  const origin = toStage({ x: bounds.xMin, y: bounds.yMin });
  const labelText = `${object.labelName}${object.occluded ? ' (occluded)' : ''}`;

  let shape: React.ReactNode = null;
  if (g.kind === 'box') {
    shape = (
      <Rect
        {...common}
        ref={shapeRef as React.Ref<Konva.Rect>}
        x={origin.x}
        y={origin.y}
        width={(g.box.xMax - g.box.xMin) * stageSize.width}
        height={(g.box.yMax - g.box.yMin) * stageSize.height}
        cornerRadius={2}
        onDragEnd={(e) => handleDragEnd(e, origin)}
        onTransformEnd={() => {
          const node = shapeRef.current as Konva.Rect | null;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          const p0 = toNorm({ x: node.x(), y: node.y() });
          const p1 = toNorm({ x: node.x() + node.width() * sx, y: node.y() + node.height() * sy });
          onGeometry({ kind: 'box', box: { xMin: p0.x, yMin: p0.y, xMax: p1.x, yMax: p1.y } });
        }}
      />
    );
  } else if (g.kind === 'rotated_box') {
    const cx = toStage({ x: g.cx, y: g.cy });
    shape = (
      <Rect
        {...common}
        ref={shapeRef as React.Ref<Konva.Rect>}
        x={cx.x - (g.w * stageSize.width) / 2}
        y={cx.y - (g.h * stageSize.height) / 2}
        width={g.w * stageSize.width}
        height={g.h * stageSize.height}
        rotation={g.angle}
        onDragEnd={(e) => {
          const node = e.target;
          const next = toNorm({ x: node.x() + node.width() / 2, y: node.y() + node.height() / 2 });
          onGeometry({ ...g, cx: next.x, cy: next.y });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current as Konva.Rect | null;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          const center = toNorm({
            x: node.x() + node.width() / 2,
            y: node.y() + node.height() / 2,
          });
          onGeometry({
            ...g,
            cx: center.x,
            cy: center.y,
            w: Math.max(0.002, g.w * sx),
            h: Math.max(0.002, g.h * sy),
            angle: node.rotation(),
          });
        }}
      />
    );
  } else if (g.kind === 'ellipse') {
    const c = toStage({ x: g.cx, y: g.cy });
    shape = (
      <Ellipse
        {...common}
        ref={shapeRef as React.Ref<Konva.Ellipse>}
        x={c.x}
        y={c.y}
        radiusX={g.rx * stageSize.width}
        radiusY={g.ry * stageSize.height}
        rotation={g.angle}
        onDragEnd={(e) => {
          const next = toNorm({ x: e.target.x(), y: e.target.y() });
          onGeometry({ ...g, cx: next.x, cy: next.y });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current as Konva.Ellipse | null;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          const center = toNorm({ x: node.x(), y: node.y() });
          onGeometry({
            ...g,
            cx: center.x,
            cy: center.y,
            rx: Math.max(0.002, g.rx * sx),
            ry: Math.max(0.002, g.ry * sy),
            angle: node.rotation(),
          });
        }}
      />
    );
  } else if (g.kind === 'polygon' || g.kind === 'polyline') {
    const pts = g.points.map(toStage);
    shape = (
      <Line
        {...common}
        ref={shapeRef as React.Ref<Konva.Line>}
        points={pts.flatMap((p) => [p.x, p.y])}
        closed={g.kind === 'polygon'}
        fill={g.kind === 'polygon' ? fill : undefined}
        onDblClick={(e) => {
          e.cancelBubble = true;
          const pos = e.target.getStage()?.getPointerPosition();
          if (!pos || !onInsertVertex) return;
          const p = toNorm(pos);
          let bestIndex = 0;
          let bestDistance = Infinity;
          const count = g.kind === 'polygon' ? g.points.length : g.points.length - 1;
          for (let i = 0; i < count; i += 1) {
            const d = distanceToSegmentPx(
              p,
              g.points[i]!,
              g.points[(i + 1) % g.points.length]!,
              size,
            );
            if (d < bestDistance) {
              bestDistance = d;
              bestIndex = i;
            }
          }
          onInsertVertex(bestIndex + 1, p);
        }}
        onDragEnd={(e) => handleDragEnd(e, origin)}
        onTransformEnd={() => {
          const node = shapeRef.current as Konva.Line | null;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          const scaled = Array.from({ length: g.points.length }, (_, i) => {
            const px = Number(node.x(i));
            const py = Number(node.y(i));
            return toNorm({ x: node.x() + px * sx, y: node.y() + py * sy });
          });
          onGeometry({ ...g, points: scaled });
        }}
      />
    );
  } else if (g.kind === 'point' || g.kind === 'points') {
    const pts = g.kind === 'point' ? [g.point] : g.points;
    shape = (
      <>
        {pts.map((p, i) => {
          const sp = toStage(p);
          return (
            <Circle
              key={i}
              {...common}
              ref={i === 0 ? (shapeRef as React.Ref<Konva.Circle>) : undefined}
              x={sp.x}
              y={sp.y}
              radius={selected ? 7 : 5}
              onDragEnd={(e) => {
                if (g.kind === 'point') {
                  onGeometry({
                    kind: 'point',
                    point: toNorm({ x: e.target.x(), y: e.target.y() }),
                  });
                } else {
                  onVertex(i, toNorm({ x: e.target.x(), y: e.target.y() }));
                }
              }}
            />
          );
        })}
      </>
    );
  } else if (g.kind === 'cuboid') {
    shape = (
      <>
        {CUBOID_EDGES.map(([a, b], i) => {
          const pa = toStage(g.points[a]!);
          const pb = toStage(g.points[b]!);
          return (
            <Line
              key={i}
              points={[pa.x, pa.y, pb.x, pb.y]}
              stroke={color}
              strokeWidth={strokeWidth}
              dash={dash}
              listening={editable}
              onClick={onSelect}
              onTap={onSelect}
            />
          );
        })}
      </>
    );
  }

  const vertexKinds =
    g.kind === 'polygon' || g.kind === 'polyline' || g.kind === 'points' || g.kind === 'cuboid';
  const vertices = vertexKinds ? g.points : null;

  return (
    <>
      {shape}
      <Label x={origin.x} y={Math.max(0, origin.y - 18)} listening={editable}>
        <Tag fill="rgba(5,8,12,0.88)" cornerRadius={2} />
        <Text
          text={labelText}
          fontSize={11}
          fontStyle="bold"
          fill={color}
          padding={3}
          onDblClick={() => {
            const next = window.prompt('Object label', object.labelName);
            if (next && next.trim()) onRename?.(next.trim());
          }}
        />
      </Label>
      {selected && supportsTransformer(g) && (
        <Transformer
          ref={trRef}
          rotateEnabled={g.kind === 'rotated_box' || g.kind === 'ellipse'}
          keepRatio={false}
          borderStroke={color}
          anchorStroke={HANDLE_RING}
          anchorFill={HANDLE_FILL}
          anchorSize={8}
          anchorCornerRadius={2}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 6 || newBox.height < 6 ? oldBox : newBox
          }
        />
      )}
      {selected && editable && vertices && (
        <>
          {vertices.map((p, i) => {
            const sp = toStage(p);
            return (
              <Circle
                key={`v${i}`}
                x={sp.x}
                y={sp.y}
                radius={5}
                fill="#F5F7FA"
                stroke="#0B0D10"
                strokeWidth={1}
                draggable
                onDragEnd={(e) => onVertex(i, toNorm({ x: e.target.x(), y: e.target.y() }))}
                onContextMenu={(e) => {
                  e.evt.preventDefault();
                  e.cancelBubble = true;
                  onDeleteVertex?.(i);
                }}
              />
            );
          })}
        </>
      )}
      {selected && editable && g.kind === 'rotated_box' && (
        <Text
          x={origin.x}
          y={Math.max(0, origin.y - 34)}
          text={`${Math.round(g.angle)}°`}
          fontSize={11}
          fill={color}
          listening={false}
        />
      )}
    </>
  );
}

function supportsTransformer(g: Geometry): boolean {
  return (
    g.kind === 'box' ||
    g.kind === 'rotated_box' ||
    g.kind === 'ellipse' ||
    g.kind === 'polygon' ||
    g.kind === 'polyline'
  );
}

/** Mirrors the domain offset helper locally to keep the canvas self-contained. */
function offsetGeometryLocal(g: Geometry, dx: number, dy: number): Geometry {
  if (g.kind === 'box') {
    return {
      kind: 'box',
      box: {
        xMin: g.box.xMin + dx,
        yMin: g.box.yMin + dy,
        xMax: g.box.xMax + dx,
        yMax: g.box.yMax + dy,
      },
    };
  }
  if (g.kind === 'point') return { kind: 'point', point: { x: g.point.x + dx, y: g.point.y + dy } };
  if (g.kind === 'rotated_box' || g.kind === 'ellipse')
    return { ...g, cx: g.cx + dx, cy: g.cy + dy };
  return { ...g, points: g.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

/** Kept for callers that need a normalized box from two stage points. */
export function stageBox(
  a: PixelPoint,
  b: PixelPoint,
  toNorm: (p: PixelPoint) => NormPoint,
): NormalizedBox | null {
  const pa = toNorm(a);
  const pb = toNorm(b);
  return normalizedBoxFromCorners(pa.x, pa.y, pb.x, pb.y);
}
