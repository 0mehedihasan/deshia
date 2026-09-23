'use client';

import * as React from 'react';
import { Image as KonvaImage, Label, Layer, Rect, Stage, Tag, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import { normalizedBoxFromCorners } from '@/core/annotation/bbox';
import type { NormalizedBox } from '@/types/domain';

/**
 * Annotation canvas (Konva).
 *
 * Renders the (never-modified) source frame and its bounding boxes. Boxes are
 * stored normalized (0..1); this component is the only place that converts to
 * pixels, using a contain-fit transform. Each box draws in its component's
 * deterministic color (border + label text share the hue; fill is ~10% alpha).
 */

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
}

interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function computeFit(stageW: number, stageH: number, natW: number, natH: number): Fit {
  if (natW <= 0 || natH <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.min(stageW / natW, stageH / natH);
  return {
    scale,
    offsetX: (stageW - natW * scale) / 2,
    offsetY: (stageH - natH * scale) / 2,
  };
}

export function AnnotationCanvas(props: AnnotationCanvasProps) {
  const { naturalWidth, naturalHeight, boxes, selectedBoxId, activeComponentKey, activeColor } = props;

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

  const fit = computeFit(size.width, size.height, naturalWidth, naturalHeight);
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

  // ---- new-box drawing ----
  const [draft, setDraft] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    // "Empty area" = the bare stage background or the source image itself.
    // A box (name "box") or a Transformer resize handle is NOT empty area, and
    // must never clear the selection: deselecting mid-gesture unmounts the
    // Transformer and aborts the very move/resize the user just started (this
    // was the "can't move / resize a box" bug).
    const isEmptyArea = e.target === stage || e.target.name() === 'bg';

    if (activeComponentKey) {
      // Armed to draw: only begin a rubber-band from empty canvas / the image,
      // never on top of an existing box or its handles.
      if (!isEmptyArea) return;
      const pos = stage?.getPointerPosition();
      if (!pos) return;
      setDraft({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
      return;
    }

    // Not drawing: clicking empty area clears the selection. Clicks on a box
    // (selected via its own handler) or a Transformer anchor are left alone so
    // the drag/resize gesture can proceed.
    if (isEmptyArea) props.onSelectBox(null);
  };

  const onStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!draft) return;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    setDraft((d) => (d ? { ...d, x1: pos.x, y1: pos.y } : d));
  };

  const onStageMouseUp = () => {
    if (!draft || !activeComponentKey) {
      setDraft(null);
      return;
    }
    const a = toNormalized(draft.x0, draft.y0);
    const b = toNormalized(draft.x1, draft.y1);
    const normalized = normalizedBoxFromCorners(a.nx, a.ny, b.nx, b.ny);
    setDraft(null);
    if (normalized) props.onDrawBox(activeComponentKey, normalized);
  };

  const draftRect = draft
    ? {
        x: Math.min(draft.x0, draft.x1),
        y: Math.min(draft.y0, draft.y1),
        width: Math.abs(draft.x1 - draft.x0),
        height: Math.abs(draft.y1 - draft.y0),
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

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{ cursor: activeComponentKey ? 'crosshair' : 'default' }}
    >
      {size.width > 0 && size.height > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
        >
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
  onSelect,
  onChange,
}: {
  box: CanvasBox;
  rect: PixelRect;
  selected: boolean;
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
        draggable
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
          anchorStroke={box.border}
          anchorSize={7}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 6 || newBox.height < 6 ? oldBox : newBox)}
        />
      )}
    </>
  );
}
