'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FolderOpen, Github, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { selectDirectory, isTauri } from '@/lib/native-dialog';
import { createWorkspaceAction } from '@/app/actions/workspace';

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
        <Button variant="secondary" size="md" onClick={props.onBrowse} title="Browse for a folder">
          <FolderOpen size={15} />
          Browse
        </Button>
      </div>
    </label>
  );
}

export function WelcomeScreen({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [sourceDir, setSourceDir] = React.useState('');
  const [outputDir, setOutputDir] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const browse = async (setter: (v: string) => void, title: string) => {
    const picked = await selectDirectory(title);
    if (picked) setter(picked);
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
        <div>
          <h1 className="text-title font-semibold tracking-tight text-text">DeshiA</h1>
          <p className="mt-1 text-body text-text-secondary">
            Deshi Annotation — a workstation for structured computer-vision datasets.
          </p>
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
              onChange={setSourceDir}
              onBrowse={() => void browse(setSourceDir, 'Select source image folder')}
            />
            <PathField
              label="Output folder (DeshiA_Output is created here)"
              value={outputDir}
              placeholder="/path/to/output"
              onChange={setOutputDir}
              onBrowse={() => void browse(setOutputDir, 'Select output folder')}
            />

            {!isTauri() && (
              <p className="text-meta text-muted">
                Running in a browser — type absolute folder paths. The native picker is available in
                the desktop app.
              </p>
            )}
            {error && (
              <p className="whitespace-pre-line rounded border border-error/30 bg-error/10 px-3 py-2 text-meta-lg text-error">
                {error}
              </p>
            )}

            <Button variant="primary" size="lg" className="w-full" onClick={submit} disabled={pending}>
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
                    <button
                      type="button"
                      onClick={() => router.push(`/workspace/${w.id}`)}
                      className="group flex w-full items-center justify-between rounded-lg border border-border bg-elevated px-3 py-2.5 text-left transition-colors hover:border-primary"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-text">{w.name}</span>
                        <span className="mt-0.5 block truncate font-mono text-meta text-muted">
                          {w.sourceDir}
                        </span>
                      </span>
                      <ArrowRight
                        size={16}
                        className="ml-3 shrink-0 text-muted transition-colors group-hover:text-primary"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>
    </main>
  );
}
