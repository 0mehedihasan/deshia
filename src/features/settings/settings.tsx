'use client';

import * as React from 'react';
import { Archive, FolderOpen } from 'lucide-react';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkspaceTopBar } from '@/components/workspace-top-bar';
import { AppFooter } from '@/components/app-footer';
import { selectDirectory } from '@/lib/native-dialog';
import { backupWorkspaceAction } from '@/app/actions/backup';

interface ComponentSummary {
  key: string;
  label: string;
  required: boolean;
  box: 'required' | 'optional' | 'none';
}
interface ViewSummary {
  key: string;
  label: string;
  components: ComponentSummary[];
}
interface ClassSummary {
  key: string;
  label: string;
  views: ViewSummary[];
}
interface SchemaSummary {
  name: string;
  description: string;
  classes: ClassSummary[];
}

interface WorkspaceInfo {
  id: string;
  name: string;
  sourceDir: string;
  outputDir: string;
  schemaId: string;
  schemaVersion: number;
}

const EXPORT_FORMATS: Array<{ label: string; status: 'ready' | 'declared' }> = [
  { label: 'Pascal VOC XML', status: 'ready' },
  { label: 'COCO JSON', status: 'ready' },
  { label: 'YOLO TXT', status: 'ready' },
  { label: 'CVAT 1.1 XML (objects)', status: 'ready' },
  { label: 'Native project JSON', status: 'ready' },
];

function boxTone(box: ComponentSummary['box']) {
  return box === 'required' ? 'primary' : box === 'optional' ? 'muted' : 'neutral';
}

export function Settings({
  workspace,
  schema,
}: {
  workspace: WorkspaceInfo;
  schema: SchemaSummary | null;
}) {
  const [backupDir, setBackupDir] = React.useState('');
  const [backupStatus, setBackupStatus] = React.useState<string | null>(null);
  const [backupBusy, setBackupBusy] = React.useState(false);

  const runBackup = async () => {
    setBackupBusy(true);
    setBackupStatus(null);
    try {
      const res = await backupWorkspaceAction(workspace.id, backupDir);
      setBackupStatus(res.ok ? `Snapshot written to ${res.path}` : `Backup failed: ${res.error}`);
    } catch (err) {
      setBackupStatus(`Backup failed: ${(err as Error).message}`);
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <WorkspaceTopBar workspaceId={workspace.id} name={workspace.name} active="settings" />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-6">
        <Panel>
          <PanelHeader>
            <PanelTitle>Workspace</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <dl className="grid gap-x-6 gap-y-2 text-meta-lg sm:grid-cols-[160px_minmax(0,1fr)]">
              <dt className="text-muted">Name</dt>
              <dd className="text-text">{workspace.name}</dd>
              <dt className="text-muted">Source folder</dt>
              <dd className="break-all font-mono text-text-secondary">{workspace.sourceDir}</dd>
              <dt className="text-muted">Output folder</dt>
              <dd className="break-all font-mono text-text-secondary">{workspace.outputDir}</dd>
              <dt className="text-muted">Schema</dt>
              <dd className="font-mono text-text-secondary">
                {workspace.schemaId} v{workspace.schemaVersion}
              </dd>
            </dl>
            <p className="mt-3 text-meta text-muted">
              Source and schema are fixed for a workspace to keep dataset indices and exports
              reproducible. Create a new workspace to annotate a different source or schema.
            </p>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Local snapshot</PanelTitle>
          </PanelHeader>
          <PanelBody className="space-y-3">
            <p className="text-meta text-muted">
              Copy the checkpointed database and this workspace&apos;s output tree into a portable
              folder with a checksum manifest. The live database is never overwritten; restoring is
              a manual step performed with DeshiA closed.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="min-w-[18rem] flex-1 rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 font-mono text-meta text-text"
                value={backupDir}
                onChange={(e) => setBackupDir(e.target.value)}
                placeholder="Absolute folder for the snapshot"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const picked = await selectDirectory('Choose a backup folder');
                  if (picked) setBackupDir(picked);
                }}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Browse
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => void runBackup()}
                disabled={backupBusy || !backupDir.trim()}
              >
                <Archive className="h-3.5 w-3.5" />
                {backupBusy ? 'Writing…' : 'Create snapshot'}
              </Button>
            </div>
            {backupStatus && (
              <p className="break-all text-meta text-text-secondary">{backupStatus}</p>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Export formats</PanelTitle>
          </PanelHeader>
          <PanelBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {EXPORT_FORMATS.map((f) => (
                <Badge key={f.label} tone={f.status === 'ready' ? 'success' : 'muted'}>
                  {f.label} — {f.status === 'ready' ? 'available' : 'planned'}
                </Badge>
              ))}
            </div>
            <p className="text-meta text-muted">
              Every submission writes all three formats side by side under{' '}
              <span className="font-mono">ANNOTATED/&lt;class&gt;/&lt;view&gt;/annotations/</span>:
              a Pascal VOC <span className="font-mono">.xml</span>, a self-contained COCO{' '}
              <span className="font-mono">.json</span>, and a YOLO{' '}
              <span className="font-mono">.txt</span>. A dataset-level{' '}
              <span className="font-mono">classes.txt</span> (YOLO class ids) is kept at the{' '}
              <span className="font-mono">ANNOTATED/</span> root, consistent across every folder.
            </p>
          </PanelBody>
        </Panel>

        {schema && (
          <Panel>
            <PanelHeader>
              <PanelTitle>Schema — {schema.name}</PanelTitle>
              <span className="text-meta text-muted">{schema.classes.length} classes</span>
            </PanelHeader>
            <PanelBody className="space-y-5">
              {schema.description && (
                <p className="text-body text-text-secondary">{schema.description}</p>
              )}
              {schema.classes.map((c) => (
                <div key={c.key} className="space-y-3">
                  <h3 className="text-body-lg font-semibold text-text">
                    {c.label} <span className="font-mono text-meta text-muted">/{c.key}</span>
                  </h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    {c.views.map((v) => (
                      <div key={v.key} className="rounded-lg border border-border bg-elevated p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-meta-lg font-medium text-text">{v.label}</span>
                          <span className="font-mono text-meta text-muted">{v.key}</span>
                        </div>
                        <ul className="space-y-1.5">
                          {v.components.map((cp) => (
                            <li key={cp.key} className="flex items-center justify-between gap-2">
                              <span className="truncate text-meta-lg text-text-secondary">
                                {cp.label}
                              </span>
                              <Badge tone={boxTone(cp.box)} mono>
                                {cp.box}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </PanelBody>
          </Panel>
        )}
      </main>

      <AppFooter />
    </div>
  );
}
