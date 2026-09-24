import * as React from 'react';

/**
 * DeshiA logo mark.
 *
 * A bounding-box motif — the app's whole purpose. A primary-colored box frame
 * with grab handles at the corners (the annotator's selection) wraps an amber
 * target inside it (the object being labeled). It echoes the desktop app icon
 * and the box-color language in .claude/CLAUDE.md §9.
 *
 * Colors come from the theme tokens (`--primary`, `--warning`) so the mark
 * recolors correctly in light and dark themes — no hex is hardcoded here.
 * Decorative by default (a wordmark sits beside it in every placement); pass
 * `decorative={false}` to expose it to assistive tech as a standalone image.
 */
export function DeshiaLogo({
  size = 20,
  className,
  decorative = true,
}: {
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'DeshiA'}
    >
      {/* selection box frame */}
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2.5"
        stroke="var(--primary)"
        strokeWidth="1.75"
      />
      {/* object being annotated */}
      <rect x="9" y="9" width="6" height="6" rx="1" fill="var(--warning)" />
      {/* corner grab handles, centered on the frame corners */}
      <g fill="var(--primary)">
        <rect x="2.5" y="2.5" width="3" height="3" rx="0.75" />
        <rect x="18.5" y="2.5" width="3" height="3" rx="0.75" />
        <rect x="2.5" y="18.5" width="3" height="3" rx="0.75" />
        <rect x="18.5" y="18.5" width="3" height="3" rx="0.75" />
      </g>
    </svg>
  );
}
