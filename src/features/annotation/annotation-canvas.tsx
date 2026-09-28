'use client';

import * as React from 'react';
import {
  Circle,
  Image as KonvaImage,
  Label,
  Layer,
  Rect,
  Stage,
  Tag,
  Text,
  Transformer,
} from 'react-konva';
import type Konva from 'konva';
import { computeContainFit, normalizedBoxFromCorners } from '@/core/annotation/bbox';
import type { NormalizedBox, RedactionCircle } from '@/types/domain';

/**
 * Annotation canvas (Konva).
 *
 * Renders the (never-modified) source frame and its bounding boxes. Boxes are
 * stored normalized (0..1); this component is the only place that converts to
 * pixels, using a contain-fit transform. Each box draws in its component's
 * deterministic color (border + label text share the hue; fill is ~10% alpha).
 *
 * The same surface also hosts the face-blur tool: circular privacy regions that
 * are drawn center-out, moved, and resized here and baked into the exported
 * copies at submit time. Redactions are independent of the class/view ontology,
 * so they render and stay editable no matter which class/view is selected.
 */

/** A privacy-redaction circle prepared for the canvas (still normalized). */
export type CanvasRedaction = RedactionCircle;

/** Amber marker palette for redaction circles (reserved; never a box hue). */
const REDACTION_STROKE = '#F5B942';
const REDACTION_FILL = 'rgba(17,21,26,0.45)';
const REDACTION_LABEL_BG = 'rgba(5,8,12,0.9)';

/**
 * Resize-handle styling for selection Transformers. Konva's default anchor fill
 * is white, which disappears against light image regions — so the annotator
 * loses the handles exactly where the photo is bright. These are an
 * annotator-only affordance (never exported), so we fill them a high-contrast
 * red with a thin light ring that stays visible on any background. The box's own
 * border keeps its semantic component color (CLAUDE.md §9.7).
 */
const HANDLE_FILL = '#F04438';
const HANDLE_RING = '#FFFFFF';

export interface CanvasBox {
  id: string;
  componentKey: string;
  label: string;
  box: NormalizedBox;
  border: string;
  fill: string;
  labelBg: string;
  labelText: string;
}

export interface AnnotationCanvasProps {
  imageUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  boxes: CanvasBox[];
  selectedBoxId: string | null;
  activeComponentKey: string | null;
  activeColor: string | null;
  onDrawBox: (componentKey: string, box: NormalizedBox) => void;
  onUpdateBox: (id: string, box: NormalizedBox) => void;
  onSelectBox: (id: string | null) => void;
  /** Face-blur redactions (normalized). */
  redactions: CanvasRedaction[];
  selectedRedactionId: string | null;
  /** True while the face-blur tool is armed (a press draws a new circle). */
  blurArmed: boolean;
  /** New circle drawn center-out: (cx, cy) center + radius r, all normalized. */
  onDrawRedaction: (cx: number, cy: number, r: number) => void;
  onUpdateRedaction: (id: string, patch: { cx?: number; cy?: number; r?: number }) => void;
  onSelectRedaction: (id: string | null) => void;
}

export function AnnotationCanvas(props: AnnotationCanvasProps) {
  const {
    naturalWidth,
    naturalHeight,
    boxes,
    selectedBoxId,
    activeComponentKey,
    activeColor,
    redactions,
    selectedRedactionId,
    blurArmed,
  } = props;

  // While either tool is armed for drawing, existing boxes AND redaction circles
  // are frozen (not listening) so a press over one starts a NEW shape instead of
  // dragging the shape underneath it.
  const boxArmed = activeComponentKey !== null;
  const anyArmed = boxArmed || blurArmed;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);

  // Load the source frame (served through the byte route; never modified).
  React.useEffect(() => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.src = props.imageUrl;
    image.onload = () => setImg(image);
    return () => {
      image.onload = null;
    };
  }, [props.imageUrl]);

  // Track the available canvas area.
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

  const fit = computeContainFit(size.width, size.height, naturalWidth, naturalHeight);
  const pxW = naturalWidth * fit.scale;
  const pxH = naturalHeight * fit.scale;

  const toPixel = React.useCallback(
    (b: NormalizedBox) => ({
      x: fit.offsetX + b.xMin * pxW,
      y: fit.offsetY + b.yMin * pxH,
      width: (b.xMax - b.xMin) * pxW,
      height: (b.yMax - b.yMin) * pxH,
    }),
    [fit.offsetX, fit.offsetY, pxW, pxH],
  );

  const toNormalized = React.useCallback(
    (x: number, y: number): { nx: number; ny: number } => ({
      nx: pxW > 0 ? (x - fit.offsetX) / pxW : 0,
      ny: pxH > 0 ? (y - fit.offsetY) / pxH : 0,
    }),
    [fit.offsetX, fit.offsetY, pxW, pxH],
  );

  // Redaction circle transforms. Center maps like any point; the radius is a
  // fraction of image WIDTH, so it scales by pxW alone — which keeps the circle
  // perfectly round at any fit (the exporter uses the same width-only rule).
  const toPixelCircle = React.useCallback(
    (c: CanvasRedaction) => ({
      x: fit.offsetX + c.cx * pxW,
      y: fit.offsetY + c.cy * pxH,
      radius: c.r * pxW,
    }),
    [fit.offsetX, fit.offsetY, pxW, pxH],
  );

  const radiusToNormalized = React.useCallback(
    (radiusPx: number) => (pxW > 0 ? radiusPx / pxW : 0),
    [pxW],
  );

  // ---- new-box drawing ----
  const [draft, setDraft] = React.useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  // ---- new-redaction (circle) drawing, center-out ----
  // (cx, cy) is the fixed center (press point); (x1, y1) tracks the cursor so the
  // radius is the distance between them.
  const [circleDraft, setCircleDraft] = React.useState<{
    cx: number;
    cy: number;
    x1: number;
    y1: number;
  } | null>(null);

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();

    if (blurArmed) {
      // Face-blur armed: the press point is the CENTER of a new circle and the
      // drag distance is its radius (center-out — the natural "grow from the
      // face" gesture, small to big). Frozen boxes/circles can't hijack it.
      const pos = stage?.getPointerPosition();
      if (!pos) return;
      setCircleDraft({ cx: pos.x, cy: pos.y, x1: pos.x, y1: pos.y });
      return;
    }

    if (activeComponentKey) {
      // Armed to draw: a press ANYWHERE on the canvas begins a new rubber-band —
      // including directly on top of an existing box. While armed, existing
      // boxes are made non-interactive (`listening={false}`, see `armed` on
      // <BoxShape>), so they can't hijack the gesture. This is what lets a part
      // be drawn inside a full-frame box (e.g. a Steering Head, Motor, or Chain
      // over the Rickshaw Body) instead of grabbing and moving that outer box.
      const pos = stage?.getPointerPosition();
      if (!pos) return;
      setDraft({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
      return;
    }

    // Not drawing: clicking empty area clears the selection. "Empty area" = the
    // bare stage background or the source image. A box (name "box"), a redaction
    // circle (name "redaction"), or a Transformer resize handle is NOT empty area
    // and is left alone, so deselecting mid-gesture can't unmount the Transformer
    // and abort the very move/resize the user just started.
    const isEmptyArea = e.target === stage || e.target.name() === 'bg';
    if (isEmptyArea) {
      props.onSelectBox(null);
      props.onSelectRedaction(null);
    }
  };

  // Once a draw starts, the gesture runs on `window` — not just the Stage — so
  // moving or releasing OUTSIDE the canvas still updates and finalizes the box.
  // Otherwise a mouseup over a side panel never reaches the Stage and leaves a
  // "stuck" rubber-band that the next click resumes. A ref holds the latest
  // values so the window listeners never need to re-subscribe mid-drag.
  const latest = React.useRef({
    draft,
    activeComponentKey,
    toNormalized,
    onDrawBox: props.onDrawBox,
  });
  React.useEffect(() => {
    latest.current = { draft, activeComponentKey, toNormalized, onDrawBox: props.onDrawBox };
  });

  const localPoint = React.useCallback((clientX: number, clientY: number) => {
    const r = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, []);

  const isDrafting = draft !== null;
  React.useEffect(() => {
    if (!isDrafting) return;
    const onMove = (ev: MouseEvent) => {
      const p = localPoint(ev.clientX, ev.clientY);
      setDraft((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
    };
    const onUp = (ev: MouseEvent) => {
      const p = localPoint(ev.clientX, ev.clientY);
      const { draft: d, activeComponentKey: key, toNormalized: toN, onDrawBox } = latest.current;
      setDraft(null);
      if (!d || !key) return;
      const a = toN(d.x0, d.y0);
      const b = toN(p.x, p.y);
      const normalized = normalizedBoxFromCorners(a.nx, a.ny, b.nx, b.ny);
      if (normalized) onDrawBox(key, normalized);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDrafting, localPoint]);

  // Disarming (Esc, or toggling the Draw button off) also drops any in-progress
  // rubber-band so a half-drawn box can't linger after the tool is put away.
  React.useEffect(() => {
    if (!activeComponentKey) setDraft(null);
  }, [activeComponentKey]);

  // Circle-draw gesture on `window` (mirrors the box one) so a release over a
  // side panel still finalizes the circle instead of leaving a stuck draft.
  const latestCircle = React.useRef({
    circleDraft,
    blurArmed,
    toNormalized,
    radiusToNormalized,
    onDrawRedaction: props.onDrawRedaction,
  });
  React.useEffect(() => {
    latestCircle.current = {
      circleDraft,
      blurArmed,
      toNormalized,
      radiusToNormalized,
      onDrawRedaction: props.onDrawRedaction,
    };
  });

  const isCircleDrafting = circleDraft !== null;
  React.useEffect(() => {
    if (!isCircleDrafting) return;
    const onMove = (ev: MouseEvent) => {
      const p = localPoint(ev.clientX, ev.clientY);
      setCircleDraft((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
    };
    const onUp = (ev: MouseEvent) => {
      const p = localPoint(ev.clientX, ev.clientY);
      const {
        circleDraft: d,
        blurArmed: armedNow,
        toNormalized: toN,
        radiusToNormalized: rToN,
        onDrawRedaction,
      } = latestCircle.current;
      setCircleDraft(null);
      if (!d || !armedNow) return;
      const center = toN(d.cx, d.cy);
      const radiusPx = Math.hypot(p.x - d.cx, p.y - d.cy);
      const r = rToN(radiusPx);
      // The store validates + clamps (a sub-threshold flick is ignored there).
      onDrawRedaction(center.nx, center.ny, r);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isCircleDrafting, localPoint]);

  // Putting the blur tool away drops any half-drawn circle.
  React.useEffect(() => {
    if (!blurArmed) setCircleDraft(null);
  }, [blurArmed]);

  const draftRect = draft
    ? {
        x: Math.min(draft.x0, draft.x1),
        y: Math.min(draft.y0, draft.y1),
        width: Math.abs(draft.x1 - draft.x0),
        height: Math.abs(draft.y1 - draft.y0),
      }
    : null;

  const circleDraftGeom = circleDraft
    ? {
        x: circleDraft.cx,
        y: circleDraft.cy,
        radius: Math.hypot(circleDraft.x1 - circleDraft.cx, circleDraft.y1 - circleDraft.cy),
      }
    : null;

  // Draw the selected box last so it (and its Transformer handles) sits on top
  // of any overlapping boxes and stays grabbable for move/resize.
  const orderedBoxes = React.useMemo(() => {
    if (!selectedBoxId) return boxes;
    const selected = boxes.find((b) => b.id === selectedBoxId);
    if (!selected) return boxes;
    return [...boxes.filter((b) => b.id !== selectedBoxId), selected];
  }, [boxes, selectedBoxId]);

  // Same "selected sits on top" ordering for redaction circles.
  const orderedRedactions = React.useMemo(() => {
    if (!selectedRedactionId) return redactions;
    const selected = redactions.find((c) => c.id === selectedRedactionId);
    if (!selected) return redactions;
    return [...redactions.filter((c) => c.id !== selectedRedactionId), selected];
  }, [redactions, selectedRedactionId]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{ cursor: anyArmed ? 'crosshair' : 'default' }}
    >
      {size.width > 0 && size.height > 0 && (
        <Stage width={size.width} height={size.height} onMouseDown={onStageMouseDown}>
          <Layer>
            {img && (
              <KonvaImage
                image={img}
                name="bg"
                x={fit.offsetX}
                y={fit.offsetY}
                width={pxW}
                height={pxH}
              />
            )}
          </Layer>
          <Layer>
            {orderedBoxes.map((b) => (
              <BoxShape
                key={b.id}
                box={b}
                rect={toPixel(b.box)}
                selected={b.id === selectedBoxId}
                armed={anyArmed}
                onSelect={() => props.onSelectBox(b.id)}
                onChange={(rect) => {
                  const a = toNormalized(rect.x, rect.y);
                  const c = toNormalized(rect.x + rect.width, rect.y + rect.height);
                  const nb = normalizedBoxFromCorners(a.nx, a.ny, c.nx, c.ny);
                  if (nb) props.onUpdateBox(b.id, nb);
                }}
              />
            ))}
            {draftRect && (
              <Rect
                x={draftRect.x}
                y={draftRect.y}
                width={draftRect.width}
                height={draftRect.height}
                stroke={activeColor ?? '#4DA3FF'}
                strokeWidth={1.5}
                dash={[6, 4]}
                fill={`${activeColor ?? '#4DA3FF'}22`}
                listening={false}
              />
            )}
          </Layer>
          {/* Redaction circles sit above the boxes so a face marker is never
              hidden behind a full-frame body box. */}
          <Layer>
            {orderedRedactions.map((c) => (
              <RedactionShape
                key={c.id}
                circle={toPixelCircle(c)}
                selected={c.id === selectedRedactionId}
                armed={anyArmed}
                onSelect={() => props.onSelectRedaction(c.id)}
                onChange={(next) => {
                  const center = toNormalized(next.x, next.y);
                  props.onUpdateRedaction(c.id, {
                    cx: center.nx,
                    cy: center.ny,
                    r: radiusToNormalized(next.radius),
                  });
                }}
              />
            ))}
            {circleDraftGeom && circleDraftGeom.radius > 0 && (
              <Circle
                x={circleDraftGeom.x}
                y={circleDraftGeom.y}
                radius={circleDraftGeom.radius}
                stroke={REDACTION_STROKE}
                strokeWidth={1.5}
                dash={[6, 4]}
                fill={REDACTION_FILL}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function BoxShape({
  box,
  rect,
  selected,
  armed,
  onSelect,
  onChange,
}: {
  box: CanvasBox;
  rect: PixelRect;
  selected: boolean;
  /** True while a component is armed for drawing; freezes this box so a press
   *  on it starts a new rubber-band instead of selecting/dragging it. */
  armed: boolean;
  onSelect: () => void;
  onChange: (rect: PixelRect) => void;
}) {
  const shapeRef = React.useRef<Konva.Rect>(null);
  const trRef = React.useRef<Konva.Transformer>(null);

  React.useEffect(() => {
    if (selected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  return (
    <>
      <Rect
        ref={shapeRef}
        name="box"
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        stroke={box.border}
        strokeWidth={selected ? 2.5 : 1.5}
        fill={box.fill}
        shadowColor={box.border}
        shadowBlur={selected ? 8 : 0}
        shadowOpacity={selected ? 0.6 : 0}
        cornerRadius={2}
        listening={!armed}
        draggable={!armed}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ ...rect, x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            width: Math.max(4, node.width() * scaleX),
            height: Math.max(4, node.height() * scaleY),
          });
        }}
      />
      <Label x={rect.x} y={Math.max(0, rect.y - 18)} listening={false}>
        <Tag fill={box.labelBg} cornerRadius={2} />
        <Text text={box.label} fontSize={11} fontStyle="bold" fill={box.labelText} padding={3} />
      </Label>
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          keepRatio={false}
          borderStroke={box.border}
          anchorStroke={HANDLE_RING}
          anchorFill={HANDLE_FILL}
          anchorSize={8}
          anchorCornerRadius={2}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 6 || newBox.height < 6 ? oldBox : newBox
          }
        />
      )}
    </>
  );
}

interface PixelCircle {
  x: number;
  y: number;
  radius: number;
}

/**
 * A single face-mosaic circle: a draggable, resizable Konva Circle plus a small
 * "Mosaic" tag. Frozen (non-interactive) while either draw tool is armed so a
 * press starts a new shape instead of grabbing this one. Resizing keeps it a
 * perfect circle (keepRatio + corner anchors) and bakes the scale back into the
 * radius on transform end, mirroring how BoxShape bakes scale into width/height.
 */
function RedactionShape({
  circle,
  selected,
  armed,
  onSelect,
  onChange,
}: {
  circle: PixelCircle;
  selected: boolean;
  armed: boolean;
  onSelect: () => void;
  onChange: (circle: PixelCircle) => void;
}) {
  const shapeRef = React.useRef<Konva.Circle>(null);
  const trRef = React.useRef<Konva.Transformer>(null);

  React.useEffect(() => {
    if (selected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  return (
    <>
      <Circle
        ref={shapeRef}
        name="redaction"
        x={circle.x}
        y={circle.y}
        radius={circle.radius}
        stroke={REDACTION_STROKE}
        strokeWidth={selected ? 2.5 : 1.5}
        fill={REDACTION_FILL}
        shadowColor={REDACTION_STROKE}
        shadowBlur={selected ? 8 : 0}
        shadowOpacity={selected ? 0.6 : 0}
        listening={!armed}
        draggable={!armed}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y(), radius: circle.radius })}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          // keepRatio keeps scaleX≈scaleY; average guards against rounding drift.
          const scale = (Math.abs(node.scaleX()) + Math.abs(node.scaleY())) / 2;
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            radius: Math.max(2, node.radius() * scale),
          });
        }}
      />
      <Label
        x={circle.x - circle.radius}
        y={Math.max(0, circle.y - circle.radius - 18)}
        listening={false}
      >
        <Tag fill={REDACTION_LABEL_BG} cornerRadius={2} />
        <Text text="Mosaic" fontSize={11} fontStyle="bold" fill={REDACTION_STROKE} padding={3} />
      </Label>
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          keepRatio
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          borderStroke={REDACTION_STROKE}
          anchorStroke={HANDLE_RING}
          anchorFill={HANDLE_FILL}
          anchorSize={8}
          anchorCornerRadius={2}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 6 || newBox.height < 6 ? oldBox : newBox
          }
        />
      )}
    </>
  );
}
