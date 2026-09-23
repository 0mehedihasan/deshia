'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { Theme } from '@/types/domain';
import { cn } from '@/lib/utils';

/**
 * Theme control. Dark is the default; the `.light` class on <html> flips the
 * token set (see globals.css). "System" follows the OS preference. Preference
 * is kept in memory only for this session (no persistence in the sandbox/webview
 * storage restrictions) and applied imperatively to <html>.
 */

const ORDER: Theme[] = ['dark', 'light', 'system'];
const ICON: Record<Theme, React.ReactNode> = {
  dark: <Moon size={15} />,
  light: <Sun size={15} />,
  system: <Monitor size={15} />,
};

function apply(theme: Theme): void {
  const root = document.documentElement;
  const prefersLight =
    theme === 'light' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  root.classList.toggle('light', prefersLight);
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>('dark');

  React.useEffect(() => {
    apply(theme);
  }, [theme]);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${theme} (click to change)`}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded border border-border-strong bg-elevated px-2.5',
        'text-meta-lg capitalize text-text-secondary transition-colors hover:border-primary hover:text-text',
      )}
    >
      {ICON[theme]}
      <span className="font-medium">{theme}</span>
    </button>
  );
}
