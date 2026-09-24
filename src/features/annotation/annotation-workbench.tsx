'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  RotateCcw,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceTopBar } from '@/components/workspace-top-bar';
import { useAnnotationStore, type AutosaveStatus } from '@/stores/annotation';
import {
  colorsForView,
  defaultVisibility,
  isVisibilityAllowed,
  listClassKeys,
  listViewKeys,
  resolveComponents,
} from '@/core/annotation/engine';
import { validateAnnotation } from '@/core/annotation/validate';
import type { AnnotationSchema } from '@/schemas/types';
import type { AnnotationState, ImageStatus, Visibility } from '@/types/domain';
import { saveDraftAction, skipImageAction, submitImageAction } from '@/app/actions/annotation';
import type { CanvasBox } from './annotation-canvas';

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
}

export function AnnotationWorkbench({
  workspaceId,
  workspaceName,
  schema,
  counts,
  image,
  initialState,
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
      });
    }
    setActiveComponentKey(null);
    setSubmitErrors([]);
    // Only re-init when the target image changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.id]);

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
      status: 'DRAFT',
      annotationVersion: 1,
      createdAt: 0,
      updatedAt: 0,
    };
    return validateAnnotation(schema, state);
  }, [draft, image, schema]);

  // ---- handlers ----
  const selectClass = (key: string) => {
    store.setClass(key);
    setActiveComponentKey(null);
  };

  const selectView = (key: string) => {
    store.setView(key);
    setActiveComponentKey(null);
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
    })),
  });

  // Debounced autosave whenever the draft is dirty.
  React.useEffect(() => {
    if (!draft || !image) return;
    if (store.autosave !== 'dirty') return;
    const handle = setTimeout(async () => {
      store.markSaving();
      try {
        const res = await saveDraftAction(buildPayload());
        if (res.ok) store.markSaved(res.savedAt);
        else store.markError(res.error);
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
      if (res.ok) store.markSaved(res.savedAt);
      else store.markError(res.error);
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

  const armDraw = (componentKey: string) => {
    setActiveComponentKey((k) => (k === componentKey ? null : componentKey));
    store.selectBox(null);
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
      });
    setActiveComponentKey(null);
    setSubmitErrors([]);
  };

  const activeColor = activeComponentKey ? (colors.get(activeComponentKey)?.border ?? null) : null;
  const canSubmit = !!validation?.ok && !busy;
  const selectedBox = draft?.boxes.find((b) => b.id === store.selectedBoxId) ?? null;

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
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
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
          {/* PLACEHOLDER_LEFT */}
          <div className="space-y-3">
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
          />
          {activeComponentKey && (
            <div className="bg-elevated/95 pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-border-strong px-3 py-1 text-meta-lg text-text-secondary shadow">
              Drawing:{' '}
              <span className="font-medium text-text">
                {components.find((c) => c.key === activeComponentKey)?.label ?? activeComponentKey}
              </span>{' '}
              — drag on the image
            </div>
          )}
        </section>

        {/* RIGHT — boxes + validation */}
        <aside className="flex flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-4">
          {/* PLACEHOLDER_RIGHT */}
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

          <div>
            <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
              Validation
            </h3>
            {validation?.ok ? (
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
            {(validation?.warnings.length ?? 0) > 0 && (
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
              Selected box: drag to move, use handles to resize on the canvas.
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
