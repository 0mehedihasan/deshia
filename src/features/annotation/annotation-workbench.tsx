'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleDot,
  Eye,
  EyeOff,
  Hexagon,
  Layers,
  Loader2,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  RotateCcw,
  ScanFace,
  SkipForward,
  Square,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceTopBar } from '@/components/workspace-top-bar';
import { AppFooter } from '@/components/app-footer';
import { useAnnotationStore, type AnnotationDraft, type AutosaveStatus } from '@/stores/annotation';
import {
  colorsForView,
  defaultVisibility,
  isVisibilityAllowed,
  listClassKeys,
  listViewKeys,
  resolveComponents,
} from '@/core/annotation/engine';
import { validateAnnotation } from '@/core/annotation/validate';
import {
  insertGeometryPoint,
  nextZOrder,
  removeGeometryPoint,
  validateObjects,
} from '@/core/annotation/objects';
import { defaultAttributeValues } from '@/schemas/attributes';
import { interpolateTrackObject } from '@/core/annotation/interpolation';
import {
  deleteBrowserDraft,
  draftDiffers,
  loadBrowserDraft,
  saveBrowserDraft,
} from '@/core/recovery/browser-drafts';
import {
  listRevisionsAction,
  restoreRevisionAction,
  type RevisionEntry,
} from '@/app/actions/recovery';
import {
  importCoco,
  importCvat,
  importNativeProject,
  importVoc,
  importYolo,
  resolveLabel,
  toAnnotationObject,
} from '@/core/importer/import-annotations';
import type { AnnotationSchema } from '@/schemas/types';
import type {
  AnnotationObject as DomainAnnotationObject,
  AnnotationState,
  AttributeValue,
  ImageStatus,
  Visibility,
} from '@/types/domain';
import type { Geometry } from '@/core/geometry/types';
import { assignPaletteColors } from '@/core/annotation/palette';
import { migrateFlatToRecursive } from '@/schemas/migrate';
import type { RecursiveSchema } from '@/schemas/nodes';
import { schemaLabels } from '@/schemas/traverse';
import { saveDraftAction, skipImageAction, submitImageAction } from '@/app/actions/annotation';
import type { CanvasBox } from './annotation-canvas';
import type { CanvasObject, ObjectCanvasHandle, ObjectTool } from './object-canvas';

const ObjectCanvas = dynamic(() => import('./object-canvas').then((m) => m.ObjectCanvas), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-meta text-muted">
      Loading object canvas…
    </div>
  ),
});

const AnnotationCanvas = dynamic(
  () => import('./annotation-canvas').then((m) => m.AnnotationCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-meta text-muted">Loading canvas…</div>
    ),
  },
);

const VISIBILITIES: Visibility[] = ['VISIBLE', 'OCCLUDED', 'NOT_VISIBLE'];
const VIS_LABEL: Record<Visibility, string> = {
  VISIBLE: 'Visible',
  OCCLUDED: 'Occluded',
  NOT_VISIBLE: 'Not visible',
};

/** CVAT-style object tool rail. Index + 1 is the keyboard shortcut. */
const OBJECT_TOOLS: Array<{
  key: ObjectTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  short: string;
}> = [
  { key: 'select', icon: MousePointer2, label: 'Select', short: 'Select' },
  { key: 'box', icon: Square, label: 'Rectangle', short: 'Rect' },
  { key: 'rotated_box', icon: Box, label: 'Rotated box', short: 'Rot' },
  { key: 'ellipse', icon: Circle, label: 'Ellipse', short: 'Ellipse' },
  { key: 'polygon', icon: Hexagon, label: 'Polygon', short: 'Poly' },
  { key: 'polyline', icon: Minus, label: 'Polyline', short: 'Line' },
  { key: 'point', icon: CircleDot, label: 'Point', short: 'Point' },
  { key: 'points', icon: Layers, label: 'Points', short: 'Pts' },
  { key: 'cuboid', icon: Box, label: 'Cuboid', short: 'Cube' },
];

const GEOMETRY_SHORT: Record<string, string> = {
  box: 'rect',
  rotated_box: 'rot',
  polygon: 'poly',
  polyline: 'line',
  point: 'point',
  points: 'pts',
  ellipse: 'ellipse',
  cuboid: 'cube',
};

function shortGeometryTypes(kinds: readonly string[] | undefined): string {
  if (!kinds || kinds.length === 0) return 'any';
  const shown = kinds.slice(0, 3).map((kind) => GEOMETRY_SHORT[kind] ?? kind);
  return kinds.length > 3 ? `${shown.join('/')}+${kinds.length - 3}` : shown.join('/');
}

/**
 * Turn a thrown action error into an annotator-facing message. A dead local
 * backend makes a server action's POST reject with a WebKit/Chromium network
 * error ("Load failed" / "Failed to fetch" / "NetworkError"); surface that as an
 * actionable message rather than a raw fetch string, and reassure that the draft
 * is kept in memory so nothing is lost.
 */
function describeActionError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/load failed|failed to fetch|networkerror|network error/i.test(msg)) {
    return 'Lost connection to the local DeshiA server — your draft is kept here. Please retry; if it persists, restart the app.';
  }
  return msg || fallback;
}

export interface WorkbenchImage {
  id: string;
  datasetIndex: number;
  filename: string;
  width: number;
  height: number;
  status: ImageStatus;
  extension: string;
  detectedFormat: string | null;
  mimeType: string | null;
  colorMode: string | null;
  metadataStatus: 'PENDING' | 'ANALYZED' | 'FAILED';
  metadataError: string | null;
  mediaKind: 'IMAGE' | 'VIDEO';
  frameCount: number | null;
  fps: number | null;
  durationMs: number | null;
  fileSize: number;
  checksum: string;
  importedAt: number;
}

export function AnnotationWorkbench({
  workspaceId,
  workspaceName,
  schema,
  counts,
  image,
  initialState,
  recursiveSchema = null,
  prevImageId = null,
  nextImageId = null,
  position,
  total,
}: {
  workspaceId: string;
  workspaceName: string;
  schema: AnnotationSchema;
  counts: { total: number; annotated: number; skipped: number };
  image: WorkbenchImage | null;
  initialState: AnnotationState | null;
  /** Persisted user-authored schema; when absent the built-in one is migrated. */
  recursiveSchema?: RecursiveSchema | null;
  /** Dataset-order neighbor ids for Previous/Next paging (null at the ends). */
  prevImageId?: string | null;
  nextImageId?: string | null;
  /** 1-based position of the current image and the workspace image total. */
  position?: number;
  total?: number;
}) {
  const router = useRouter();
  const store = useAnnotationStore();
  const { draft } = store;

  const [activeComponentKey, setActiveComponentKey] = React.useState<string | null>(null);
  // Face-blur tool arm state. Mutually exclusive with box drawing (arming one
  // disarms the other) so a press has exactly one meaning. It is a sticky mode:
  // it stays on so several faces can be blurred in a row until Esc / toggle off.
  const [blurArmed, setBlurArmed] = React.useState(false);
  /** Component-box mode preserves the Rickshaw workflow; Objects mode is the
   *  generalized, many-objects-per-image CVAT-style editor. */
  const [hiddenLabels, setHiddenLabels] = React.useState<Set<string>>(new Set());
  const [lockedLabels, setLockedLabels] = React.useState<Set<string>>(new Set());
  const [serverRevision, setServerRevision] = React.useState(0);
  const [mode, setMode] = React.useState<'components' | 'objects'>('components');
  const [objectTool, setObjectTool] = React.useState<ObjectTool>('select');
  const [rectangleMethod, setRectangleMethod] = React.useState<'two-point' | 'four-point'>(
    'two-point',
  );
  const [activeLabelId, setActiveLabelId] = React.useState<string | null>(null);
  const [finishToken, setFinishToken] = React.useState(0);
  const [frameNumber, setFrameNumber] = React.useState(0);
  const [frameError, setFrameError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<null | 'submit' | 'skip'>(null);
  const [submitErrors, setSubmitErrors] = React.useState<string[]>([]);

  // Initialize the working draft for the presented image (resume or fresh).
  React.useEffect(() => {
    if (!image) {
      store.reset();
      return;
    }
    if (initialState) {
      store.loadFromState(initialState);
    } else {
      store.loadDraft({
        imageId: image.id,
        schemaId: schema.id,
        schemaVersion: schema.version,
        classKey: null,
        viewKey: null,
        componentVisibility: {},
        boxes: [],
        objects: [],
        redactions: [],
      });
    }
    setActiveComponentKey(null);
    setBlurArmed(false);
    setFrameNumber(0);
    setFrameError(null);
    setServerRevision(initialState?.saveRevision ?? 0);
    setConflictState(null);
    setSubmitErrors([]);
    // Only re-init when the target image changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.id]);

  // Crash recovery: a browser-local draft that differs from the persisted
  // state is offered explicitly — never applied silently.
  React.useEffect(() => {
    if (!image) return;
    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadBrowserDraft(image.id, 0);
        if (!stored || cancelled) return;
        const persisted: AnnotationDraft | null = initialState
          ? {
              imageId: initialState.imageId,
              schemaId: initialState.schemaId,
              schemaVersion: initialState.schemaVersion,
              classKey: initialState.classKey,
              viewKey: initialState.viewKey,
              componentVisibility: initialState.componentVisibility,
              boxes: initialState.boxes,
              objects: initialState.objects,
              redactions: initialState.redactions,
            }
          : null;
        if (draftDiffers(stored.draft, persisted)) setRecovery(stored);
      } catch {
        // IndexedDB is optional; absence never blocks annotation.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.id]);

  React.useEffect(() => {
    if (!image || mode !== 'objects') return;
    void listRevisionsAction(image.id).then((res) => {
      if (res.ok) setRevisions(res.entries);
    });
  }, [image, mode]);

  const classKeys = listClassKeys(schema);
  const classKey = draft?.classKey ?? null;
  const viewKey = draft?.viewKey ?? null;
  const viewKeys = classKey ? listViewKeys(schema, classKey) : [];
  const components = classKey && viewKey ? resolveComponents(schema, classKey, viewKey) : [];
  const colors = React.useMemo(
    () => (classKey && viewKey ? colorsForView(schema, classKey, viewKey) : new Map()),
    [schema, classKey, viewKey],
  );

  const canvasBoxes: CanvasBox[] = (draft?.boxes ?? []).map((b) => {
    const color = colors.get(b.componentKey);
    const comp = components.find((c) => c.key === b.componentKey);
    return {
      id: b.id,
      componentKey: b.componentKey,
      label: comp?.label ?? b.componentKey,
      box: b.box,
      border: color?.border ?? '#4DA3FF',
      fill: color?.fill ?? 'rgba(77,163,255,0.1)',
      labelBg: color?.labelBg ?? 'rgba(5,8,12,0.9)',
      labelText: color?.labelText ?? '#4DA3FF',
    };
  });

  // Generalized object layer: the flat built-in schema is migrated into the
  // recursive schema model, which is the canonical label source for objects.
  const activeRecursiveSchema = React.useMemo(
    () => recursiveSchema ?? migrateFlatToRecursive(schema),
    [recursiveSchema, schema],
  );
  const labels = React.useMemo(() => schemaLabels(activeRecursiveSchema), [activeRecursiveSchema]);
  const labelColors = React.useMemo(() => assignPaletteColors(labels.map((l) => l.id)), [labels]);
  // Video frames: the persisted objects at the current frame are keyframes.
  // Objects belonging to a track are interpolated on read for frames without a
  // keyframe; a real keyframe always wins over an interpolated one.
  const isVideo = image?.mediaKind === 'VIDEO';
  const handleFrameError = React.useCallback(
    () =>
      setFrameError(
        isVideo
          ? 'Video frame unavailable. Install ffmpeg on this device to annotate frames.'
          : 'Source image could not be loaded.',
      ),
    [isVideo],
  );
  const frameObjects = (draft?.objects ?? []).filter(
    (o) => !isVideo || o.frameNumber === frameNumber,
  );
  const interpolatedObjects = React.useMemo(() => {
    if (!isVideo || !image) return [];
    const all = draft?.objects ?? [];
    const trackIds = [...new Set(all.map((o) => o.trackId).filter((t): t is string => !!t))];
    const size = { width: image.width, height: image.height };
    const out: DomainAnnotationObject[] = [];
    for (const trackId of trackIds) {
      if (all.some((o) => o.trackId === trackId && o.frameNumber === frameNumber)) continue;
      const obj = interpolateTrackObject(
        all.filter((o) => o.trackId === trackId),
        frameNumber,
        size,
      );
      if (obj) out.push(obj);
    }
    return out;
  }, [draft?.objects, frameNumber, image, isVideo]);
  const tracks = React.useMemo(() => {
    const map = new Map<string, { id: string; count: number; labelName: string }>();
    for (const o of draft?.objects ?? []) {
      if (!o.trackId) continue;
      const existing = map.get(o.trackId);
      if (existing) existing.count += 1;
      else map.set(o.trackId, { id: o.trackId, count: 1, labelName: o.labelName });
    }
    return [...map.values()];
  }, [draft?.objects]);

  const keyframeFrames = React.useMemo(
    () => [...new Set((draft?.objects ?? []).map((o) => o.frameNumber))].sort((a, b) => a - b),
    [draft?.objects],
  );
  const displayObjects = [...frameObjects, ...interpolatedObjects];
  const canvasObjects: CanvasObject[] = displayObjects
    .filter((o) => !hiddenLabels.has(o.labelId))
    .map((o) => {
      const c = labelColors.get(o.labelId);
      return {
        ...o,
        locked: o.locked || lockedLabels.has(o.labelId),
        color: c?.border ?? '#4DA3FF',
      };
    });

  const objectValidation = React.useMemo(
    () => validateObjects(draft?.objects ?? [], new Map(labels.map((l) => [l.id, l]))),
    [draft?.objects, labels],
  );

  // Live validation against the schema (drives Submit enablement).
  const validation = React.useMemo(() => {
    if (!draft || !image) return null;
    const state: AnnotationState = {
      imageId: draft.imageId,
      schemaId: draft.schemaId,
      schemaVersion: draft.schemaVersion,
      classKey: draft.classKey,
      viewKey: draft.viewKey,
      componentVisibility: draft.componentVisibility,
      boxes: draft.boxes,
      objects: draft.objects,
      redactions: draft.redactions,
      status: 'DRAFT',
      annotationVersion: 1,
      saveRevision: serverRevision,
      createdAt: 0,
      updatedAt: 0,
    };
    return validateAnnotation(schema, state);
  }, [draft, image, schema, serverRevision]);

  // ---- handlers ----
  const selectClass = (key: string) => {
    store.setClass(key);
    setActiveComponentKey(null);
    setBlurArmed(false);
  };

  const selectView = (key: string) => {
    store.setView(key);
    setActiveComponentKey(null);
    setBlurArmed(false);
    // Seed default visibility for each component of the new view.
    for (const c of resolveComponents(schema, classKey!, key)) {
      store.setVisibility(c.key, defaultVisibility(c));
    }
  };

  const buildPayload = () => ({
    imageId: draft!.imageId,
    workspaceId,
    classKey: draft!.classKey,
    viewKey: draft!.viewKey,
    componentVisibility: draft!.componentVisibility,
    boxes: draft!.boxes.map((b) => ({
      componentKey: b.componentKey,
      box: b.box,
      visibility: b.visibility,
      vehicleInstanceId: b.vehicleInstanceId ?? null,
    })),
    objects: draft!.objects,
    expectedRevision: serverRevision,
    redactions: draft!.redactions,
  });

  // Debounced autosave whenever the draft is dirty.
  React.useEffect(() => {
    if (!draft || !image) return;
    if (store.autosave !== 'dirty') return;
    const handle = setTimeout(async () => {
      store.markSaving();
      try {
        const res = await saveDraftAction(buildPayload());
        if (res.ok) {
          store.markSaved(res.savedAt);
          setServerRevision(res.revision);
          void saveBrowserDraft(draft, isVideo ? frameNumber : 0).catch(() => undefined);
        } else if (res.conflict && res.state) {
          setConflictState(res.state);
          store.markError(res.error);
        } else store.markError(res.error);
      } catch (err) {
        // A rejected server action must never leave the UI stuck on "Saving…".
        store.markError(describeActionError(err, 'Autosave failed unexpectedly.'));
      }
    }, 800);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.autosave, draft]);

  const saveNow = async () => {
    if (!draft) return;
    store.markSaving();
    try {
      const res = await saveDraftAction(buildPayload());
      if (res.ok) {
        store.markSaved(res.savedAt);
        setServerRevision(res.revision);
        void saveBrowserDraft(draft, isVideo ? frameNumber : 0).catch(() => undefined);
      } else if (res.conflict && res.state) {
        setConflictState(res.state);
        store.markError(res.error);
      } else store.markError(res.error);
    } catch (err) {
      store.markError(describeActionError(err, 'Save failed unexpectedly.'));
    }
  };

  const goToNext = (nextImageId: string | null) => {
    if (nextImageId) router.push(`/workspace/${workspaceId}/annotate?image=${nextImageId}`);
    else router.push(`/workspace/${workspaceId}`);
  };

  // Free dataset-order paging (does not submit/skip). The debounced autosave
  // keeps the current draft; navigating away never discards it.
  const goToImage = (id: string) => router.push(`/workspace/${workspaceId}/annotate?image=${id}`);

  const submit = async () => {
    if (!draft) return;
    setBusy('submit');
    setSubmitErrors([]);
    try {
      const res = await submitImageAction(buildPayload());
      if (res.ok) goToNext(res.nextImageId);
      else setSubmitErrors(res.errors);
    } catch (err) {
      setSubmitErrors([describeActionError(err, 'Submit failed unexpectedly.')]);
    } finally {
      setBusy(null);
    }
  };

  const skip = async () => {
    if (!image) return;
    setBusy('skip');
    try {
      const res = await skipImageAction(workspaceId, image.id);
      if (res.ok) goToNext(res.nextImageId);
      else setSubmitErrors([res.error ?? 'Could not skip image.']);
    } catch (err) {
      setSubmitErrors([describeActionError(err, 'Skip failed unexpectedly.')]);
    } finally {
      setBusy(null);
    }
  };

  // ---- generalized object handlers ----
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [clipboardReady, setClipboardReady] = React.useState(false);
  const [revisions, setRevisions] = React.useState<RevisionEntry[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [objectFilter, setObjectFilter] = React.useState('');
  const [conflictState, setConflictState] = React.useState<AnnotationState | null>(null);
  const objectCanvasRef = React.useRef<ObjectCanvasHandle>(null);
  const [adjustments, setAdjustments] = React.useState({ brightness: 0, contrast: 0, gamma: 0 });
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [recovery, setRecovery] = React.useState<{
    draft: AnnotationDraft;
    savedAt: number;
  } | null>(null);

  const importFile = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const size = { width: image?.width ?? 0, height: image?.height ?? 0 };
      const name = file.name.toLowerCase();
      if (name.endsWith('.json')) {
        const native = importNativeProject(text);
        if (native.length > 0) {
          const known = native.filter((o) => labels.some((l) => l.id === o.labelId));
          store.addObjects(known);
          if (known.length < native.length) {
            setImportError(`${native.length - known.length} object(s) skipped: unknown label ids.`);
          }
          return;
        }
      }
      let entries;
      if (name.endsWith('.txt'))
        entries = importYolo(
          text,
          labels.map((l) => l.id),
        );
      else if (name.endsWith('.xml'))
        entries = /<annotation\b/i.test(text) ? importCvat(text, size) : importVoc(text, size);
      else entries = importCoco(text, size);
      const mapped: DomainAnnotationObject[] = [];
      entries.forEach((entry, i) => {
        const labelId = resolveLabel(entry.labelRef, labels);
        if (!labelId) return;
        const label = labels.find((l) => l.id === labelId);
        mapped.push(
          toAnnotationObject(
            entry,
            labelId,
            label?.name ?? labelId,
            `imported_${Date.now().toString(36)}_${i}`,
            nextZOrder(draft?.objects ?? []) + i,
          ),
        );
      });
      if (mapped.length === 0) {
        setImportError('No objects found, or no label refs matched this schema.');
        return;
      }
      store.addObjects(mapped);
    } catch (err) {
      setImportError(describeActionError(err, 'Could not import annotations.'));
    }
  };

  const addObject = (geometry: Geometry) => {
    if (!activeLabelId) return;
    const label = labels.find((l) => l.id === activeLabelId);
    store.addObject(
      activeLabelId,
      label?.name ?? activeLabelId,
      geometry,
      nextZOrder(draft?.objects ?? []),
      isVideo ? frameNumber : 0,
      defaultAttributeValues(label?.attributes ?? []),
    );
  };

  const chooseLabel = (id: string) => {
    setActiveLabelId((current) => (current === id ? null : id));
    setMode('objects');
    store.selectBox(null);
  };

  const chooseTool = (next: ObjectTool) => {
    setObjectTool((current) => (current === next ? 'select' : next));
    setFinishToken(0);
    store.selectObject(null);
  };

  const armDraw = (componentKey: string) => {
    setActiveComponentKey((k) => (k === componentKey ? null : componentKey));
    setBlurArmed(false);
    store.selectBox(null);
  };

  // Toggle the face-blur tool. Arming it disarms box drawing and drops the box
  // selection so the next press means "start a blur circle" unambiguously.
  const armBlur = () => {
    setBlurArmed((on) => {
      const next = !on;
      if (next) {
        setActiveComponentKey(null);
        store.selectBox(null);
      }
      return next;
    });
  };

  const boxCountFor = (key: string) =>
    (draft?.boxes ?? []).filter((b) => b.componentKey === key).length;

  const resetDraft = () => {
    if (!image) return;
    if (initialState) store.loadFromState(initialState);
    else
      store.loadDraft({
        imageId: image.id,
        schemaId: schema.id,
        schemaVersion: schema.version,
        classKey: null,
        viewKey: null,
        componentVisibility: {},
        boxes: [],
        objects: [],
        redactions: [],
      });
    setActiveComponentKey(null);
    setBlurArmed(false);
    setSubmitErrors([]);
  };

  const activeColor = activeComponentKey ? (colors.get(activeComponentKey)?.border ?? null) : null;
  const canSubmit =
    mode === 'components'
      ? !!validation?.ok && !busy
      : objectValidation.length === 0 && (draft?.objects.length ?? 0) > 0 && !busy;
  const selectedBox = draft?.boxes.find((b) => b.id === store.selectedBoxId) ?? null;
  const selectedRedaction =
    draft?.redactions.find((c) => c.id === store.selectedRedactionId) ?? null;

  // Canvas keyboard shortcuts. Escape cancels an armed draw, then clears the
  // selection; Delete/Backspace removes the selected box. Guarded so typing in a
  // form control (class/view selects, inputs) never deletes a box, and disabled
  // while a submit/skip is in flight. State is read via getState() so the handler
  // always sees the latest selection without re-subscribing on every change.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable);
      const s = useAnnotationStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mode === 'objects' && (e.metaKey || e.ctrlKey) && !typing) {
        const key = e.key.toLowerCase();
        if (key === 'a') {
          e.preventDefault();
          s.selectObjects((draft?.objects ?? []).map((o) => o.id));
          return;
        }
        if (key === 'c') {
          setClipboardReady(true);
          return;
        }
        if (key === 'v' && clipboardReady) {
          e.preventDefault();
          s.duplicateSelected();
          return;
        }
      }
      if (e.key === '?' && !typing) {
        e.preventDefault();
        router.push('/manual');
        return;
      }
      if (mode === 'objects' && !typing && /^[1-9]$/.test(e.key)) {
        if (e.altKey) {
          const label = labels[Number(e.key) - 1];
          if (label) {
            setActiveLabelId(label.id);
            setObjectTool('box');
          }
          return;
        }
        const tool = OBJECT_TOOLS[Number(e.key) - 1]?.key;
        if (tool) chooseTool(tool);
        return;
      }
      if (e.key === 'Escape') {
        // Peel state back one layer at a time: disarm the active tool first,
        // then clear whichever object is selected (box takes priority).
        if (mode === 'objects') {
          s.selectObject(null);
          setObjectTool('select');
        } else if (activeComponentKey) setActiveComponentKey(null);
        else if (blurArmed) setBlurArmed(false);
        else if (s.selectedBoxId) s.selectBox(null);
        else if (s.selectedRedactionId) s.selectRedaction(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && !busy) {
        // Always suppress the default first: outside an input a bare Backspace
        // triggers browser "back" navigation in dev/browser mode, which would
        // blow away the annotation screen. Delete has no default, so this is a
        // no-op for it. Then remove the selected box, or else the selected
        // face-blur circle when no box is selected.
        e.preventDefault();
        if (mode === 'objects' && s.selectedObjectId) s.removeObject(s.selectedObjectId);
        else if (s.selectedBoxId) s.removeBox(s.selectedBoxId);
        else if (s.selectedRedactionId) s.removeRedaction(s.selectedRedactionId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeComponentKey, blurArmed, busy, mode]);

  // ---- empty state ----
  if (!image) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-bg">
        <WorkspaceTopBar workspaceId={workspaceId} name={workspaceName} active="annotate" />
        <div className="grid flex-1 place-items-center px-6">
          <div className="max-w-md text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
            <h2 className="text-section font-semibold text-text">Nothing left to annotate</h2>
            <p className="mt-2 text-body text-text-secondary">
              Every image in this workspace has been annotated or skipped. Import more images or
              review the dashboard.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => router.push(`/workspace/${workspaceId}`)}
            >
              Back to dashboard
            </Button>
          </div>
        </div>
        <AppFooter compact />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <Dialog open={!!recovery} onOpenChange={(open) => !open && setRecovery(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recover unsaved work?</DialogTitle>
            <DialogDescription>
              A local draft from {recovery ? new Date(recovery.savedAt).toLocaleString() : ''}{' '}
              differs from the saved annotation. Restoring replaces the current working copy;
              discarding deletes the local copy. Nothing changes on disk until you save or submit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                void deleteBrowserDraft(image?.id ?? '', 0).catch(() => undefined);
                setRecovery(null);
              }}
            >
              Discard local copy
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (recovery) store.loadDraft(recovery.draft);
                setRecovery(null);
              }}
            >
              Restore draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!conflictState} onOpenChange={(open) => !open && setConflictState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save conflict</DialogTitle>
            <DialogDescription>
              Another writer saved this annotation after your last save. Use the server version, or
              overwrite it with the version currently in this window.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                if (conflictState) {
                  store.loadFromState(conflictState);
                  setServerRevision(conflictState.saveRevision);
                }
                setConflictState(null);
              }}
            >
              Use saved version
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (conflictState) setServerRevision(conflictState.saveRevision);
                setConflictState(null);
                store.markDraftDirty();
              }}
            >
              Keep my version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear every object?</DialogTitle>
            <DialogDescription>
              All {draft?.objects.length ?? 0} objects in this frame will be removed. This is a
              single undoable step; press Ctrl/Cmd+Z to bring them back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                store.clearObjects();
                setConfirmClear(false);
              }}
            >
              Clear objects
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WorkspaceTopBar workspaceId={workspaceId} name={workspaceName} active="annotate" />
      {/* Image identity strip */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-2">
        <div className="flex items-center gap-3 text-meta-lg">
          <span className="font-mono text-muted">
            #{String(image.datasetIndex).padStart(3, '0')}
          </span>
          <span className="font-mono text-text-secondary">{image.filename}</span>
          <span className="font-mono text-muted">
            {image.width}×{image.height}
          </span>
          <StatusBadge status={image.status} />
          <span className="text-meta text-muted">
            {counts.annotated + counts.skipped}/{counts.total} done
          </span>
        </div>
        <AutosaveIndicator status={store.autosave} lastSavedAt={store.lastSavedAt} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(240px,20%)_minmax(0,1fr)_minmax(260px,20%)]">
        {/* LEFT — class/view + components */}
        <aside className="flex flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-4">
          {/* Editor mode: the built-in component workflow and the generalized
              object workflow share the same image and persistence layer. */}
          <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-elevated p-1">
            <button
              type="button"
              onClick={() => {
                setMode('components');
                store.selectObject(null);
              }}
              className={`rounded px-2 py-1 text-meta font-medium transition-colors ${
                mode === 'components' ? 'bg-primary/15 text-primary' : 'text-muted hover:text-text'
              }`}
            >
              Components
            </button>
            <button
              type="button"
              onClick={() => setMode('objects')}
              className={`rounded px-2 py-1 text-meta font-medium transition-colors ${
                mode === 'objects' ? 'bg-primary/15 text-primary' : 'text-muted hover:text-text'
              }`}
            >
              Objects
            </button>
          </div>

          <div className={mode === 'objects' ? 'space-y-3' : 'hidden'}>
            <div className="space-y-3">
              <div>
                <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
                  Labels
                </h3>
                {activeLabelId === null && (
                  <p className="mb-2 text-meta text-warning">Choose a label before drawing.</p>
                )}
                <ul className="space-y-1.5">
                  {labels.map((label, labelIndex) => {
                    const color = labelColors.get(label.id)?.border ?? '#4DA3FF';
                    const active = activeLabelId === label.id;
                    const count = (draft?.objects ?? []).filter(
                      (o) => o.labelId === label.id,
                    ).length;
                    return (
                      <li key={label.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => chooseLabel(label.id)}
                          className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                            active
                              ? 'bg-primary/5 border-primary'
                              : 'border-border bg-elevated hover:border-border-strong'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-3 w-3 flex-none rounded-sm"
                              style={{ backgroundColor: color }}
                            />
                            <span className="truncate text-meta-lg text-text">{label.name}</span>
                          </span>
                          <span className="flex flex-none items-center gap-2">
                            {labelIndex < 9 && (
                              <span className="font-mono text-meta text-primary">
                                Alt{labelIndex + 1}
                              </span>
                            )}
                            {count > 0 && (
                              <Badge tone="neutral" mono>
                                {count}
                              </Badge>
                            )}
                            <span className="font-mono text-meta text-muted">
                              {shortGeometryTypes(label.geometryTypes)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          title={hiddenLabels.has(label.id) ? 'Show label' : 'Hide label'}
                          onClick={() =>
                            setHiddenLabels((current) => {
                              const next = new Set(current);
                              if (next.has(label.id)) next.delete(label.id);
                              else next.add(label.id);
                              return next;
                            })
                          }
                          className="rounded p-1 text-muted hover:text-text"
                        >
                          {hiddenLabels.has(label.id) ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          title={lockedLabels.has(label.id) ? 'Unlock label' : 'Lock label'}
                          onClick={() =>
                            setLockedLabels((current) => {
                              const next = new Set(current);
                              if (next.has(label.id)) next.delete(label.id);
                              else next.add(label.id);
                              return next;
                            })
                          }
                          className="rounded p-1 text-muted hover:text-text"
                        >
                          {lockedLabels.has(label.id) ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <LockOpen className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-elevated p-2.5 text-meta text-muted">
                Tools in the canvas rail: <span className="font-mono text-text">1</span> Select ·{' '}
                <span className="font-mono text-text">2</span> Rect ·{' '}
                <span className="font-mono text-text">3</span> Rotated ·{' '}
                <span className="font-mono text-text">4</span> Ellipse ·{' '}
                <span className="font-mono text-text">5</span> Polygon ·{' '}
                <span className="font-mono text-text">6</span> Polyline ·{' '}
                <span className="font-mono text-text">7</span> Point ·{' '}
                <span className="font-mono text-text">8</span> Points ·{' '}
                <span className="font-mono text-text">9</span> Cuboid. Drag for area shapes; click
                to place path vertices, then double-click or press Finish. Drag vertices to refine.
              </div>
            </div>
          </div>
          <div className={mode === 'objects' ? 'hidden' : 'space-y-3'}>
            <div>
              <label className="mb-1 block text-meta font-medium uppercase tracking-wide text-muted">
                Class
              </label>
              <select
                className="w-full rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text outline-none focus:border-primary"
                value={classKey ?? ''}
                onChange={(e) => selectClass(e.target.value)}
              >
                <option value="" disabled>
                  Select class…
                </option>
                {classKeys.map((k) => (
                  <option key={k} value={k}>
                    {schema.classes.find((c) => c.key === k)?.label ?? k}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-meta font-medium uppercase tracking-wide text-muted">
                View
              </label>
              <select
                className="w-full rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text outline-none focus:border-primary disabled:opacity-50"
                value={viewKey ?? ''}
                disabled={!classKey}
                onChange={(e) => selectView(e.target.value)}
              >
                <option value="" disabled>
                  {classKey ? 'Select view…' : 'Select a class first'}
                </option>
                {viewKeys.map((k) => (
                  <option key={k} value={k}>
                    {(classKey &&
                      schema.classes.find((c) => c.key === classKey)?.views.find((v) => v.key === k)
                        ?.label) ??
                      k}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Face mosaic (privacy) — independent of the class/view ontology, so it
              lives in its own card and its circles survive class/view changes. */}
          <div className="rounded-lg border border-border bg-elevated p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 flex-none rounded-full bg-warning" />
                <span className="truncate text-meta-lg font-medium text-text">Face mosaic</span>
              </div>
              {(draft?.redactions.length ?? 0) > 0 && (
                <Badge tone="neutral" mono>
                  {draft?.redactions.length}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-meta text-muted">
              Pixelate human faces for privacy — a hard mosaic that cannot be reversed. Baked into
              every exported copy; your source images are never modified.
            </p>
            <Button
              size="sm"
              variant={blurArmed ? 'primary' : 'secondary'}
              className="mt-2 w-full"
              onClick={armBlur}
            >
              <ScanFace className="h-3.5 w-3.5" />
              {blurArmed ? 'Placing mosaic… (click to stop)' : 'Mosaic a face'}
            </Button>
          </div>

          <details className="rounded-lg border border-border bg-elevated p-2.5">
            <summary className="cursor-pointer text-meta-lg font-medium text-text">
              Image Metadata · original file
            </summary>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-meta">
              <dt className="text-muted">Filename</dt>
              <dd className="break-all font-mono text-text-secondary">{image.filename}</dd>
              <dt className="text-muted">Format</dt>
              <dd className="font-mono text-text-secondary">
                {image.detectedFormat?.toUpperCase() ?? image.extension.toUpperCase()} ·{' '}
                {image.mimeType ?? 'MIME unavailable'}
              </dd>
              <dt className="text-muted">Resolution</dt>
              <dd className="font-mono text-text-secondary">
                {image.width} × {image.height} px
              </dd>
              <dt className="text-muted">Aspect ratio</dt>
              <dd className="font-mono text-text-secondary">
                {(() => {
                  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
                  const divisor = gcd(image.width, image.height);
                  return image.width > 0 && image.height > 0
                    ? `${image.width / divisor}:${image.height / divisor}`
                    : 'Unavailable';
                })()}
              </dd>
              <dt className="text-muted">Pixel count</dt>
              <dd className="font-mono text-text-secondary">
                {(image.width * image.height).toLocaleString()}
              </dd>
              <dt className="text-muted">File size</dt>
              <dd className="font-mono text-text-secondary">
                {new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
                  image.fileSize / (1024 * 1024),
                )}{' '}
                MB
              </dd>
              <dt className="text-muted">Imported</dt>
              <dd className="font-mono text-text-secondary">
                {new Date(image.importedAt).toLocaleString()}
              </dd>
              <dt className="text-muted">Color / channels</dt>
              <dd className="font-mono text-text-secondary">{image.colorMode ?? 'Unavailable'}</dd>
              <dt className="text-muted">SHA-256</dt>
              <dd className="break-all font-mono text-text-secondary">
                {/^[a-f0-9]{64}$/i.test(image.checksum) ? image.checksum : 'Unavailable'}
              </dd>
              <dt className="text-muted">Analysis</dt>
              <dd
                className={
                  image.metadataStatus === 'ANALYZED'
                    ? 'text-success'
                    : image.metadataStatus === 'FAILED'
                      ? 'text-error'
                      : 'text-warning'
                }
              >
                {image.metadataStatus}
                {image.metadataError ? ` · ${image.metadataError}` : ''}
              </dd>
            </dl>
          </details>

          <div className="flex-1">
            <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
              Components
            </h3>
            {components.length === 0 ? (
              <p className="text-meta-lg text-muted">Select a class and view to list components.</p>
            ) : (
              <ul className="space-y-2">
                {components.map((c) => {
                  const color = colors.get(c.key);
                  const visibility = draft?.componentVisibility[c.key] ?? defaultVisibility(c);
                  const armed = activeComponentKey === c.key;
                  const count = boxCountFor(c.key);
                  return (
                    <li
                      key={c.key}
                      className="rounded-lg border border-border bg-elevated p-2.5"
                      style={armed ? { borderColor: color?.border } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-3 w-3 flex-none rounded-sm"
                            style={{ backgroundColor: color?.border ?? '#4DA3FF' }}
                          />
                          <span className="truncate text-meta-lg font-medium text-text">
                            {c.label}
                          </span>
                        </div>
                        <div className="flex flex-none items-center gap-1.5">
                          {count > 0 && (
                            <Badge tone="neutral" mono>
                              {count}
                            </Badge>
                          )}
                          <Badge
                            tone={
                              c.box === 'required'
                                ? 'primary'
                                : c.box === 'optional'
                                  ? 'muted'
                                  : 'neutral'
                            }
                            mono
                          >
                            {c.box}
                          </Badge>
                        </div>
                      </div>
                      {c.hint && <p className="mt-1 text-meta text-muted">{c.hint}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {VISIBILITIES.filter((v) => isVisibilityAllowed(c, v)).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => store.setVisibility(c.key, v)}
                            className={
                              'rounded border px-2 py-0.5 text-meta transition-colors ' +
                              (visibility === v
                                ? 'bg-primary/10 border-primary text-primary'
                                : 'border-border text-text-secondary hover:border-border-strong')
                            }
                          >
                            {VIS_LABEL[v]}
                          </button>
                        ))}
                      </div>
                      {c.box !== 'none' && (
                        <Button
                          size="sm"
                          variant={armed ? 'primary' : 'secondary'}
                          className="mt-2 w-full"
                          onClick={() => armDraw(c.key)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {armed ? 'Drawing… (click to cancel)' : 'Draw box'}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* CENTER — canvas */}
        <section className="relative min-h-0 bg-bg">
          {mode === 'objects' ? (
            <>
              <ObjectCanvas
                ref={objectCanvasRef}
                adjustments={adjustments}
                imageUrl={
                  isVideo
                    ? `/api/media/${image.id}/frame?n=${frameNumber}`
                    : `/api/image/${image.id}`
                }
                naturalWidth={image.width}
                naturalHeight={image.height}
                objects={canvasObjects}
                selectedId={store.selectedObjectId}
                selectedIds={store.selectedObjectIds}
                tool={objectTool}
                rectangleMethod={rectangleMethod}
                activeLabelId={activeLabelId}
                finishToken={finishToken}
                onAddObject={addObject}
                onUpdateGeometry={(id, geometry) => {
                  const source = interpolatedObjects.find((o) => o.id === id);
                  if (source) {
                    // Editing an interpolated frame promotes it to a real keyframe.
                    store.addObjects([
                      { ...source, id: `kf_${Date.now().toString(36)}`, geometry, frameNumber },
                    ]);
                    return;
                  }
                  store.updateObjectGeometry(id, geometry);
                }}
                onUpdateVertex={(id, index, point) => {
                  const current = [...(draft?.objects ?? []), ...interpolatedObjects].find(
                    (o) => o.id === id,
                  );
                  if (!current) return;
                  const g = current.geometry;
                  if (
                    g.kind === 'polygon' ||
                    g.kind === 'polyline' ||
                    g.kind === 'points' ||
                    g.kind === 'cuboid'
                  ) {
                    const next = {
                      ...g,
                      points: g.points.map((p, i) => (i === index ? point : p)),
                    };
                    if (id.startsWith('interpolated_')) {
                      store.addObjects([
                        {
                          ...current,
                          id: `kf_${Date.now().toString(36)}`,
                          geometry: next,
                          frameNumber,
                        },
                      ]);
                    } else {
                      store.updateObjectGeometry(id, next);
                    }
                  }
                }}
                onSelect={(id) => store.selectObject(id)}
                onSelectObjects={(ids) => store.selectObjects(ids)}
                onInsertVertex={(id, index, point) => {
                  const current = [...(draft?.objects ?? []), ...interpolatedObjects].find(
                    (o) => o.id === id,
                  );
                  if (!current) return;
                  const next = insertGeometryPoint(current.geometry, index, point);
                  if (id.startsWith('interpolated_')) {
                    store.addObjects([
                      {
                        ...current,
                        id: `kf_${Date.now().toString(36)}`,
                        geometry: next,
                        frameNumber,
                      },
                    ]);
                  } else store.updateObjectGeometry(id, next);
                }}
                onDeleteVertex={(id, index) => {
                  const current = (draft?.objects ?? []).find((o) => o.id === id);
                  if (!current) return;
                  const next = removeGeometryPoint(current.geometry, index);
                  if (next !== current.geometry) store.updateObjectGeometry(id, next);
                }}
                onRenameObject={(id, name) => store.updateObject(id, { labelName: name })}
                onImageError={handleFrameError}
              />
              <div className="bg-elevated/95 absolute left-2 top-2 flex flex-col gap-1 rounded-md border border-border-strong p-1 shadow">
                {OBJECT_TOOLS.map(({ key, icon: Icon, label, short }, i) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => chooseTool(key)}
                    title={`${label} — press ${i + 1}`}
                    aria-label={label}
                    className={`flex w-14 flex-col items-center gap-0.5 rounded px-1 py-1.5 transition-colors ${
                      objectTool === key
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted hover:bg-elevated hover:text-text'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-mono text-[9px] leading-none">{short}</span>
                  </button>
                ))}
              </div>
              {objectTool === 'box' && (
                <button
                  type="button"
                  onClick={() =>
                    setRectangleMethod((m) => (m === 'two-point' ? 'four-point' : 'two-point'))
                  }
                  title="Toggle 2-point drag / 4-point rectangle"
                  className={`bg-elevated/95 absolute left-14 top-2 rounded-md border px-2 py-1 text-meta shadow ${
                    rectangleMethod === 'four-point'
                      ? 'border-primary text-primary'
                      : 'border-border-strong text-text-secondary'
                  }`}
                >
                  {rectangleMethod === 'four-point' ? '4 pt' : '2 pt'}
                </button>
              )}
              <div className="bg-elevated/95 absolute right-2 top-12 flex flex-col gap-1 rounded-md border border-border-strong p-1 shadow">
                <button
                  type="button"
                  title="Zoom in"
                  onClick={() => objectCanvasRef.current?.zoomIn()}
                  className="rounded px-2 py-1 text-meta text-text-secondary hover:text-text"
                >
                  +
                </button>
                <button
                  type="button"
                  title="Zoom out"
                  onClick={() => objectCanvasRef.current?.zoomOut()}
                  className="rounded px-2 py-1 text-meta text-text-secondary hover:text-text"
                >
                  −
                </button>
                <button
                  type="button"
                  title="Fit to screen"
                  onClick={() => objectCanvasRef.current?.fit()}
                  className="rounded px-2 py-1 text-meta text-text-secondary hover:text-text"
                >
                  Fit
                </button>
                <button
                  type="button"
                  title="Display adjustments"
                  onClick={() => setAdjustOpen((v) => !v)}
                  className="rounded px-2 py-1 text-meta text-text-secondary hover:text-text"
                >
                  Adj
                </button>
              </div>
              {adjustOpen && (
                <div className="bg-elevated/95 absolute right-12 top-12 w-48 space-y-2 rounded-md border border-border-strong p-2 text-meta shadow">
                  {(
                    [
                      ['brightness', 'Brightness', -0.5, 0.5],
                      ['contrast', 'Contrast', -0.5, 0.5],
                      ['gamma', 'Gamma', -0.5, 0.5],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <label key={key} className="block text-text-secondary">
                      {label}
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={0.01}
                        value={adjustments[key]}
                        onChange={(e) =>
                          setAdjustments((a) => ({ ...a, [key]: Number(e.target.value) }))
                        }
                        className="mt-1 w-full accent-primary"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAdjustments({ brightness: 0, contrast: 0, gamma: 0 })}
                    className="text-meta text-primary"
                  >
                    Reset
                  </button>
                  <p className="text-meta text-muted">Display only — exports are untouched.</p>
                </div>
              )}
              {(objectTool === 'polygon' ||
                objectTool === 'polyline' ||
                objectTool === 'points') && (
                <button
                  type="button"
                  onClick={() => setFinishToken((t) => t + 1)}
                  className="bg-elevated/95 absolute right-2 top-2 rounded-md border border-primary px-3 py-1 text-meta font-medium text-primary shadow"
                >
                  Finish shape
                </button>
              )}
              {isVideo && (
                <div className="bg-elevated/95 absolute bottom-10 left-1/2 w-[min(90%,640px)] -translate-x-1/2 rounded-md border border-border-strong px-3 py-2 shadow">
                  <div className="relative mb-1 h-3">
                    {keyframeFrames.map((frame) => {
                      const max = Math.max(1, (image.frameCount ?? 1) - 1);
                      return (
                        <button
                          key={frame}
                          type="button"
                          onClick={() => setFrameNumber(frame)}
                          title={`Keyframe ${frame}`}
                          className={`absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full ${
                            frame === frameNumber ? 'bg-primary' : 'bg-warning'
                          }`}
                          style={{ left: `${(frame / max) * 100}%` }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFrameNumber((f) => Math.max(0, f - 1));
                        setFrameError(null);
                      }}
                      aria-label="Previous frame"
                      className="rounded p-1 text-muted hover:text-text"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, (image.frameCount ?? 1) - 1)}
                      value={frameNumber}
                      onChange={(e) => {
                        setFrameNumber(Number(e.target.value));
                        setFrameError(null);
                      }}
                      className="min-w-0 flex-1 accent-primary"
                      aria-label="Video frame"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFrameNumber((f) => Math.min((image.frameCount ?? 1) - 1, f + 1));
                        setFrameError(null);
                      }}
                      aria-label="Next frame"
                      className="rounded p-1 text-muted hover:text-text"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <span className="min-w-[5rem] text-center font-mono text-meta tabular-nums text-text-secondary">
                      {frameNumber}/{Math.max(0, (image.frameCount ?? 1) - 1)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const source = (draft?.objects ?? []).find(
                          (o) => o.id === store.selectedObjectId,
                        );
                        const interpolated = interpolatedObjects.find(
                          (o) => o.id === store.selectedObjectId,
                        );
                        const base = source ?? interpolated;
                        if (!base) return;
                        store.addObjects([
                          {
                            ...base,
                            id: `kf_${Date.now().toString(36)}`,
                            frameNumber,
                            trackId: base.trackId ?? `track_${Date.now().toString(36)}`,
                          },
                        ]);
                      }}
                      disabled={!store.selectedObjectId}
                      title="Add a keyframe for the selected object at this frame"
                      className="hover:bg-primary/10 rounded border border-primary px-2 py-1 text-meta text-primary"
                    >
                      Keyframe
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const trackId = `track_${Date.now().toString(36)}`;
                        const selected = (draft?.objects ?? []).find(
                          (o) => o.id === store.selectedObjectId,
                        );
                        if (selected) store.updateObject(selected.id, { trackId });
                      }}
                      disabled={!store.selectedObjectId}
                      title="Start a track from the selected object"
                      className="rounded border border-border px-2 py-1 text-meta text-text-secondary hover:border-primary"
                    >
                      New track
                    </button>
                  </div>
                </div>
              )}
              {frameError && (
                <div className="border-error/40 bg-error/10 absolute bottom-32 left-1/2 -translate-x-1/2 rounded-md border px-3 py-1 text-meta text-error">
                  {frameError}
                </div>
              )}
              <div className="bg-elevated/95 pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md border border-border px-3 py-1 text-meta text-muted">
                {objectTool === 'select'
                  ? 'Select · drag to move · handles to resize · vertices to refine'
                  : `${OBJECT_TOOLS.find((t) => t.key === objectTool)?.label ?? objectTool} · ${
                      activeLabelId ? 'label ready' : 'choose a label on the left'
                    }`}
              </div>
            </>
          ) : (
            <AnnotationCanvas
              imageUrl={`/api/image/${image.id}`}
              naturalWidth={image.width}
              naturalHeight={image.height}
              boxes={canvasBoxes}
              selectedBoxId={store.selectedBoxId}
              activeComponentKey={activeComponentKey}
              activeColor={activeColor}
              onDrawBox={(componentKey, box) => {
                store.addBox(
                  componentKey,
                  box,
                  draft?.componentVisibility[componentKey] ?? 'VISIBLE',
                );
                setActiveComponentKey(null);
              }}
              onUpdateBox={(id, box) => store.updateBox(id, box)}
              onSelectBox={(id) => store.selectBox(id)}
              redactions={draft?.redactions ?? []}
              selectedRedactionId={store.selectedRedactionId}
              blurArmed={blurArmed}
              onDrawRedaction={(cx, cy, r) => {
                // Sticky mode: keep the tool armed so the annotator can blur
                // several faces in a row. A sub-threshold flick returns null and
                // is silently ignored by the store.
                store.addRedaction(cx, cy, r);
              }}
              onUpdateRedaction={(id, patch) => store.updateRedaction(id, patch)}
              onSelectRedaction={(id) => store.selectRedaction(id)}
            />
          )}
          {mode === 'components' && activeComponentKey && (
            <div className="bg-elevated/95 pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-border-strong px-3 py-1 text-meta-lg text-text-secondary shadow">
              Drawing:{' '}
              <span className="font-medium text-text">
                {components.find((c) => c.key === activeComponentKey)?.label ?? activeComponentKey}
              </span>{' '}
              — drag on the image · Esc to cancel
            </div>
          )}
          {mode === 'components' && blurArmed && (
            <div className="bg-elevated/95 border-warning/60 pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border px-3 py-1 text-meta-lg text-text-secondary shadow">
              Face mosaic — click a face and drag outward to size the circle · Esc when done
            </div>
          )}
        </section>

        {/* RIGHT — boxes + validation */}
        <aside className="flex flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-4">
          {/* PLACEHOLDER_RIGHT */}
          {mode === 'objects' && (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-meta font-medium uppercase tracking-wide text-muted">
                    Objects ({draft?.objects.length ?? 0})
                  </h3>
                  <div className="flex items-center gap-1">
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".txt,.json,.xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void importFile(file);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => importInputRef.current?.click()}
                      title="Import YOLO / COCO / VOC / native project objects"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Import
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmClear(true)}
                      disabled={(draft?.objects.length ?? 0) === 0}
                      title="Remove every object in this frame (one undo step)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </Button>
                  </div>
                </div>
                {importError && <p className="mb-2 text-meta text-error">{importError}</p>}
                {(draft?.objects.length ?? 0) > 0 && (
                  <input
                    className="mb-2 w-full rounded-md border border-border-strong bg-elevated px-2 py-1 text-meta text-text"
                    placeholder="Filter by label, geometry or track…"
                    value={objectFilter}
                    onChange={(e) => setObjectFilter(e.target.value)}
                  />
                )}
                {(draft?.objects.length ?? 0) === 0 ? (
                  <p className="text-meta-lg text-muted">
                    No objects yet. Choose a label, pick a tool, then draw on the image.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {[...(draft?.objects ?? [])]
                      .filter((o) => {
                        const q = objectFilter.trim().toLowerCase();
                        return (
                          !q ||
                          o.labelName.toLowerCase().includes(q) ||
                          o.geometry.kind.includes(q) ||
                          (o.trackId ?? '').toLowerCase().includes(q)
                        );
                      })
                      .sort((a, b) => a.zOrder - b.zOrder)
                      .map((obj, i) => {
                        const color = labelColors.get(obj.labelId)?.border ?? '#4DA3FF';
                        const selected = store.selectedObjectId === obj.id;
                        return (
                          <li
                            key={obj.id}
                            className={`rounded-md border px-2 py-1.5 ${
                              selected ? 'bg-primary/5 border-primary' : 'border-border bg-elevated'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => store.selectObject(selected ? null : obj.id)}
                                className="flex min-w-0 items-center gap-2 text-left"
                              >
                                <span
                                  className="h-3 w-3 flex-none rounded-sm"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="truncate text-meta-lg text-text">
                                  #{i + 1} {obj.labelName}
                                </span>
                                <span className="font-mono text-meta text-muted">
                                  {obj.geometry.kind}
                                </span>
                              </button>
                              <div className="flex flex-none items-center gap-0.5">
                                <button
                                  type="button"
                                  aria-label="Bring to front"
                                  onClick={() => store.moveObjectZOrder(obj.id, 'front')}
                                  className="rounded p-1 text-muted hover:text-text"
                                >
                                  <ChevronLast className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Bring forward"
                                  onClick={() => store.moveObjectZOrder(obj.id, 'forward')}
                                  className="rounded p-1 text-muted hover:text-text"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Send backward"
                                  onClick={() => store.moveObjectZOrder(obj.id, 'backward')}
                                  className="rounded p-1 text-muted hover:text-text"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Send to back"
                                  onClick={() => store.moveObjectZOrder(obj.id, 'back')}
                                  className="rounded p-1 text-muted hover:text-text"
                                >
                                  <ChevronFirst className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={obj.visible ? 'Hide object' : 'Show object'}
                                  onClick={() => store.setObjectVisibility(obj.id, !obj.visible)}
                                  className={`rounded p-1 ${obj.visible ? 'text-muted' : 'text-warning'}`}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={obj.locked ? 'Unlock object' : 'Lock object'}
                                  onClick={() => store.setObjectLock(obj.id, !obj.locked)}
                                  className={`rounded p-1 ${obj.locked ? 'text-error' : 'text-muted'}`}
                                >
                                  <Lock className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Delete object"
                                  onClick={() => store.removeObject(obj.id)}
                                  className="rounded p-1 text-muted hover:text-error"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            {selected && (
                              <div className="mt-2 space-y-2 border-t border-border pt-2">
                                <label className="flex items-center gap-2 text-meta text-text-secondary">
                                  <input
                                    type="checkbox"
                                    checked={obj.occluded}
                                    onChange={() => store.toggleOccluded(obj.id)}
                                  />
                                  Occluded in scene
                                </label>
                                <label className="flex items-center gap-2 text-meta text-text-secondary">
                                  <input
                                    type="checkbox"
                                    checked={obj.outside}
                                    onChange={(e) =>
                                      store.updateObject(obj.id, { outside: e.target.checked })
                                    }
                                  />
                                  Outside scene (closes track)
                                </label>
                                <label className="flex items-center gap-2 text-meta text-text-secondary">
                                  <span className="w-16 flex-none text-muted">Track ID</span>
                                  <input
                                    className="min-w-0 flex-1 rounded border border-border-strong bg-bg px-2 py-1 font-mono text-meta text-text"
                                    value={obj.trackId ?? ''}
                                    placeholder="none"
                                    onChange={(e) =>
                                      store.updateObject(obj.id, {
                                        trackId: e.target.value || null,
                                      })
                                    }
                                  />
                                </label>
                                {(labels.find((l) => l.id === obj.labelId)?.attributes ?? []).map(
                                  (def) => (
                                    <label
                                      key={def.id}
                                      className="flex items-center gap-2 text-meta text-text-secondary"
                                    >
                                      <span
                                        className="w-16 flex-none truncate text-muted"
                                        title={def.label}
                                      >
                                        {def.label}
                                      </span>
                                      {def.type === 'boolean' ? (
                                        <input
                                          type="checkbox"
                                          checked={obj.attributes[def.key] === true}
                                          disabled={def.mutable === false}
                                          onChange={(e) =>
                                            store.setObjectAttribute(
                                              obj.id,
                                              def.key,
                                              e.target.checked,
                                            )
                                          }
                                        />
                                      ) : def.type === 'enum' ||
                                        def.type === 'single_choice' ||
                                        def.type === 'multi_choice' ? (
                                        <select
                                          className="min-w-0 flex-1 rounded border border-border-strong bg-bg px-2 py-1 text-meta text-text"
                                          disabled={def.mutable === false}
                                          value={(() => {
                                            const v = obj.attributes[def.key];
                                            if (Array.isArray(v)) return v[0] ?? '';
                                            return v === null || v === undefined ? '' : String(v);
                                          })()}
                                          onChange={(e) =>
                                            store.setObjectAttribute(
                                              obj.id,
                                              def.key,
                                              def.type === 'multi_choice'
                                                ? [e.target.value]
                                                : e.target.value,
                                            )
                                          }
                                        >
                                          <option value="">—</option>
                                          {(def.options ?? []).map((o) => (
                                            <option key={o.value} value={o.value}>
                                              {o.label ?? o.value}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          className="min-w-0 flex-1 rounded border border-border-strong bg-bg px-2 py-1 text-meta text-text"
                                          disabled={def.mutable === false}
                                          type={
                                            def.type === 'integer' || def.type === 'decimal'
                                              ? 'number'
                                              : 'text'
                                          }
                                          value={String(obj.attributes[def.key] ?? '')}
                                          onChange={(e) => {
                                            const raw: AttributeValue =
                                              def.type === 'integer' || def.type === 'decimal'
                                                ? Number(e.target.value)
                                                : e.target.value;
                                            store.setObjectAttribute(obj.id, def.key, raw);
                                          }}
                                        />
                                      )}
                                    </label>
                                  ),
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
              {tracks.length > 0 && (
                <div>
                  <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
                    Tracks ({tracks.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {tracks.map((track) => (
                      <li
                        key={track.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-elevated px-2 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            store.selectObjects(
                              (draft?.objects ?? [])
                                .filter((o) => o.trackId === track.id)
                                .map((o) => o.id),
                            )
                          }
                          className="min-w-0 truncate text-left font-mono text-meta text-text-secondary"
                        >
                          {track.id} · {track.count} frames · {track.labelName}
                        </button>
                        <div className="flex flex-none gap-1">
                          <button
                            type="button"
                            title="Rename track"
                            onClick={() => {
                              const next = window.prompt('Track id', track.id);
                              if (!next?.trim() || next.trim() === track.id) return;
                              for (const o of draft?.objects ?? []) {
                                if (o.trackId === track.id) {
                                  store.updateObject(o.id, { trackId: next.trim() });
                                }
                              }
                            }}
                            className="rounded p-1 text-meta text-muted hover:text-text"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            title="Remove track from all objects"
                            onClick={() => {
                              for (const o of draft?.objects ?? []) {
                                if (o.trackId === track.id)
                                  store.updateObject(o.id, { trackId: null });
                              }
                            }}
                            className="rounded p-1 text-muted hover:text-error"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="mb-2 flex w-full items-center justify-between text-meta font-medium uppercase tracking-wide text-muted"
                >
                  Revision history ({revisions.length})
                  <span className="font-mono">{showHistory ? '−' : '+'}</span>
                </button>
                {showHistory && (
                  <ul className="space-y-1.5">
                    {revisions.length === 0 && (
                      <li className="text-meta-lg text-muted">No saved object revisions yet.</li>
                    )}
                    {revisions.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-elevated px-2 py-1.5"
                      >
                        <span className="text-meta text-text-secondary">
                          {new Date(r.createdAt).toLocaleString()} · {r.objectCount} objects
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (!image) return;
                            void restoreRevisionAction(image.id, r.id).then((res) => {
                              if (res.ok) store.replaceObjects(res.objects);
                              else setImportError(res.error);
                            });
                          }}
                        >
                          Restore
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-md border border-border bg-elevated p-2.5 text-meta text-muted">
                Submit writes VOC, COCO, YOLO, CVAT XML and a native lossless project entry for
                these objects. Shapes a format cannot represent are converted to boxes and reported
                in the format writer; the native project keeps the original geometry.
              </div>
            </>
          )}
          <div>
            <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
              Boxes ({draft?.boxes.length ?? 0})
            </h3>
            {(draft?.boxes.length ?? 0) === 0 ? (
              <p className="text-meta-lg text-muted">
                No boxes yet. Arm a component on the left and drag on the image.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(draft?.boxes ?? []).map((b) => {
                  const color = colors.get(b.componentKey);
                  const comp = components.find((c) => c.key === b.componentKey);
                  const selected = store.selectedBoxId === b.id;
                  return (
                    <li
                      key={b.id}
                      className={
                        'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 ' +
                        (selected ? 'bg-primary/5 border-primary' : 'border-border bg-elevated')
                      }
                    >
                      <button
                        type="button"
                        onClick={() => store.selectBox(selected ? null : b.id)}
                        className="flex min-w-0 items-center gap-2 text-left"
                      >
                        <span
                          className="h-3 w-3 flex-none rounded-sm"
                          style={{ backgroundColor: color?.border ?? '#4DA3FF' }}
                        />
                        <span className="truncate text-meta-lg text-text">
                          {comp?.label ?? b.componentKey}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="Delete box"
                        onClick={() => store.removeBox(b.id)}
                        className="hover:bg-error/10 flex-none rounded p-1 text-muted transition-colors hover:text-error"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Face-mosaic circles: privacy regions, not ontology objects. Each row
              selects its circle, resizes it (slider), or removes it. */}
          <div>
            <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
              Face mosaic ({draft?.redactions.length ?? 0})
            </h3>
            {(draft?.redactions.length ?? 0) === 0 ? (
              <p className="text-meta-lg text-muted">
                No faces masked. Use “Mosaic a face” on the left, then drag outward from the center
                of a face.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(draft?.redactions ?? []).map((c, i) => {
                  const selected = store.selectedRedactionId === c.id;
                  return (
                    <li
                      key={c.id}
                      className={
                        'rounded-md border px-2 py-1.5 ' +
                        (selected ? 'bg-warning/5 border-warning' : 'border-border bg-elevated')
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => store.selectRedaction(selected ? null : c.id)}
                          className="flex min-w-0 items-center gap-2 text-left"
                        >
                          <span className="h-3 w-3 flex-none rounded-full bg-warning" />
                          <span className="truncate text-meta-lg text-text">Face {i + 1}</span>
                        </button>
                        <div className="flex flex-none items-center gap-1.5">
                          <span className="font-mono text-meta tabular-nums text-muted">
                            ⌀{Math.round(c.r * 200)}%
                          </span>
                          <button
                            type="button"
                            aria-label="Remove face mosaic"
                            onClick={() => store.removeRedaction(c.id)}
                            className="hover:bg-error/10 rounded p-1 text-muted transition-colors hover:text-error"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0.01}
                        max={1}
                        step={0.005}
                        value={c.r}
                        onMouseDown={() => store.selectRedaction(c.id)}
                        onChange={(e) => store.updateRedaction(c.id, { r: Number(e.target.value) })}
                        className="mt-1.5 w-full accent-warning"
                        aria-label="Mosaic circle size"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
              Validation
            </h3>
            {mode === 'objects' ? (
              objectValidation.length === 0 ? (
                <div className="border-success/30 bg-success/10 flex items-center gap-2 rounded-md border px-2.5 py-2 text-meta-lg text-success">
                  <Check className="h-4 w-4 flex-none" />
                  {draft?.objects.length
                    ? `${draft.objects.length} object(s) valid.`
                    : 'No objects placed yet.'}
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {objectValidation.map((issue, i) => (
                    <li
                      key={`o-${i}`}
                      className="border-error/30 bg-error/10 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-meta-lg text-error"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : validation?.ok ? (
              <div className="border-success/30 bg-success/10 flex items-center gap-2 rounded-md border px-2.5 py-2 text-meta-lg text-success">
                <Check className="h-4 w-4 flex-none" />
                Ready to submit.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {(validation?.errors ?? []).map((e, i) => (
                  <li
                    key={`e-${i}`}
                    className="border-error/30 bg-error/10 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-meta-lg text-error"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {mode === 'components' && (validation?.warnings.length ?? 0) > 0 && (
              <ul className="mt-1.5 space-y-1.5">
                {(validation?.warnings ?? []).map((w, i) => (
                  <li
                    key={`w-${i}`}
                    className="border-warning/30 bg-warning/10 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-meta-lg text-warning"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {submitErrors.length > 0 && (
            <div className="border-error/40 bg-error/10 rounded-md border p-2.5">
              <p className="mb-1 text-meta font-medium uppercase tracking-wide text-error">
                Submit failed
              </p>
              <ul className="space-y-1 text-meta-lg text-error">
                {submitErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {selectedBox && (
            <p className="text-meta text-muted">
              Selected box: drag to move, resize with the handles, or press Delete to remove. Esc
              clears the selection.
            </p>
          )}

          {selectedRedaction && !selectedBox && (
            <p className="text-meta text-muted">
              Selected face mosaic: drag to move, resize with the handles or the slider above, or
              press Delete to remove. Esc clears the selection.
            </p>
          )}
        </aside>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => prevImageId && goToImage(prevImageId)}
            disabled={!prevImageId || !!busy}
            title={prevImageId ? 'Previous image' : 'This is the first image'}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          {typeof position === 'number' && typeof total === 'number' && total > 0 && (
            <span className="min-w-[3.5rem] text-center font-mono text-meta tabular-nums text-muted">
              {position}/{total}
            </span>
          )}
          <Button
            variant="ghost"
            onClick={() => nextImageId && goToImage(nextImageId)}
            disabled={!nextImageId || !!busy}
            title={nextImageId ? 'Next image' : 'This is the last image'}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button variant="ghost" onClick={skip} disabled={!!busy}>
            {busy === 'skip' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SkipForward className="h-4 w-4" />
            )}
            Skip
          </Button>
          <Button variant="ghost" onClick={resetDraft} disabled={!!busy}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => store.undo()}
            disabled={store.past.length === 0 || !!busy}
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>
          <Button
            variant="ghost"
            onClick={() => store.redo()}
            disabled={store.future.length === 0 || !!busy}
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
            Redo
          </Button>
          <Button
            variant="secondary"
            onClick={saveNow}
            disabled={!!busy || store.autosave === 'saving'}
          >
            Save draft
          </Button>
          <Button
            variant="success"
            onClick={submit}
            disabled={!canSubmit}
            title={canSubmit ? undefined : 'Resolve validation errors first'}
          >
            {busy === 'submit' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Submit
          </Button>
        </div>
      </div>
      <AppFooter compact />
    </div>
  );
}

function AutosaveIndicator({
  status,
  lastSavedAt,
}: {
  status: AutosaveStatus;
  lastSavedAt: number | null;
}) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-meta-lg text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-meta-lg text-error">
        <AlertTriangle className="h-3.5 w-3.5" />
        Save failed
      </span>
    );
  }
  if (status === 'dirty') {
    return <span className="text-meta-lg text-warning">Unsaved changes</span>;
  }
  if (status === 'saved' || lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-meta-lg text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Saved
      </span>
    );
  }
  return <span className="text-meta-lg text-muted">Idle</span>;
}
