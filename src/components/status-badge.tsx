import { Badge } from '@/components/ui/badge';
import type { ImageStatus } from '@/types/domain';

/** Map an image lifecycle status to a semantic badge tone + label. */
const STATUS_META: Record<ImageStatus, { tone: 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'muted'; label: string }> = {
  PENDING: { tone: 'muted', label: 'Pending' },
  IN_PROGRESS: { tone: 'primary', label: 'In progress' },
  ANNOTATED: { tone: 'success', label: 'Annotated' },
  SKIPPED: { tone: 'warning', label: 'Skipped' },
  ERROR: { tone: 'error', label: 'Error' },
};

export function StatusBadge({ status }: { status: ImageStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
