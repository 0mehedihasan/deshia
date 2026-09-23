import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Small status/label chip. Tones map to semantic tokens only (no hex). Radius is
 * intentionally small (technical, not pill-shaped) per the design system.
 */

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'muted';

const TONES: Record<Tone, string> = {
  neutral: 'bg-elevated text-text-secondary border-border-strong',
  primary: 'bg-primary/10 text-primary border-primary/30',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  error: 'bg-error/10 text-error border-error/30',
  muted: 'bg-transparent text-muted border-border',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  mono?: boolean;
}

export function Badge({ tone = 'neutral', mono = false, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-meta font-medium',
        mono && 'font-mono',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
