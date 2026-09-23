'use client';

/**
 * Native folder selection.
 *
 * In the packaged desktop app this uses the Tauri dialog plugin to open a real
 * OS folder picker. In a plain browser dev context (no Tauri runtime) there is
 * no native picker, so callers fall back to manual path entry. This wrapper
 * isolates that branch so feature code never touches the Tauri API directly.
 */

interface TauriGlobal {
  __TAURI_INTERNALS__?: unknown;
}

/** True when running inside the Tauri webview (native dialogs available). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as TauriGlobal);
}

/**
 * Open a native folder picker. Returns the selected absolute path, or null if
 * the user cancelled or no native picker is available (browser dev).
 */
export async function selectDirectory(title?: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false, title });
    if (typeof selected === 'string') return selected;
    return null;
  } catch {
    return null;
  }
}
