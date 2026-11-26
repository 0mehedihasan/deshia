'use client';

import * as React from 'react';
import { Download, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { analyzeExistingImagesAction, exportImageMetadataAction } from '@/app/actions/statistics';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import type { ImageMetadataStatistics } from '@/core/scanner/statistics';

type MetadataSummary = Omit<ImageMetadataStatistics, 'images'>;

function bytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount)} ${units[unit]}`;
}

const number = (value: number | null) =>
  value === null
    ? '—'
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

export function ImageMetadataPanel({
  workspaceId,
  metadata,
}: {
  workspaceId: string;
  metadata: MetadataSummary;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [cancelled, setCancelled] = React.useState(false);
  const [progress, setProgress] = React.useState({ processed: 0, total: 0 });
  const [message, setMessage] = React.useState('');
  const stopRef = React.useRef(false);
  const [resolutionPage, setResolutionPage] = React.useState(0);
  const [aspectPage, setAspectPage] = React.useState(0);
  const pageSize = 100;
  const resolutionRows = metadata.resolutions.slice(
    resolutionPage * pageSize,
    (resolutionPage + 1) * pageSize,
  );
  const aspectRows = metadata.aspectRatios.slice(
    aspectPage * pageSize,
    (aspectPage + 1) * pageSize,
  );

  const analyze = async (retryFailed: boolean, verifyAll = false) => {
    setBusy(true);
    setCancelled(false);
    setMessage('');
    stopRef.current = false;
    setProgress({ processed: 0, total: metadata.totalImages });
    let cursor = -1;
    let analyzedCount = 0;
    let failedCount = 0;
    try {
      while (!stopRef.current) {
        const result = await analyzeExistingImagesAction(
          workspaceId,
          cursor,
          retryFailed,
          verifyAll,
        );
        if (!result.ok) {
          setMessage(result.error ?? 'Metadata analysis failed.');
          break;
        }
        cursor = result.nextCursor;
        analyzedCount += result.analyzed;
        failedCount += result.failed;
        setProgress((current) => ({
          ...current,
          processed: Math.min(current.total, current.processed + result.processed),
        }));
        if (result.done) {
          setMessage(
            `${verifyAll ? 'Source verification' : 'Metadata analysis'} complete · ${analyzedCount} analyzed · ${failedCount} failed in this run.`,
          );
          break;
        }
      }
      if (stopRef.current)
        setMessage('Analysis stopped. Completed records are saved and can be resumed.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Metadata analysis failed.');
    } finally {
      setBusy(false);
      setCancelled(false);
    }
  };

  const exportMetadata = async (format: 'CSV' | 'JSON' | 'MARKDOWN') => {
    const result = await exportImageMetadataAction(workspaceId, format);
    if (!result.ok || !result.content) {
      setMessage(result.error ?? 'Metadata export failed.');
      return;
    }
    const url = URL.createObjectURL(
      new Blob([result.content], { type: result.mimeType ?? 'text/plain' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename ?? 'deshia_image_metadata';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel>
      <PanelHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PanelTitle>Image Metadata & Resolution Analysis</PanelTitle>
          <p className="mt-1 text-meta text-muted">
            Original imported files · dimensions read from image headers · sources remain unchanged
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void analyze(false)}
            disabled={busy || metadata.pendingImages === 0}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Analyze Existing Images ({metadata.pendingImages})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void analyze(true)}
            disabled={busy || metadata.failedImages === 0}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry Failed ({metadata.failedImages})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void analyze(true, true)}
            disabled={busy || metadata.totalImages === 0}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Verify All Sources
          </Button>
          {busy && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                stopRef.current = true;
                setCancelled(true);
              }}
              disabled={cancelled}
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => void exportMetadata('CSV')}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void exportMetadata('JSON')}>
            <Download className="h-3.5 w-3.5" /> JSON
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void exportMetadata('MARKDOWN')}>
            <Download className="h-3.5 w-3.5" /> Generate Image Resolution Report
          </Button>
        </div>
      </PanelHeader>
      <PanelBody className="space-y-5">
        {(busy || message) && (
          <div className="space-y-1 text-meta text-text-secondary" aria-live="polite">
            {busy && (
              <p>
                Analyzing original files · {progress.processed}/{progress.total}
              </p>
            )}
            {busy && (
              <div className="h-1.5 overflow-hidden rounded bg-elevated">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{
                    width: `${progress.total ? Math.min(100, (progress.processed / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            )}
            {message && <p>{message}</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {[
            ['Total source files', metadata.totalImages],
            ['Imported image records', metadata.importedImageRecords],
            ['Duplicate source files', metadata.duplicateFilesDetected],
            ['Analyzed', metadata.analyzedImages],
            ['Failed', metadata.failedImages],
            ['Unique resolutions', metadata.uniqueResolutions],
            [
              'Average resolution',
              `${number(metadata.averageWidth)} × ${number(metadata.averageHeight)}`,
            ],
            ['Most common resolution', metadata.mostCommonResolution ?? '—'],
            ['Total storage', bytes(metadata.totalStorageBytes)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-elevated px-3 py-2.5">
              <div className="metric-label">{label}</div>
              <div className="mt-1 truncate font-mono text-body tabular-nums" title={String(value)}>
                {value}
              </div>
            </div>
          ))}
        </div>
        <div className="max-w-xl">
          <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
            File Size Distribution
          </h3>
          <div className="space-y-2">
            {metadata.fileSizeDistribution.map((row) => (
              <div
                key={row.range}
                className="grid grid-cols-[5rem_1fr_8rem] items-center gap-2 text-meta"
              >
                <span className="font-mono">{row.range}</span>
                <div className="h-2 bg-elevated">
                  <div className="h-full bg-primary" style={{ width: `${row.percent}%` }} />
                </div>
                <span className="text-right font-mono">
                  {row.images} · {number(row.percent)}%
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <section>
            <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
              Exact Resolution Distribution
            </h3>
            <div className="max-h-72 overflow-auto rounded border border-border">
              <table className="w-full text-meta">
                <thead className="sticky top-0 bg-elevated text-left text-muted">
                  <tr>
                    {['Resolution', 'Width', 'Height', 'Images', 'Percentage'].map((column) => (
                      <th key={column} className="px-3 py-2">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resolutionRows.map((row) => (
                    <tr key={row.resolution} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{row.resolution}</td>
                      <td className="px-3 py-2 font-mono">{row.width}</td>
                      <td className="px-3 py-2 font-mono">{row.height}</td>
                      <td className="px-3 py-2 font-mono">{row.images}</td>
                      <td className="px-3 py-2 font-mono">{number(row.percent)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {metadata.resolutions.length > pageSize && (
                <div className="flex items-center justify-between border-t border-border px-3 py-2 text-meta">
                  <span>
                    {resolutionPage * pageSize + 1}–
                    {Math.min((resolutionPage + 1) * pageSize, metadata.resolutions.length)} of{' '}
                    {metadata.resolutions.length}
                  </span>
                  <div className="flex gap-2">
                    <button
                      className="text-primary disabled:text-muted"
                      disabled={resolutionPage === 0}
                      onClick={() => setResolutionPage((page) => page - 1)}
                    >
                      Previous
                    </button>
                    <button
                      className="text-primary disabled:text-muted"
                      disabled={(resolutionPage + 1) * pageSize >= metadata.resolutions.length}
                      onClick={() => setResolutionPage((page) => page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              {metadata.resolutions.length === 0 && (
                <p className="p-3 text-meta text-muted">No successfully analyzed image metadata.</p>
              )}
            </div>
          </section>
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
                Aspect Ratio Distribution
              </h3>
              <div className="rounded border border-border">
                <table className="w-full text-meta">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="px-3 py-2">Ratio</th>
                      <th className="px-3 py-2">Images</th>
                      <th className="px-3 py-2">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aspectRows.map((row) => (
                      <tr key={row.ratio} className="border-t border-border">
                        <td className="px-3 py-2 font-mono">
                          {row.ratio} ({number(row.decimal)})
                        </td>
                        <td className="px-3 py-2 font-mono">{row.images}</td>
                        <td className="px-3 py-2 font-mono">{number(row.percent)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {metadata.aspectRatios.length > pageSize && (
                  <div className="flex items-center justify-between border-t border-border px-3 py-2 text-meta">
                    <span>
                      {aspectPage * pageSize + 1}–
                      {Math.min((aspectPage + 1) * pageSize, metadata.aspectRatios.length)} of{' '}
                      {metadata.aspectRatios.length}
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="text-primary disabled:text-muted"
                        disabled={aspectPage === 0}
                        onClick={() => setAspectPage((page) => page - 1)}
                      >
                        Previous
                      </button>
                      <button
                        className="text-primary disabled:text-muted"
                        disabled={(aspectPage + 1) * pageSize >= metadata.aspectRatios.length}
                        onClick={() => setAspectPage((page) => page + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
                Detected File Formats
              </h3>
              <div className="rounded border border-border">
                <table className="w-full text-meta">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="px-3 py-2">Format</th>
                      <th className="px-3 py-2">Images</th>
                      <th className="px-3 py-2">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metadata.formats.map((row) => (
                      <tr key={row.format} className="border-t border-border">
                        <td className="px-3 py-2 font-mono uppercase">{row.format}</td>
                        <td className="px-3 py-2 font-mono">{row.images}</td>
                        <td className="px-3 py-2 font-mono">{number(row.percent)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded border border-border p-3">
            <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
              File Size Statistics
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-meta">
              <dt>Total storage</dt>
              <dd className="font-mono">{bytes(metadata.totalStorageBytes)}</dd>
              <dt>Average / median</dt>
              <dd className="font-mono">
                {bytes(metadata.averageFileSizeBytes)} / {bytes(metadata.medianFileSizeBytes)}
              </dd>
              <dt>Minimum / maximum</dt>
              <dd className="font-mono">
                {metadata.minFileSizeBytes === null ? '—' : bytes(metadata.minFileSizeBytes)} /{' '}
                {metadata.maxFileSizeBytes === null ? '—' : bytes(metadata.maxFileSizeBytes)}
              </dd>
              <dt>Width range</dt>
              <dd className="font-mono">
                {metadata.minWidth ?? '—'}–{metadata.maxWidth ?? '—'} px
              </dd>
              <dt>Height range</dt>
              <dd className="font-mono">
                {metadata.minHeight ?? '—'}–{metadata.maxHeight ?? '—'} px
              </dd>
              <dt>Pixel count range</dt>
              <dd className="font-mono">
                {number(metadata.minPixelCount)}–{number(metadata.maxPixelCount)}
              </dd>
            </dl>
          </section>
          <section className="rounded border border-border p-3">
            <h3 className="mb-2 text-meta font-medium uppercase tracking-wide text-muted">
              Metadata Validation
            </h3>
            <p className="mb-2 text-meta text-text-secondary">
              Duplicate content groups: {metadata.duplicateGroups.length} · additional source files:{' '}
              {metadata.duplicateFilesDetected}
            </p>
            <div className="max-h-40 space-y-1 overflow-auto text-meta">
              {metadata.validationIssues.length ? (
                metadata.validationIssues.slice(0, 50).map((issue, index) => (
                  <p
                    key={`${issue.imageId}-${index}`}
                    className={issue.severity === 'ERROR' ? 'text-error' : 'text-warning'}
                  >
                    {issue.filename}: {issue.message}
                  </p>
                ))
              ) : (
                <p className="text-success">No metadata integrity problems detected.</p>
              )}
              {metadata.validationIssues.length > 50 && (
                <p className="text-muted">
                  Showing 50 of {metadata.validationIssues.length} findings.
                </p>
              )}
            </div>
          </section>
        </div>
      </PanelBody>
    </Panel>
  );
}
