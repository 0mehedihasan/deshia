'use client';

import * as React from 'react';
import { FileCode2, Image as ImageIcon, Layers, ScanEye, type LucideIcon } from 'lucide-react';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { formatBytes } from '@/lib/utils';
import type { OutputScanSummary } from '@/app/actions/scan';

/**
 * Detailed, on-disk output breakdown: a grand-total strip over a per-class →
 * per-view table. Purely presentational — the caller only renders it once a
 * scan has confirmed `ok && exists`. The emphasized column is "Annotated"
 * (the clean dataset images), since that is the dataset the annotator is
 * actually building; zero counts stay muted so populated leaves stand out.
 */

/** One metric in the grand-total strip. */
function Metric({
  icon: Icon,
  label,
  value,
  tone = 'text-text',
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-elevated px-3 py-2">
      <Icon size={16} className="shrink-0 text-muted" />
      <div className="min-w-0">
        <div className="metric-label">{label}</div>
        <div className={`font-mono text-body tabular-nums ${tone}`}>{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

/** A right-aligned count cell; dimmed to muted when zero. */
function Count({ value, tone = 'text-text-secondary' }: { value: number; tone?: string }) {
  return (
    <td
      className={`px-3 py-1.5 text-right font-mono tabular-nums ${value === 0 ? 'text-muted' : tone}`}
    >
      {value.toLocaleString()}
    </td>
  );
}

export function OutputSummary({ summary }: { summary: OutputScanSummary }) {
  const hasAny = summary.rawImages + summary.annotatedImages + summary.visualizations > 0;

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Output on disk</PanelTitle>
        <div className="flex items-center gap-2">
          {summary.hasClassesTxt && (
            <Badge tone="success" mono>
              classes.txt
            </Badge>
          )}
          <Badge tone="neutral" mono>
            {formatBytes(summary.totalBytes)}
          </Badge>
        </div>
      </PanelHeader>
      <PanelBody className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric icon={ImageIcon} label="Raw images" value={summary.rawImages} />
          <Metric
            icon={ScanEye}
            label="Annotated images"
            value={summary.annotatedImages}
            tone="text-success"
          />
          <Metric icon={FileCode2} label="Annotation files" value={summary.annotationFiles} />
          <Metric icon={Layers} label="Visualizations" value={summary.visualizations} />
        </div>

        <OutputTable summary={summary} hasAny={hasAny} />

        <p className="break-all font-mono text-meta text-muted">{summary.outputRoot}</p>
      </PanelBody>
    </Panel>
  );
}

/** The per-class / per-view table, or an empty-tree note. */
function OutputTable({ summary, hasAny }: { summary: OutputScanSummary; hasAny: boolean }) {
  if (!hasAny) {
    return (
      <p className="rounded border border-border bg-elevated px-3 py-2 text-meta-lg text-text-secondary">
        The output tree exists but nothing has been exported yet. Submit an image to populate RAW,
        ANNOTATED and VISUALIZATIONS.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-meta-lg">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-muted">
            <th className="px-3 py-2 font-medium">Class / View</th>
            <th className="px-3 py-2 text-right font-medium">Raw</th>
            <th className="px-3 py-2 text-right font-medium">Annotated</th>
            <th className="px-3 py-2 text-right font-medium">Annotations</th>
            <th className="px-3 py-2 text-right font-medium">Viz</th>
            <th className="px-3 py-2 text-right font-medium">Size</th>
          </tr>
        </thead>
        {summary.classes.map((cls) => (
          <tbody key={cls.classKey}>
            <tr className="bg-elevated/60 border-b border-border">
              <td className="px-3 py-2 font-medium text-text">
                {cls.classLabel}
                <span className="ml-2 font-mono text-meta text-muted">{cls.classKey}</span>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">
                {cls.rawImages.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-success">
                {cls.annotatedImages.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">
                {cls.annotationFiles.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">
                {cls.visualizations.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                {formatBytes(cls.bytes)}
              </td>
            </tr>
            {cls.views.map((v) => (
              <tr key={v.viewKey} className="border-border/50 border-b last:border-0">
                <td className="py-1.5 pl-8 pr-3 text-text-secondary">{v.viewLabel}</td>
                <Count value={v.rawImages} />
                <Count value={v.annotatedImages} tone="text-success" />
                <Count value={v.annotationFiles} />
                <Count value={v.visualizations} />
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted">
                  {formatBytes(v.bytes)}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
