import { create } from 'zustand';
import type { AnnotationBox, AnnotationState, NormalizedBox, Visibility } from '@/types/domain';

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
}

interface AnnotationStore {
  draft: AnnotationDraft | null;
  selectedBoxId: string | null;
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

  markSaving: () => void;
  markSaved: (at?: number) => void;
  markError: (message: string) => void;
}

let boxCounter = 0;
function nextBoxId(): string {
  boxCounter += 1;
  return `local_box_${Date.now().toString(36)}_${boxCounter}`;
}

function markDirty(patch: Partial<AnnotationStore>): Partial<AnnotationStore> {
  return { ...patch, autosave: 'dirty' as AutosaveStatus };
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  draft: null,
  selectedBoxId: null,
  autosave: 'idle',
  lastSavedAt: null,
  lastError: null,

  loadDraft: (draft) =>
    set({ draft, selectedBoxId: null, autosave: 'idle', lastError: null }),

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
      },
      selectedBoxId: null,
      autosave: 'idle',
      lastError: null,
    }),

  reset: () =>
    set({ draft: null, selectedBoxId: null, autosave: 'idle', lastSavedAt: null, lastError: null }),

  setClass: (classKey) => {
    const draft = get().draft;
    if (!draft) return;
    // Changing class invalidates the view + components + boxes for the old view.
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
    // Changing view invalidates components + boxes.
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
    const newBox: AnnotationBox = { id, componentKey, box, visibility, createdAt: now, updatedAt: now };
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

  markSaving: () => set({ autosave: 'saving', lastError: null }),
  markSaved: (at) => set({ autosave: 'saved', lastSavedAt: at ?? Date.now(), lastError: null }),
  markError: (message) => set({ autosave: 'error', lastError: message }),
}));
