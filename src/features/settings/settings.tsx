'use client';

import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { WorkspaceTopBar } from '@/components/workspace-top-bar';

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
  { label: 'COCO JSON', status: 'declared' },
  { label: 'YOLO TXT', status: 'declared' },
];

function boxTone(box: ComponentSummary['box']) {
  return box === 'required' ? 'primary' : box === 'optional' ? 'muted' : 'neutral';
}

export function Settings({ workspace, schema }: { workspace: WorkspaceInfo; schema: SchemaSummary | null }) {
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
            <PanelTitle>Export formats</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-wrap gap-2">
            {EXPORT_FORMATS.map((f) => (
              <Badge key={f.label} tone={f.status === 'ready' ? 'success' : 'muted'}>
                {f.label} — {f.status === 'ready' ? 'available' : 'planned'}
              </Badge>
            ))}
          </PanelBody>
        </Panel>

        {schema && (
          <Panel>
            <PanelHeader>
              <PanelTitle>Schema — {schema.name}</PanelTitle>
              <span className="text-meta text-muted">{schema.classes.length} classes</span>
            </PanelHeader>
            <PanelBody className="space-y-5">
              {schema.description && <p className="text-body text-text-secondary">{schema.description}</p>}
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
                              <span className="truncate text-meta-lg text-text-secondary">{cp.label}</span>
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
    </div>
  );
}
