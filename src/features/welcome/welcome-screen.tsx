'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FolderOpen, Github, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { DeshiaLogo } from '@/components/deshia-logo';
import { selectDirectory, isTauri } from '@/lib/native-dialog';
import {
  createWorkspaceAction,
  deleteWorkspaceAction,
  renameWorkspaceAction,
} from '@/app/actions/workspace';
import { DELETE_CONFIRM_WORD } from '@/app/actions/workspace-constants';

export interface WorkspaceSummary {
  id: string;
  name: string;
  sourceDir: string;
  outputDir: string;
  schemaId: string;
  updatedAt: number;
}

const GITHUB_URL = 'https://github.com/0mehedihasan/deshia';

function PathField(props: {
  label: string;
  value: string;
  placeholder: string;
  nativeBrowse: boolean;
  onChange: (v: string) => void;
  onBrowse: () => void;
}) {
  return (
    <label className="block">
      <span className="metric-label mb-1.5 block">{props.label}</span>
      <div className="flex gap-2">
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          spellCheck={false}
          className="h-9 flex-1 rounded border border-border-strong bg-bg px-3 font-mono text-meta-lg text-text placeholder:text-muted focus:border-primary focus:outline-none"
        />
        <Button
          variant="secondary"
          size="md"
          onClick={props.onBrowse}
          disabled={!props.nativeBrowse}
          title={
            props.nativeBrowse
              ? 'Browse for a folder'
              : 'The native folder picker is only available in the DeshiA desktop app. In a browser, type or paste an absolute path.'
          }
        >
          <FolderOpen size={15} />
          Browse
        </Button>
      </div>
    </label>
  );
}

/**
 * Lightweight modal shell (no dialog primitive exists in components/ui). Renders
 * a centered panel over a scrim, closes on Escape or backdrop click, and labels
 * itself for assistive tech.
 */
function Overlay(props: { label: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={props.label}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      {props.children}
    </div>
  );
}

export function WelcomeScreen({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [sourceDir, setSourceDir] = React.useState('');
  const [outputDir, setOutputDir] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Workspace management modals (rename / type-to-confirm delete).
  const [renameTarget, setRenameTarget] = React.useState<WorkspaceSummary | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState<WorkspaceSummary | null>(null);
  const [confirmText, setConfirmText] = React.useState('');
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [busy, startBusy] = React.useTransition();

  const closeModals = () => {
    setRenameTarget(null);
    setDeleteTarget(null);
    setRenameValue('');
    setConfirmText('');
    setModalError(null);
  };

  const openRename = (w: WorkspaceSummary) => {
    setModalError(null);
    setRenameValue(w.name);
    setDeleteTarget(null);
    setRenameTarget(w);
  };

  const openDelete = (w: WorkspaceSummary) => {
    setModalError(null);
    setConfirmText('');
    setRenameTarget(null);
    setDeleteTarget(w);
  };

  const saveRename = () => {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (!next) {
      setModalError('Workspace name is required.');
      return;
    }
    setModalError(null);
    startBusy(async () => {
      const res = await renameWorkspaceAction({ id: renameTarget.id, name: next });
      if (res.ok) {
        closeModals();
        router.refresh();
      } else {
        setModalError(res.error);
      }
    });
  };

  const deleteConfirmed = confirmText.trim().toLowerCase() === DELETE_CONFIRM_WORD;

  const confirmDelete = () => {
    if (!deleteTarget || !deleteConfirmed) return;
    setModalError(null);
    startBusy(async () => {
      const res = await deleteWorkspaceAction({ id: deleteTarget.id, confirmText });
      if (res.ok) {
        closeModals();
        router.refresh();
      } else {
        setModalError(res.error);
      }
    });
  };

  // `isTauri()` depends on `window`, so it is only correct on the client. Read
  // it after mount (never during SSR/first render) to avoid a hydration
  // mismatch, and to keep the Browse button and the browser hint consistent.
  const [nativeBrowse, setNativeBrowse] = React.useState(false);
  React.useEffect(() => {
    setNativeBrowse(isTauri());
  }, []);

  const browse = async (setter: (v: string) => void, title: string) => {
    try {
      const picked = await selectDirectory(title);
      if (picked) setter(picked);
    } catch (e) {
      // selectDirectory throws only when a native picker IS present but the
      // call fails (e.g. a missing Tauri `dialog` capability). Surface it
      // instead of silently doing nothing.
      setError(
        `Could not open the folder picker: ${
          e instanceof Error ? e.message : String(e)
        }\nYou can type or paste an absolute path instead.`,
      );
    }
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createWorkspaceAction({ name, sourceDir, outputDir });
      if (res.ok) router.push(`/workspace/${res.workspaceId}`);
      else setError(res.error);
    });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DeshiaLogo size={34} className="shrink-0" />
          <div>
            <h1 className="text-title font-semibold tracking-tight text-text">DeshiA</h1>
            <p className="mt-1 text-body text-text-secondary">
              Deshi Annotation — a workstation for structured computer-vision datasets.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded border border-border-strong bg-elevated px-2.5 text-meta-lg text-text-secondary transition-colors hover:border-primary hover:text-text"
          >
            <Github size={15} />
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </header>

      <div className="grid flex-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="animate-slide-up">
          <PanelHeader>
            <PanelTitle>New workspace</PanelTitle>
            <Plus size={16} className="text-muted" />
          </PanelHeader>
          <PanelBody className="space-y-4">
            <label className="block">
              <span className="metric-label mb-1.5 block">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rickshaw dataset"
                className="h-9 w-full rounded border border-border-strong bg-bg px-3 text-body text-text placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </label>
            <PathField
              label="Source image folder (read-only)"
              value={sourceDir}
              placeholder="/path/to/source/images"
              nativeBrowse={nativeBrowse}
              onChange={setSourceDir}
              onBrowse={() => void browse(setSourceDir, 'Select source image folder')}
            />
            <PathField
              label="Output folder (DeshiA_Output is created here)"
              value={outputDir}
              placeholder="/path/to/output"
              nativeBrowse={nativeBrowse}
              onChange={setOutputDir}
              onBrowse={() => void browse(setOutputDir, 'Select output folder')}
            />

            {!nativeBrowse && (
              <p className="text-meta text-muted">
                Running in a browser — type absolute folder paths. The native picker is available in
                the desktop app.
              </p>
            )}
            {error && (
              <p className="border-error/30 bg-error/10 whitespace-pre-line rounded border px-3 py-2 text-meta-lg text-error">
                {error}
              </p>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={submit}
              disabled={pending}
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Create workspace
            </Button>
          </PanelBody>
        </Panel>

        <Panel className="animate-slide-up">
          <PanelHeader>
            <PanelTitle>Open existing</PanelTitle>
            <span className="text-meta text-muted">{workspaces.length} total</span>
          </PanelHeader>
          <PanelBody>
            {workspaces.length === 0 ? (
              <p className="py-8 text-center text-body text-muted">
                No workspaces yet. Create one to begin annotating.
              </p>
            ) : (
              <ul className="space-y-2">
                {workspaces.map((w) => (
                  <li key={w.id}>
                    <div className="group flex items-center gap-1 rounded-lg border border-border bg-elevated pr-1.5 transition-colors focus-within:border-primary hover:border-primary">
                      <button
                        type="button"
                        onClick={() => router.push(`/workspace/${w.id}`)}
                        className="flex min-w-0 flex-1 items-center justify-between rounded-lg px-3 py-2.5 text-left focus:outline-none"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-body font-medium text-text">
                            {w.name}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-meta text-muted">
                            {w.sourceDir}
                          </span>
                        </span>
                        <ArrowRight
                          size={16}
                          className="ml-3 shrink-0 text-muted transition-colors group-hover:text-primary"
                        />
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openRename(w)}
                          title="Rename workspace"
                          aria-label={`Rename ${w.name}`}
                          className="grid h-8 w-8 place-items-center rounded text-muted transition-colors hover:bg-bg hover:text-text focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(w)}
                          title="Delete workspace"
                          aria-label={`Delete ${w.name}`}
                          className="hover:bg-error/10 grid h-8 w-8 place-items-center rounded text-muted transition-colors hover:text-error focus:outline-none focus:ring-1 focus:ring-error"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>

      {renameTarget && (
        <Overlay label="Rename workspace" onClose={busy ? () => {} : closeModals}>
          <Panel className="w-full max-w-md animate-slide-up">
            <PanelHeader>
              <PanelTitle>Rename workspace</PanelTitle>
              <button
                type="button"
                onClick={closeModals}
                aria-label="Close"
                className="text-muted transition-colors hover:text-text"
              >
                <X size={16} />
              </button>
            </PanelHeader>
            <PanelBody className="space-y-4">
              <label className="block">
                <span className="metric-label mb-1.5 block">Name</span>
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveRename()}
                  className="h-9 w-full rounded border border-border-strong bg-bg px-3 text-body text-text placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </label>
              {modalError && (
                <p className="border-error/30 bg-error/10 whitespace-pre-line rounded border px-3 py-2 text-meta-lg text-error">
                  {modalError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={closeModals} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={saveRename}
                  disabled={busy || !renameValue.trim()}
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  Save
                </Button>
              </div>
            </PanelBody>
          </Panel>
        </Overlay>
      )}

      {deleteTarget && (
        <Overlay label="Delete workspace" onClose={busy ? () => {} : closeModals}>
          <Panel className="w-full max-w-md animate-slide-up">
            <PanelHeader>
              <PanelTitle>Delete workspace</PanelTitle>
              <button
                type="button"
                onClick={closeModals}
                aria-label="Close"
                className="text-muted transition-colors hover:text-text"
              >
                <X size={16} />
              </button>
            </PanelHeader>
            <PanelBody className="space-y-4">
              <p className="text-body text-text-secondary">
                Remove <span className="font-medium text-text">{deleteTarget.name}</span> and its
                annotation records from DeshiA.
              </p>
              <p className="rounded border border-border bg-bg px-3 py-2 text-meta-lg text-text-secondary">
                Your files are kept. The read-only source images and everything already written to{' '}
                <span className="font-mono text-text">DeshiA_Output</span> stay on disk — only the
                database entry is deleted.
              </p>
              <label className="block">
                <span className="metric-label mb-1.5 block">
                  Type <span className="font-mono text-text">{DELETE_CONFIRM_WORD}</span> to confirm
                </span>
                <input
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmDelete()}
                  placeholder={DELETE_CONFIRM_WORD}
                  spellCheck={false}
                  className="h-9 w-full rounded border border-border-strong bg-bg px-3 font-mono text-meta-lg text-text placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </label>
              {modalError && (
                <p className="border-error/30 bg-error/10 whitespace-pre-line rounded border px-3 py-2 text-meta-lg text-error">
                  {modalError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={closeModals} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={confirmDelete}
                  disabled={busy || !deleteConfirmed}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  Delete workspace
                </Button>
              </div>
            </PanelBody>
          </Panel>
        </Overlay>
      )}
    </main>
  );
}
