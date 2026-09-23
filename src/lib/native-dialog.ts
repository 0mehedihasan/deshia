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
 * Open a native folder picker. Returns the selected absolute path, or `null` if
 * the user cancelled OR there is no native runtime (a plain browser) — callers
 * should fall back to manual path entry in that case.
 *
 * If a native picker IS present but the call fails (e.g. a missing Tauri
 * `dialog` capability), this throws so the failure is surfaced to the user
 * instead of silently doing nothing — silent failure is exactly what makes
 * "Browse doesn't work" impossible to diagnose.
 */
export async function selectDirectory(title?: string): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === 'string' ? selected : null;
}
