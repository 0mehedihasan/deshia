import type { AnnotationDraft } from '@/stores/annotation';

/**
 * Browser-local crash drafts. Each debounced server save is mirrored into
 * IndexedDB; after an unexpected close the workbench offers an explicit
 * Restore/Discard choice. This is a browser-only convenience layer — the
 * authoritative copy remains the append-only SQLite audit trail.
 */

const DB_NAME = 'deshia-annotation-drafts';
const STORE = 'drafts';
const VERSION = 1;

interface StoredDraft {
  key: string;
  savedAt: number;
  draft: AnnotationDraft;
}

function keyFor(imageId: string, frameNumber: number): string {
  return `${imageId}:${frameNumber}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open draft store.'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Draft store request failed.'));
  });
}

export async function saveBrowserDraft(draft: AnnotationDraft, frameNumber = 0): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const record: StoredDraft = {
      key: keyFor(draft.imageId, frameNumber),
      savedAt: Date.now(),
      draft: JSON.parse(JSON.stringify(draft)) as AnnotationDraft,
    };
    await requestToPromise(tx.objectStore(STORE).put(record));
  } finally {
    db.close();
  }
}

export async function loadBrowserDraft(
  imageId: string,
  frameNumber = 0,
): Promise<{ draft: AnnotationDraft; savedAt: number } | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const record = await requestToPromise(
      tx.objectStore(STORE).get(keyFor(imageId, frameNumber)) as IDBRequest<
        StoredDraft | undefined
      >,
    );
    return record ? { draft: record.draft, savedAt: record.savedAt } : null;
  } finally {
    db.close();
  }
}

export async function deleteBrowserDraft(imageId: string, frameNumber = 0): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await requestToPromise(tx.objectStore(STORE).delete(keyFor(imageId, frameNumber)));
  } finally {
    db.close();
  }
}

/** True when a stored draft differs from the server state (crash heuristic). */
export function draftDiffers(stored: AnnotationDraft, persisted: AnnotationDraft | null): boolean {
  if (!persisted) return true;
  return JSON.stringify(stored) !== JSON.stringify(persisted);
}
