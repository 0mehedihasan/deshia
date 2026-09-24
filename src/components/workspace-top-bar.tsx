'use client';

import Link from 'next/link';
import { LayoutDashboard, PenTool, Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { DeshiaLogo } from '@/components/deshia-logo';
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
    {
      key: 'dashboard' as const,
      href: `/workspace/${workspaceId}`,
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      key: 'annotate' as const,
      href: `/workspace/${workspaceId}/annotate`,
      label: 'Annotate',
      icon: PenTool,
    },
    {
      key: 'settings' as const,
      href: `/workspace/${workspaceId}/settings`,
      label: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          title="All workspaces"
          className="inline-flex shrink-0 items-center gap-2 rounded px-1 py-0.5 text-text transition-colors hover:text-primary focus-visible:outline-none"
        >
          <DeshiaLogo size={20} className="shrink-0" />
          <span className="text-body font-semibold tracking-tight">DeshiA</span>
        </Link>
        <span className="text-border-strong" aria-hidden>
          /
        </span>
        <span className="min-w-0 truncate text-body font-medium text-text-secondary">{name}</span>
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
