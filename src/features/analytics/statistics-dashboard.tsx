'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileJson2, RefreshCw } from 'lucide-react';
import { WorkspaceTopBar } from '@/components/workspace-top-bar';
import { AppFooter } from '@/components/app-footer';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { generateStatisticsSnapshot } from '@/app/actions/statistics';
import type { DatasetStatistics } from '@/core/analytics/statistics';
import type { FormatValidation } from '@/core/analytics/export-validation';
import {
  objectStatisticsMarkdown,
  type ObjectStatistics,
} from '@/core/analytics/object-statistics';
import {
  buildResearchSummary,
  generateStatisticsCsv,
  generateStatisticsJson,
  generateStatisticsMarkdown,
} from '@/core/analytics/reports';
import { ImageMetadataPanel } from './image-metadata-panel';
import type { ImageMetadataStatistics } from '@/core/scanner/statistics';

type Workspace = { id: string; name: string; outputDir: string; schemaVersion: number };
const number = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

function saveFile(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
function processedCount(s: DatasetStatistics) {
  return s.images.annotated + s.images.skipped + s.images.error;
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-2.5">
      <div className="metric-label">{label}</div>
      <div className="mt-1 font-mono text-section-lg tabular-nums">{value}</div>
    </div>
  );
}

export function StatisticsDashboard({
  workspace,
  statistics: s,
  exportValidation,
  metadata,
  objectStats,
}: {
  workspace: Workspace;
  statistics: DatasetStatistics;
  exportValidation: FormatValidation[];
  metadata: Omit<ImageMetadataStatistics, 'images'>;
  objectStats?: ObjectStatistics;
}) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  const [message, setMessage] = React.useState('');
  const snapshot = () =>
    start(async () => {
      const result = await generateStatisticsSnapshot(workspace.id);
      setMessage(result.ok ? `Snapshot saved: ${result.path}` : `Snapshot failed: ${result.error}`);
    });
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <WorkspaceTopBar workspaceId={workspace.id} name={workspace.name} active="analytics" />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-section-lg font-semibold">Dataset Statistics</h1>
            <p className="mt-1 text-meta-lg text-muted">
              Calculated from the current workspace annotations · schema v{workspace.schemaVersion}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.refresh()}>
              <RefreshCw size={15} />
              Recalculate All
            </Button>
            <Button variant="secondary" onClick={snapshot} disabled={busy}>
              <FileJson2 size={15} />
              {busy ? 'Saving…' : 'Generate Statistics Snapshot'}
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                saveFile(
                  'deshia_statistics.json',
                  generateStatisticsJson(s, exportValidation),
                  'application/json',
                )
              }
            >
              <Download size={15} />
              Export JSON
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                saveFile(
                  'deshia_statistics.md',
                  generateStatisticsMarkdown(s, exportValidation, workspace.name),
                  'text/markdown',
                )
              }
            >
              Export Markdown
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                saveFile(
                  'deshia_statistics.csv',
                  generateStatisticsCsv(s, exportValidation),
                  'text/csv',
                )
              }
            >
              Export CSV
            </Button>
          </div>
        </div>
        {message && (
          <p className="break-all rounded border border-border bg-elevated px-3 py-2 text-meta-lg text-text-secondary">
            {message}
          </p>
        )}
        {objectStats && objectStats.total > 0 && (
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-meta font-medium uppercase tracking-wide text-muted">
                Generalized objects
              </h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  saveFile(
                    'deshia_objects.md',
                    objectStatisticsMarkdown(objectStats),
                    'text/markdown',
                  )
                }
              >
                <Download size={14} />
                Export report
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Kpi label="Objects" value={objectStats.total} />
              <Kpi label="Geometry kinds" value={Object.keys(objectStats.byGeometry).length} />
              <Kpi label="Occluded" value={objectStats.occluded} />
              <Kpi label="Tracks" value={objectStats.trackCount} />
              <Kpi label="With attributes" value={objectStats.objectsWithAttributes} />
            </div>
          </section>
        )}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
          <Kpi label="Images" value={s.images.total} />
          <Kpi label="Annotated images" value={s.images.annotated} />
          <Kpi label="Skipped" value={s.images.skipped} />
          <Kpi
            label="Vehicle-body instances"
            value={s.vehicleEntityTypeAvailable ? s.vehicleBodies.instances : 'Not available'}
          />
          <Kpi label="Component annotations" value={s.annotations} />
          <Kpi label="Vehicle categories" value={s.categories.length} />
          <Kpi label="Annotation classes" value={s.annotationClassCount} />
          <Kpi label="Annotation coverage" value={`${number(s.images.coverage)}%`} />
          <div title="Cross-image vehicle identity was not recorded, so unique physical vehicle count cannot be determined reliably.">
            <Kpi
              label="Unique physical vehicles"
              value={s.uniquePhysicalVehicleCount ?? 'Not recorded'}
            />
          </div>
        </section>
        <ImageMetadataPanel workspaceId={workspace.id} metadata={metadata} />
        <p className="text-meta text-muted">
          Workflow completion describes image processing status. Annotation coverage describes
          images containing objects; neither measures annotation accuracy.
        </p>
        <Panel>
          <PanelHeader>
            <PanelTitle>Research Summary</PanelTitle>
          </PanelHeader>
          <PanelBody className="space-y-2 text-meta-lg">
            <p>{buildResearchSummary(s, workspace.name)}</p>
            <p className="text-text-secondary">
              Workflow completion:{' '}
              {number(s.images.total ? (processedCount(s) / s.images.total) * 100 : 0)}% ·
              Annotation coverage: {number(s.images.coverage)}% · Mean objects/image:{' '}
              {number(s.images.mean)} · Median: {number(s.images.median)}
            </p>
          </PanelBody>
        </Panel>
        {s.vehicleEntityTypeAvailable && (
          <Panel>
            <PanelHeader>
              <PanelTitle>Vehicle-body instances</PanelTitle>
            </PanelHeader>
            <PanelBody className="grid grid-cols-2 gap-3 text-meta-lg">
              <span>Total vehicle-body instances</span>
              <b>{s.vehicleBodies.instances}</b>
              <span>Images containing vehicle bodies</span>
              <b>{s.vehicleBodies.images}</b>
              <span>Maximum bodies in one image</span>
              <b>{s.vehicleBodies.maxPerImage}</b>
              <span>Average bodies per dataset image</span>
              <b>{number(s.vehicleBodies.averagePerImage)}</b>
              <span>Unique physical vehicles</span>
              <b title="Cross-image vehicle identity was not recorded, so unique physical vehicle count cannot be determined reliably.">
                {s.uniquePhysicalVehicleCount ?? 'Not recorded'}
              </b>
            </PanelBody>
          </Panel>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader>
              <PanelTitle>Image & object summary</PanelTitle>
            </PanelHeader>
            <PanelBody className="grid grid-cols-2 gap-3 text-meta-lg">
              <span>Total discovered</span>
              <b>{s.images.total}</b>
              <span>Processed (annotated or skipped)</span>
              <b>{s.images.annotated + s.images.skipped}</b>
              <span>Error / pending / in progress</span>
              <b>
                {s.images.error} / {s.images.pending} / {s.images.inProgress}
              </b>
              <span>Objects per image · mean / median</span>
              <b>
                {number(s.images.mean)} / {number(s.images.median)}
              </b>
              <span>Min / max / standard deviation</span>
              <b>
                {s.images.min} / {s.images.max} / {number(s.images.standardDeviation)}
              </b>
              <span>Images with zero / one+ objects</span>
              <b>
                {s.images.zeroObjects} / {s.images.withObjects}
              </b>
              <span>Annotation files</span>
              <b>Pascal VOC · {s.images.annotated} expected after export</b>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader>
              <PanelTitle>Objects per image</PanelTitle>
            </PanelHeader>
            <PanelBody className="space-y-2">
              {s.images.distribution.map((row) => (
                <div
                  key={row.bucket}
                  className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-meta"
                >
                  <span className="font-mono">{row.bucket}</span>
                  <div className="h-3 bg-elevated">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${s.images.total ? (row.count / s.images.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-right font-mono">{row.count}</span>
                </div>
              ))}
            </PanelBody>
          </Panel>
        </div>
        <Panel>
          <PanelHeader>
            <PanelTitle>Class / component statistics</PanelTitle>
            <span className="text-meta text-muted">Ontology read from project schema</span>
          </PanelHeader>
          <PanelBody className="p-0">
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-meta">
                <thead className="sticky top-0 bg-surface text-left text-muted">
                  <tr>
                    {[
                      'Class',
                      'Instances',
                      'Images',
                      'Coverage',
                      '% objects',
                      'Mean / present image',
                      'Mean box area',
                    ].map((x) => (
                      <th key={x} className="px-3 py-2 font-medium">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.classes.map((c) => (
                    <tr key={c.key} className="border-t border-border">
                      <td className="px-3 py-2">
                        {c.label}
                        <span className="ml-2 font-mono text-muted">{c.key}</span>
                      </td>
                      <td className="px-3 py-2 font-mono">{c.instances}</td>
                      <td className="px-3 py-2 font-mono">{c.images}</td>
                      <td className="px-3 py-2 font-mono">{number(c.coverage)}%</td>
                      <td className="px-3 py-2 font-mono">{number(c.objectPercent)}%</td>
                      <td className="px-3 py-2 font-mono">{number(c.meanPerPresentImage)}</td>
                      <td className="px-3 py-2 font-mono">{number(c.meanArea)} px²</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelBody>
        </Panel>
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel>
            <PanelHeader>
              <PanelTitle>Vehicle Category</PanelTitle>
            </PanelHeader>
            <PanelBody>
              {s.categories.length ? (
                <table className="w-full text-meta">
                  <thead className="text-left text-muted">
                    <tr>
                      <th>Category</th>
                      <th>Body instances</th>
                      <th>Images containing category</th>
                      <th>Image coverage</th>
                      <th>Instances / category image</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.categories.map((c) => (
                      <tr key={c.key} className="border-t border-border">
                        <td>{c.label}</td>
                        <td className="font-mono">{c.vehicleBodyInstances}</td>
                        <td className="font-mono">{c.images}</td>
                        <td className="font-mono">{number(c.percent)}%</td>
                        <td className="font-mono">{number(c.averageVehiclesPerImage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-meta text-muted">Not available for this dataset.</p>
              )}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader>
              <PanelTitle>View distribution</PanelTitle>
            </PanelHeader>
            <PanelBody>
              {s.views.length ? (
                <table className="w-full text-meta">
                  <thead className="text-left text-muted">
                    <tr>
                      <th>View</th>
                      <th>Images</th>
                      <th>Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.views.map((v) => (
                      <tr key={v.key} className="border-t border-border">
                        <td>{v.label}</td>
                        <td className="font-mono">{v.images}</td>
                        <td className="font-mono">{number(v.percent)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-meta text-muted">Not available for this dataset.</p>
              )}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader>
              <PanelTitle>Bounding-box statistics</PanelTitle>
            </PanelHeader>
            <PanelBody className="grid grid-cols-2 gap-2 text-meta">
              <span>Area · mean / median</span>
              <b>
                {number(s.boxes.meanArea)} / {number(s.boxes.medianArea)} px²
              </b>
              <span>Area · min / max</span>
              <b>
                {number(s.boxes.minArea)} / {number(s.boxes.maxArea)} px²
              </b>
              <span>Mean width / height</span>
              <b>
                {number(s.boxes.meanWidth)} / {number(s.boxes.meanHeight)} px
              </b>
              <span>Mean aspect ratio</span>
              <b>{number(s.boxes.meanAspectRatio)}</b>
            </PanelBody>
          </Panel>
        </div>
        {s.visibility.length > 0 && (
          <Panel>
            <PanelHeader>
              <PanelTitle>Visibility</PanelTitle>
            </PanelHeader>
            <PanelBody className="flex flex-wrap gap-6 text-meta">
              {s.visibility.map((v) => (
                <span key={v.state}>
                  {v.state === 'VISIBLE'
                    ? 'Visible'
                    : v.state === 'NOT_VISIBLE'
                      ? 'Not visible'
                      : v.state === 'OCCLUDED'
                        ? 'Occluded'
                        : v.state}
                  : <b>{v.instances}</b> ({number(v.percent)}%)
                </span>
              ))}
            </PanelBody>
          </Panel>
        )}
        <Panel>
          <PanelHeader>
            <PanelTitle>Export Validation</PanelTitle>
            <span className="text-meta text-muted">
              Validated against files in the workspace output folder
            </span>
          </PanelHeader>
          <PanelBody className="overflow-auto p-0">
            <table className="w-full text-meta">
              <thead className="text-left text-muted">
                <tr>
                  {[
                    'Format',
                    'Status',
                    'Expected',
                    'Found',
                    'Valid',
                    'Invalid',
                    'Missing',
                    'Images',
                    'Objects',
                    'Missing objects',
                    'Extra objects',
                    'Exportable / total annotations',
                    'Excluded',
                    'Classes consistent',
                  ].map((x) => (
                    <th key={x} className="px-3 py-2">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exportValidation.map((v) => (
                  <tr key={v.format} className="border-t border-border">
                    <td className="px-3 py-2">{v.format}</td>
                    <td
                      className={`px-3 py-2 font-semibold ${v.status === 'PASS' ? 'text-success' : v.status === 'ERROR' ? 'text-error' : v.status === 'WARNING' ? 'text-warning' : 'text-muted'}`}
                    >
                      {v.status}
                    </td>
                    <td className="px-3 py-2 font-mono">{v.expected}</td>
                    <td className="px-3 py-2 font-mono">{v.found}</td>
                    <td className="px-3 py-2 font-mono">{v.valid}</td>
                    <td className="px-3 py-2 font-mono">{v.invalid}</td>
                    <td className="px-3 py-2 font-mono">{v.missing}</td>
                    <td className="px-3 py-2 font-mono">{v.imagesRepresented}</td>
                    <td className="px-3 py-2 font-mono">{v.objectsParsed}</td>
                    <td className="px-3 py-2 font-mono">{v.objectsMissing}</td>
                    <td className="px-3 py-2 font-mono">{v.objectsExtra}</td>
                    <td className="px-3 py-2 font-mono">
                      {v.annotationsExportable}/{v.annotationsTotal}
                    </td>
                    <td className="px-3 py-2 font-mono">{v.annotationsExcluded}</td>
                    <td className="px-3 py-2">{v.classConsistent ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {exportValidation.some((v) => v.details.length > 0) && (
              <div className="space-y-1 px-3 py-3 text-meta text-warning">
                {exportValidation
                  .flatMap((v) => v.details.map((detail) => `${v.format}: ${detail}`))
                  .map((detail, i) => (
                    <p key={i}>{detail}</p>
                  ))}
              </div>
            )}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader>
            <PanelTitle>Class distribution</PanelTitle>
            <span
              className={s.classTotalsMatch ? 'text-meta text-success' : 'text-meta text-error'}
            >
              {s.classTotalsMatch
                ? 'Class totals match objects'
                : `ERROR: class instances sum to ${s.classes.reduce((a, c) => a + c.instances, 0)}; objects ${s.annotations}`}
            </span>
          </PanelHeader>
          <PanelBody className="p-0">
            <table className="w-full text-meta">
              <thead className="text-left text-muted">
                <tr>
                  {['Annotation Class', 'Instances', 'Images', 'Coverage', '% of Objects'].map(
                    (x) => (
                      <th key={x} className="px-3 py-2 font-medium">
                        {x}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {s.classes.map((c) => (
                  <tr key={c.key} className="border-t border-border">
                    <td className="px-3 py-2">{c.label}</td>
                    <td className="px-3 py-2 font-mono">{c.instances}</td>
                    <td className="px-3 py-2 font-mono">{c.images}</td>
                    <td className="px-3 py-2 font-mono">{number(c.coverage)}%</td>
                    <td className="px-3 py-2 font-mono">{number(c.objectPercent)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader>
            <PanelTitle>Integrity review</PanelTitle>
          </PanelHeader>
          <PanelBody className="grid gap-4 md:grid-cols-3">
            {(['ERROR', 'WARNING', 'INFO'] as const).map((severity) => {
              const issues = s.boxes.issues.filter((issue) => issue.severity === severity);
              return (
                <section key={severity}>
                  <h3
                    className={`mb-2 text-meta font-semibold ${severity === 'ERROR' ? 'text-error' : severity === 'WARNING' ? 'text-warning' : 'text-text-secondary'}`}
                  >
                    {severity} · {issues.length}
                  </h3>
                  {issues.length ? (
                    <ul className="max-h-52 list-inside list-disc space-y-1 overflow-auto text-meta">
                      {issues.map((issue, i) => (
                        <li key={`${i}-${issue.message}`}>{issue.message}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-meta text-muted">None detected.</p>
                  )}
                </section>
              );
            })}
          </PanelBody>
        </Panel>
      </main>
      <AppFooter />
    </div>
  );
}
