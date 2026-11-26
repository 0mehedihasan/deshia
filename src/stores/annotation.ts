import { create } from 'zustand';
import type {
  AnnotationBox,
  AnnotationObject,
  AnnotationState,
  AttributeValue,
  NormalizedBox,
  RedactionCircle,
  Visibility,
} from '@/types/domain';
import type { Geometry } from '@/core/geometry/types';
import { clampRedaction } from '@/core/annotation/redaction';
import { duplicateObject, moveZOrder, type ZOrderMove } from '@/core/annotation/objects';

/**
 * Client-side working annotation state (Zustand).
 *
 * This store holds ONLY UI working state — it never touches the DB or the
 * filesystem (golden rule #5). Persistence happens through server actions that
 * the UI invokes; the store just tracks autosave status and dirtiness so the
 * UI can reflect "saving…/saved/error" and trigger debounced autosaves.
 *
 * A bounded undo/redo history records whole-draft snapshots. It covers both the
 * original component boxes and the generalized object layer, so every editing
 * gesture is reversible with one Ctrl/Cmd+Z.
 */

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface AnnotationDraft {
  imageId: string;
  schemaId: string;
  schemaVersion: number;
  classKey: string | null;
  viewKey: string | null;
  componentVisibility: Record<string, Visibility>;
  boxes: AnnotationBox[];
  /** Independent objects (many per image), schema-driven and geometry-generic. */
  objects: AnnotationObject[];
  /** Circular face/privacy regions blurred into exported copies (survive class/view changes). */
  redactions: RedactionCircle[];
}

const HISTORY_LIMIT = 50;

interface AnnotationStore {
  draft: AnnotationDraft | null;
  selectedBoxId: string | null;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  selectedRedactionId: string | null;
  autosave: AutosaveStatus;
  lastSavedAt: number | null;
  lastError: string | null;
  past: AnnotationDraft[];
  future: AnnotationDraft[];

  /** Load persisted state (or a fresh blank draft) for an image. */
  loadDraft: (draft: AnnotationDraft) => void;
  loadFromState: (state: AnnotationState) => void;
  reset: () => void;

  setClass: (classKey: string | null) => void;
  setView: (viewKey: string | null) => void;
  setVisibility: (componentKey: string, visibility: Visibility) => void;

  addBox: (componentKey: string, box: NormalizedBox, visibility?: Visibility) => string;
  updateBox: (boxId: string, box: NormalizedBox) => void;
  setBoxComponent: (boxId: string, componentKey: string) => void;
  removeBox: (boxId: string) => void;
  selectBox: (boxId: string | null) => void;

  /** Generalized objects. */
  addObject: (
    labelId: string,
    labelName: string,
    geometry: Geometry,
    zOrder: number,
    frameNumber?: number,
    attributes?: Record<string, AttributeValue>,
  ) => string;
  /** Append externally imported objects in a single undo step. */
  addObjects: (objects: AnnotationObject[]) => void;
  /** Replace the whole object set (revision restore / recovery). */
  replaceObjects: (objects: AnnotationObject[]) => void;
  updateObject: (id: string, patch: Partial<AnnotationObject>) => void;
  updateObjectGeometry: (id: string, geometry: Geometry) => void;
  setObjectAttribute: (id: string, key: string, value: AttributeValue) => void;
  removeObject: (id: string) => void;
  clearObjects: () => void;
  setObjectVisibility: (id: string, visible: boolean) => void;
  setObjectLock: (id: string, locked: boolean) => void;
  toggleOccluded: (id: string) => void;
  moveObjectZOrder: (id: string, move: ZOrderMove) => void;
  selectObject: (id: string | null) => void;
  selectObjects: (ids: string[]) => void;
  toggleObjectSelection: (id: string) => void;
  /** Ctrl/Cmd+C then Ctrl/Cmd+V: duplicate selected objects with an offset. */
  duplicateSelected: () => void;

  /** Face-blur redactions. Not tied to the ontology, so they persist across class/view changes. */
  addRedaction: (cx: number, cy: number, r: number) => string | null;
  updateRedaction: (id: string, patch: { cx?: number; cy?: number; r?: number }) => void;
  removeRedaction: (id: string) => void;
  selectRedaction: (id: string | null) => void;

  /** Undo / redo of the whole draft (bounded). */
  undo: () => void;
  redo: () => void;

  /** Force a debounced save after resolving a conflict. */
  markDraftDirty: () => void;
  markSaving: () => void;
  markSaved: (at?: number) => void;
  markError: (message: string) => void;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function nextZOrderLocal(objects: readonly AnnotationObject[], offset = 0): number {
  return objects.reduce((max, o) => Math.max(max, o.zOrder), 0) + 1 + offset;
}

/** Snapshot helper — never keep references into live store state. */
function cloneDraft(draft: AnnotationDraft): AnnotationDraft {
  return {
    ...draft,
    componentVisibility: { ...draft.componentVisibility },
    boxes: draft.boxes.map((b) => ({ ...b, box: { ...b.box } })),
    objects: draft.objects.map((o) => ({
      ...o,
      attributes: { ...o.attributes },
      geometry: cloneGeometry(o.geometry),
    })),
    redactions: draft.redactions.map((r) => ({ ...r })),
  };
}

function cloneGeometry(g: Geometry): Geometry {
  if (g.kind === 'box') return { kind: 'box', box: { ...g.box } };
  if (g.kind === 'point') return { kind: 'point', point: { ...g.point } };
  if (g.kind === 'rotated_box' || g.kind === 'ellipse') return { ...g };
  return { ...g, points: g.points.map((p) => ({ ...p })) };
}

function emptyDraft(
  input: Partial<AnnotationDraft> & Pick<AnnotationDraft, 'imageId' | 'schemaId' | 'schemaVersion'>,
): AnnotationDraft {
  return {
    classKey: null,
    viewKey: null,
    componentVisibility: {},
    boxes: [],
    objects: [],
    redactions: [],
    ...input,
  };
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => {
  /** Record the previous draft, apply the patch, and mark the draft dirty. */
  const commit = (patch: Partial<AnnotationStore>, recordHistory = true): void => {
    const state = get();
    const previous = state.draft;
    set({
      ...patch,
      autosave: 'dirty',
      past:
        recordHistory && previous
          ? [...state.past, cloneDraft(previous)].slice(-HISTORY_LIMIT)
          : state.past,
      future: recordHistory ? [] : state.future,
      lastError: null,
    });
  };

  const mutateDraft = (
    mutate: (draft: AnnotationDraft) => AnnotationDraft,
    extra: Partial<AnnotationStore> = {},
  ): void => {
    const draft = get().draft;
    if (!draft) return;
    commit({ draft: mutate(draft), ...extra });
  };

  return {
    draft: null,
    selectedBoxId: null,
    selectedObjectId: null,
    selectedObjectIds: [],
    selectedRedactionId: null,
    autosave: 'idle',
    lastSavedAt: null,
    lastError: null,
    past: [],
    future: [],

    loadDraft: (draft) =>
      set({
        draft: { ...emptyDraft(draft), redactions: draft.redactions ?? [] },
        selectedBoxId: null,
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedRedactionId: null,
        autosave: 'idle',
        lastError: null,
        past: [],
        future: [],
      }),

    loadFromState: (state) =>
      set({
        draft: {
          imageId: state.imageId,
          schemaId: state.schemaId,
          schemaVersion: state.schemaVersion,
          classKey: state.classKey,
          viewKey: state.viewKey,
          componentVisibility: { ...state.componentVisibility },
          boxes: state.boxes.map((b) => ({ ...b, box: { ...b.box } })),
          objects: (state.objects ?? []).map((o) => ({
            ...o,
            attributes: { ...o.attributes },
            geometry: cloneGeometry(o.geometry),
          })),
          redactions: (state.redactions ?? []).map((r) => ({ ...r })),
        },
        selectedBoxId: null,
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedRedactionId: null,
        autosave: 'idle',
        lastError: null,
        past: [],
        future: [],
      }),

    reset: () =>
      set({
        draft: null,
        selectedBoxId: null,
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedRedactionId: null,
        autosave: 'idle',
        lastSavedAt: null,
        lastError: null,
        past: [],
        future: [],
      }),

    setClass: (classKey) => {
      // Changing class invalidates the view + components + boxes for the old
      // view. Redactions are NOT part of the ontology (a face is a face), so
      // they are deliberately preserved across a class change.
      mutateDraft(
        (draft) => ({
          ...draft,
          classKey,
          viewKey: null,
          componentVisibility: {},
          boxes: [],
          objects: [],
        }),
        { selectedBoxId: null, selectedObjectId: null },
      );
    },

    setView: (viewKey) => {
      mutateDraft(
        (draft) => ({
          ...draft,
          viewKey,
          componentVisibility: {},
          boxes: [],
          objects: [],
        }),
        { selectedBoxId: null, selectedObjectId: null },
      );
    },

    setVisibility: (componentKey, visibility) =>
      mutateDraft((draft) => ({
        ...draft,
        componentVisibility: { ...draft.componentVisibility, [componentKey]: visibility },
      })),

    addBox: (componentKey, box, visibility = 'VISIBLE') => {
      const id = nextId('box');
      const now = Date.now();
      mutateDraft(
        (draft) => ({
          ...draft,
          boxes: [
            ...draft.boxes,
            { id, componentKey, box, visibility, createdAt: now, updatedAt: now },
          ],
        }),
        { selectedBoxId: id, selectedObjectId: null },
      );
      return id;
    },

    updateBox: (boxId, box) =>
      mutateDraft((draft) => ({
        ...draft,
        boxes: draft.boxes.map((b) => (b.id === boxId ? { ...b, box, updatedAt: Date.now() } : b)),
      })),

    setBoxComponent: (boxId, componentKey) =>
      mutateDraft((draft) => ({
        ...draft,
        boxes: draft.boxes.map((b) =>
          b.id === boxId ? { ...b, componentKey, updatedAt: Date.now() } : b,
        ),
      })),

    removeBox: (boxId) =>
      mutateDraft((draft) => ({ ...draft, boxes: draft.boxes.filter((b) => b.id !== boxId) }), {
        selectedBoxId: get().selectedBoxId === boxId ? null : get().selectedBoxId,
      }),

    selectBox: (boxId) => set({ selectedBoxId: boxId, selectedObjectId: null }),

    addObject: (labelId, labelName, geometry, zOrder, frameNumber = 0, attributes = {}) => {
      const id = nextId('obj');
      const now = Date.now();
      mutateDraft(
        (draft) => ({
          ...draft,
          objects: [
            ...draft.objects,
            {
              id,
              labelId,
              labelName,
              geometry,
              attributes: { ...attributes },
              occluded: false,
              zOrder,
              visible: true,
              locked: false,
              trackId: null,
              frameNumber,
              outside: false,
              source: 'MANUAL',
              score: null,
              createdAt: now,
              updatedAt: now,
            },
          ],
        }),
        { selectedObjectId: id, selectedBoxId: null },
      );
      return id;
    },

    addObjects: (incoming) => {
      if (incoming.length === 0) return;
      const now = Date.now();
      mutateDraft((draft) => ({
        ...draft,
        objects: [
          ...draft.objects,
          ...incoming.map((o, i) => ({
            ...o,
            id: nextId('obj'),
            zOrder: nextZOrderLocal(draft.objects, i),
            createdAt: now,
            updatedAt: now,
          })),
        ],
      }));
    },

    replaceObjects: (objects) => {
      mutateDraft(() => ({ ...get().draft!, objects }), {
        selectedObjectIds: [],
        selectedObjectId: null,
      });
    },

    updateObject: (id, patch) =>
      mutateDraft((draft) => ({
        ...draft,
        objects: draft.objects.map((o) =>
          o.id === id ? { ...o, ...patch, id: o.id, updatedAt: Date.now() } : o,
        ),
      })),

    updateObjectGeometry: (id, geometry) =>
      mutateDraft((draft) => ({
        ...draft,
        objects: draft.objects.map((o) =>
          o.id === id ? { ...o, geometry, updatedAt: Date.now() } : o,
        ),
      })),

    setObjectAttribute: (id, key, value) =>
      mutateDraft((draft) => ({
        ...draft,
        objects: draft.objects.map((o) =>
          o.id === id
            ? { ...o, attributes: { ...o.attributes, [key]: value }, updatedAt: Date.now() }
            : o,
        ),
      })),

    removeObject: (id) =>
      mutateDraft((draft) => ({ ...draft, objects: draft.objects.filter((o) => o.id !== id) }), {
        selectedObjectId: get().selectedObjectId === id ? null : get().selectedObjectId,
      }),

    clearObjects: () =>
      mutateDraft((draft) => ({ ...draft, objects: [] }), { selectedObjectId: null }),

    setObjectVisibility: (id, visible) => get().updateObject(id, { visible }),
    setObjectLock: (id, locked) => get().updateObject(id, { locked }),
    toggleOccluded: (id) =>
      mutateDraft((draft) => ({
        ...draft,
        objects: draft.objects.map((o) =>
          o.id === id ? { ...o, occluded: !o.occluded, updatedAt: Date.now() } : o,
        ),
      })),
    moveObjectZOrder: (id, move) =>
      mutateDraft((draft) => ({ ...draft, objects: moveZOrder(draft.objects, id, move) })),

    selectObject: (id) =>
      set({ selectedObjectId: id, selectedObjectIds: id ? [id] : [], selectedBoxId: null }),

    selectObjects: (ids) =>
      set({ selectedObjectIds: ids, selectedObjectId: ids[0] ?? null, selectedBoxId: null }),

    toggleObjectSelection: (id) => {
      const current = get().selectedObjectIds;
      const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
      set({ selectedObjectIds: next, selectedObjectId: next[0] ?? null, selectedBoxId: null });
    },

    duplicateSelected: () => {
      const state = get();
      const draft = state.draft;
      if (!draft) return;
      const ids =
        state.selectedObjectIds.length > 0
          ? state.selectedObjectIds
          : state.selectedObjectId
            ? [state.selectedObjectId]
            : [];
      const selected = draft.objects.filter((o) => ids.includes(o.id));
      if (selected.length === 0) return;
      const now = Date.now();
      const copies = selected.map((o) => duplicateObject(o, nextId('obj'), 0.02, 0.02, now));
      mutateDraft((d) => ({
        ...d,
        objects: [
          ...d.objects,
          ...copies.map((c) => ({ ...c, zOrder: nextZOrderLocal(d.objects) + 1 })),
        ],
      }));
      set({ selectedObjectIds: copies.map((c) => c.id), selectedObjectId: copies[0]?.id ?? null });
    },

    addRedaction: (cx, cy, r) => {
      const draft = get().draft;
      if (!draft) return null;
      const id = nextId('red');
      const cleaned = clampRedaction({ id, cx, cy, r });
      // Below the mis-click threshold → ignore rather than store a dot.
      if (!cleaned) return null;
      mutateDraft((d) => ({ ...d, redactions: [...d.redactions, cleaned] }), {
        selectedRedactionId: id,
      });
      return id;
    },

    updateRedaction: (id, patch) =>
      mutateDraft((draft) => ({
        ...draft,
        redactions: draft.redactions.map((c) => {
          if (c.id !== id) return c;
          const merged = {
            id: c.id,
            cx: patch.cx ?? c.cx,
            cy: patch.cy ?? c.cy,
            r: patch.r ?? c.r,
          };
          // Keep the last valid geometry if a live drag briefly goes tiny.
          return clampRedaction(merged) ?? c;
        }),
      })),

    removeRedaction: (id) =>
      mutateDraft(
        (draft) => ({ ...draft, redactions: draft.redactions.filter((c) => c.id !== id) }),
        {
          selectedRedactionId: get().selectedRedactionId === id ? null : get().selectedRedactionId,
        },
      ),

    selectRedaction: (id) => set({ selectedRedactionId: id }),

    undo: () => {
      const state = get();
      const previous = state.past[state.past.length - 1];
      if (!previous || !state.draft) return;
      set({
        draft: cloneDraft(previous),
        past: state.past.slice(0, -1),
        future: [cloneDraft(state.draft), ...state.future].slice(0, HISTORY_LIMIT),
        autosave: 'dirty',
        selectedBoxId: null,
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedRedactionId: null,
        lastError: null,
      });
    },

    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next || !state.draft) return;
      set({
        draft: cloneDraft(next),
        past: [...state.past, cloneDraft(state.draft)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        autosave: 'dirty',
        selectedBoxId: null,
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedRedactionId: null,
        lastError: null,
      });
    },

    markDraftDirty: () => set({ autosave: 'dirty', lastError: null }),

    markSaving: () => set({ autosave: 'saving', lastError: null }),
    markSaved: (at) => set({ autosave: 'saved', lastSavedAt: at ?? Date.now(), lastError: null }),
    markError: (message) => set({ autosave: 'error', lastError: message }),
  };
});
