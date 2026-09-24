import { Github } from 'lucide-react';

/**
 * App-wide attribution footer. Rendered at the bottom of every screen so the
 * author credit is always present. Styling stays inside the design system —
 * semantic tokens only, Geist Mono for the technical handle — and the `compact`
 * variant keeps the full-height annotation workbench from losing canvas space.
 */

const GITHUB_PROFILE_URL = 'https://github.com/0mehedihasan';

export function AppFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer
      className={
        'flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border bg-surface text-center text-meta text-muted ' +
        (compact ? 'px-6 py-1.5' : 'px-6 py-4')
      }
    >
      <span>
        Developed by <span className="font-medium text-text-secondary">Md. Mehedi Hasan</span>
      </span>
      <span aria-hidden className="text-border-strong">
        ·
      </span>
      <a
        href={GITHUB_PROFILE_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded font-mono text-text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <Github size={13} className="shrink-0" />
        github.com/0mehedihasan
      </a>
    </footer>
  );
}
