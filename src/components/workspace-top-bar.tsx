'use client';

import Link from 'next/link';
import { ChevronLeft, LayoutDashboard, PenTool, Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

/**
 * Shared top bar for workspace screens. Keeps navigation and the theme control
 * consistent across dashboard, annotation, and settings.
 */
export function WorkspaceTopBar({
  workspaceId,
  name,
  active,
}: {
  workspaceId: string;
  name: string;
  active: 'dashboard' | 'annotate' | 'settings';
}) {
  const tabs = [
    { key: 'dashboard' as const, href: `/workspace/${workspaceId}`, label: 'Dashboard', icon: LayoutDashboard },
    { key: 'annotate' as const, href: `/workspace/${workspaceId}/annotate`, label: 'Annotate', icon: PenTool },
    { key: 'settings' as const, href: `/workspace/${workspaceId}/settings`, label: 'Settings', icon: Settings },
  ];

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-border-strong bg-elevated text-text-secondary transition-colors hover:border-primary hover:text-text"
          title="All workspaces"
        >
          <ChevronLeft size={16} />
        </Link>
        <span className="text-body font-semibold text-text">{name}</span>
      </div>

      <nav className="flex items-center gap-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-meta-lg font-medium transition-colors',
                t.key === active
                  ? 'bg-elevated text-text'
                  : 'text-text-secondary hover:bg-elevated hover:text-text',
              )}
            >
              <Icon size={15} />
              {t.label}
            </Link>
          );
        })}
        <div className="ml-2">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
