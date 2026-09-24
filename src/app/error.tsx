'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Route-segment error boundary. Catches render/runtime errors within the app so
 * a thrown exception shows a recoverable screen with a working button instead of
 * a frozen, unresponsive UI (see .claude/CLAUDE.md — never wedge the UI). The
 * root layout still renders around this, so design tokens are available.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surface for the launch log / devtools; never swallow silently.
    console.error('DeshiA route error:', error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-error" />
        <h2 className="text-section font-semibold text-text">Something went wrong</h2>
        <p className="mt-2 text-body text-text-secondary">
          DeshiA hit an unexpected error on this screen. Your saved work is safe on disk. Try again,
          and if it keeps happening, reload the app.
        </p>
        {error.message && (
          <p className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-left font-mono text-meta text-muted">
            {error.message}
          </p>
        )}
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload app
          </Button>
          <Button variant="primary" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
