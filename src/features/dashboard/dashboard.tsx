'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FolderCheck, FolderSearch, Loader2, PlayCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceTopBar } from '@/components/workspace-top-bar';
import { formatBytes, formatPercent } from '@/lib/utils';
import {
  scanAndImportAction,
  scanOutputAction,
  type OutputScanSummary,
  type ScanImportSummary,
} from '@/app/actions/scan';
import { OutputSummary } from './output-summary';
import type { ImageStatus } from '@/types/domain';
import type { StatusCounts } from '@/db/repositories/images';

export interface DashboardImage {
  id: string;
  datasetIndex: number;
  filename: string;
  status: ImageStatus;
  width: number;
  height: number;
  fileSize: number;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  sourceDir: string;
  outputDir: string;
  schemaId: string;
  schemaName: string;
  schemaVersion: number;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-2.5">
      <div className="metric-label">{label}</div>
      <div className={`mt-1 font-mono text-section-lg tabular-nums ${tone ?? 'text-text'}`}>
        {value}
      </div>
    </div>
  );
}

export function Dashboard({
  workspace,
  counts,
  images,
  next,
}: {
  workspace: WorkspaceInfo;
  counts: StatusCounts;
  images: DashboardImage[];
  next: { imageId: string; resuming: boolean } | null;
}) {
  const router = useRouter();
  const [scanning, startScan] = React.useTransition();
  const [summary, setSummary] = React.useState<ScanImportSummary | null>(null);
  const [scanningOutput, startOutputScan] = React.useTransition();
  const [outputSummary, setOutputSummary] = React.useState<OutputScanSummary | null>(null);

  const runScan = () => {
    setSummary(null);
    startScan(async () => {
      const res = await scanAndImportAction(workspace.id);
      setSummary(res);
      router.refresh();
    });
  };

  // Read-only inventory of the DeshiA_Output tree — the output-side counterpart
  // to "Scan source". Does not mutate the DB, so no router.refresh() is needed.
  const runOutputScan = () => {
    setOutputSummary(null);
    startOutputScan(async () => {
      setOutputSummary(await scanOutputAction(workspace.id));
    });
  };

  const done = counts.annotated + counts.skipped;
  const progress = counts.total > 0 ? done / counts.total : 0;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <WorkspaceTopBar workspaceId={workspace.id} name={workspace.name} active="dashboard" />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6">
        {/* Workspace facts + primary actions */}
        <Panel>
          <PanelBody className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <h1 className="text-section-lg font-semibold text-text">{workspace.name}</h1>
                <Badge tone="primary" mono>
                  {workspace.schemaName} v{workspace.schemaVersion}
                </Badge>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-meta-lg sm:grid-cols-[auto_minmax(0,1fr)]">
                <dt className="text-muted">Source</dt>
                <dd className="truncate font-mono text-text-secondary">{workspace.sourceDir}</dd>
                <dt className="text-muted">Output</dt>
                <dd className="truncate font-mono text-text-secondary">{workspace.outputDir}</dd>
              </dl>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={runScan} disabled={scanning}>
                {scanning ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FolderSearch size={16} />
                )}
                {counts.total > 0 ? 'Rescan source' : 'Scan source'}
              </Button>
              <Button variant="secondary" onClick={runOutputScan} disabled={scanningOutput}>
                {scanningOutput ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FolderCheck size={16} />
                )}
                Scan output
              </Button>
              <Button
                variant="primary"
                disabled={!next}
                onClick={() =>
                  next && router.push(`/workspace/${workspace.id}/annotate?image=${next.imageId}`)
                }
              >
                {next?.resuming ? <RotateCcw size={16} /> : <PlayCircle size={16} />}
                {next
                  ? next.resuming
                    ? 'Resume annotating'
                    : 'Start annotating'
                  : 'Nothing pending'}
              </Button>
            </div>
          </PanelBody>
        </Panel>

        {summary && (
          <p
            className={`rounded border px-3 py-2 text-meta-lg ${
              summary.ok
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-error/30 bg-error/10 text-error'
            }`}
          >
            {summary.ok
              ? `Scan complete — ${summary.imported} imported, ${summary.skippedExisting} already present, ${summary.duplicates} content duplicates skipped, ${summary.unsupported} unsupported, ${summary.errors} errors.`
              : `Scan failed: ${summary.error}`}
          </p>
        )}

        {outputSummary &&
          (!outputSummary.ok ? (
            <p className="border-error/30 bg-error/10 rounded border px-3 py-2 text-meta-lg text-error">
              Output scan failed: {outputSummary.error}
            </p>
          ) : !outputSummary.exists ? (
            <p className="rounded border border-border bg-elevated px-3 py-2 text-meta-lg text-text-secondary">
              No <span className="font-mono">DeshiA_Output</span> found yet under{' '}
              <span className="font-mono">{outputSummary.outputRoot}</span>. It is created with the
              workspace and filled as you submit images.
            </p>
          ) : (
            <OutputSummary summary={outputSummary} />
          ))}

        {/* Progress + status counts */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Panel>
            <PanelHeader>
              <PanelTitle>Progress</PanelTitle>
              <span className="font-mono text-meta-lg text-text-secondary">
                {formatPercent(progress)}
              </span>
            </PanelHeader>
            <PanelBody className="space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="text-meta-lg text-muted">
                <span className="font-mono text-text">{done}</span> of{' '}
                <span className="font-mono text-text">{counts.total}</span> images resolved
                (annotated or skipped).
              </p>
            </PanelBody>
          </Panel>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Total" value={counts.total} />
            <Stat label="Pending" value={counts.pending} tone="text-text-secondary" />
            <Stat label="In progress" value={counts.inProgress} tone="text-primary" />
            <Stat label="Annotated" value={counts.annotated} tone="text-success" />
            <Stat label="Skipped" value={counts.skipped} tone="text-warning" />
            <Stat label="Errors" value={counts.error} tone="text-error" />
          </div>
        </div>

        {/* Image inventory */}
        <Panel>
          <PanelHeader>
            <PanelTitle>Images</PanelTitle>
            <span className="text-meta text-muted">{images.length} rows</span>
          </PanelHeader>
          <PanelBody className="p-0">
            {images.length === 0 ? (
              <p className="px-4 py-10 text-center text-body text-muted">
                No images imported yet. Scan the source folder to begin.
              </p>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full border-collapse text-meta-lg">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-border text-left text-muted">
                      <th className="px-4 py-2 font-medium">#</th>
                      <th className="px-4 py-2 font-medium">Filename</th>
                      <th className="px-4 py-2 font-medium">Dimensions</th>
                      <th className="px-4 py-2 font-medium">Size</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {images.map((img) => (
                      <tr key={img.id} className="border-border/60 hover:bg-elevated/60 border-b">
                        <td className="px-4 py-2 font-mono tabular-nums text-muted">
                          {String(img.datasetIndex).padStart(3, '0')}
                        </td>
                        <td className="max-w-[280px] truncate px-4 py-2 font-mono text-text-secondary">
                          {img.filename}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums text-muted">
                          {img.width}×{img.height}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums text-muted">
                          {formatBytes(img.fileSize)}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={img.status} />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/workspace/${workspace.id}/annotate?image=${img.id}`)
                            }
                            className="text-meta font-medium text-primary hover:underline"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelBody>
        </Panel>
      </main>
    </div>
  );
}
