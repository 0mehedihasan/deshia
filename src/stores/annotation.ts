import { create } from 'zustand';
import type {
  AnnotationBox,
  AnnotationState,
  NormalizedBox,
  RedactionCircle,
  Visibility,
} from '@/types/domain';
import { clampRedaction } from '@/core/annotation/redaction';

/**
 * Client-side working annotation state (Zustand).
 *
 * This store holds ONLY UI working state — it never touches the DB or the
 * filesystem (golden rule #5). Persistence happens through server actions that
 * the UI invokes; the store just tracks autosave status and dirtiness so the
 * UI can reflect "saving…/saved/error" and trigger debounced autosaves.
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
  /** Circular face/privacy regions blurred into exported copies (survive class/view changes). */
  redactions: RedactionCircle[];
}

interface AnnotationStore {
  draft: AnnotationDraft | null;
  selectedBoxId: string | null;
  selectedRedactionId: string | null;
  autosave: AutosaveStatus;
  lastSavedAt: number | null;
  lastError: string | null;

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

  /** Face-blur redactions. Not tied to the ontology, so they persist across class/view changes. */
  addRedaction: (cx: number, cy: number, r: number) => string | null;
  updateRedaction: (id: string, patch: { cx?: number; cy?: number; r?: number }) => void;
  removeRedaction: (id: string) => void;
  selectRedaction: (id: string | null) => void;

  markSaving: () => void;
  markSaved: (at?: number) => void;
  markError: (message: string) => void;
}

let boxCounter = 0;
function nextBoxId(): string {
  boxCounter += 1;
  return `local_box_${Date.now().toString(36)}_${boxCounter}`;
}

let redactionCounter = 0;
function nextRedactionId(): string {
  redactionCounter += 1;
  return `local_red_${Date.now().toString(36)}_${redactionCounter}`;
}

function markDirty(patch: Partial<AnnotationStore>): Partial<AnnotationStore> {
  return { ...patch, autosave: 'dirty' as AutosaveStatus };
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  draft: null,
  selectedBoxId: null,
  selectedRedactionId: null,
  autosave: 'idle',
  lastSavedAt: null,
  lastError: null,

  loadDraft: (draft) =>
    set({
      draft: { ...draft, redactions: draft.redactions ?? [] },
      selectedBoxId: null,
      selectedRedactionId: null,
      autosave: 'idle',
      lastError: null,
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
        boxes: state.boxes.map((b) => ({ ...b })),
        redactions: (state.redactions ?? []).map((r) => ({ ...r })),
      },
      selectedBoxId: null,
      selectedRedactionId: null,
      autosave: 'idle',
      lastError: null,
    }),

  reset: () =>
    set({
      draft: null,
      selectedBoxId: null,
      selectedRedactionId: null,
      autosave: 'idle',
      lastSavedAt: null,
      lastError: null,
    }),

  setClass: (classKey) => {
    const draft = get().draft;
    if (!draft) return;
    // Changing class invalidates the view + components + boxes for the old view.
    // Redactions are NOT part of the ontology (a face is a face), so they are
    // deliberately preserved across a class change.
    set(
      markDirty({
        draft: { ...draft, classKey, viewKey: null, componentVisibility: {}, boxes: [] },
        selectedBoxId: null,
      }),
    );
  },

  setView: (viewKey) => {
    const draft = get().draft;
    if (!draft) return;
    // Changing view invalidates components + boxes. Redactions are preserved
    // (they are independent of class/view — see setClass).
    set(
      markDirty({
        draft: { ...draft, viewKey, componentVisibility: {}, boxes: [] },
        selectedBoxId: null,
      }),
    );
  },

  setVisibility: (componentKey, visibility) => {
    const draft = get().draft;
    if (!draft) return;
    set(
      markDirty({
        draft: {
          ...draft,
          componentVisibility: { ...draft.componentVisibility, [componentKey]: visibility },
        },
      }),
    );
  },

  addBox: (componentKey, box, visibility = 'VISIBLE') => {
    const draft = get().draft;
    const id = nextBoxId();
    if (!draft) return id;
    const now = Date.now();
    const newBox: AnnotationBox = {
      id,
      componentKey,
      box,
      visibility,
      createdAt: now,
      updatedAt: now,
    };
    set(
      markDirty({
        draft: { ...draft, boxes: [...draft.boxes, newBox] },
        selectedBoxId: id,
      }),
    );
    return id;
  },

  updateBox: (boxId, box) => {
    const draft = get().draft;
    if (!draft) return;
    set(
      markDirty({
        draft: {
          ...draft,
          boxes: draft.boxes.map((b) =>
            b.id === boxId ? { ...b, box, updatedAt: Date.now() } : b,
          ),
        },
      }),
    );
  },

  setBoxComponent: (boxId, componentKey) => {
    const draft = get().draft;
    if (!draft) return;
    set(
      markDirty({
        draft: {
          ...draft,
          boxes: draft.boxes.map((b) =>
            b.id === boxId ? { ...b, componentKey, updatedAt: Date.now() } : b,
          ),
        },
      }),
    );
  },

  removeBox: (boxId) => {
    const draft = get().draft;
    if (!draft) return;
    set(
      markDirty({
        draft: { ...draft, boxes: draft.boxes.filter((b) => b.id !== boxId) },
        selectedBoxId: get().selectedBoxId === boxId ? null : get().selectedBoxId,
      }),
    );
  },

  selectBox: (boxId) => set({ selectedBoxId: boxId }),

  addRedaction: (cx, cy, r) => {
    const draft = get().draft;
    if (!draft) return null;
    const id = nextRedactionId();
    const cleaned = clampRedaction({ id, cx, cy, r });
    // Below the mis-click threshold → ignore rather than store a dot.
    if (!cleaned) return null;
    set(
      markDirty({
        draft: { ...draft, redactions: [...draft.redactions, cleaned] },
        selectedRedactionId: id,
      }),
    );
    return id;
  },

  updateRedaction: (id, patch) => {
    const draft = get().draft;
    if (!draft) return;
    set(
      markDirty({
        draft: {
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
        },
      }),
    );
  },

  removeRedaction: (id) => {
    const draft = get().draft;
    if (!draft) return;
    set(
      markDirty({
        draft: { ...draft, redactions: draft.redactions.filter((c) => c.id !== id) },
        selectedRedactionId: get().selectedRedactionId === id ? null : get().selectedRedactionId,
      }),
    );
  },

  selectRedaction: (id) => set({ selectedRedactionId: id }),

  markSaving: () => set({ autosave: 'saving', lastError: null }),
  markSaved: (at) => set({ autosave: 'saved', lastSavedAt: at ?? Date.now(), lastError: null }),
  markError: (message) => set({ autosave: 'error', lastError: message }),
}));
