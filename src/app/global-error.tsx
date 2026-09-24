'use client';

import * as React from 'react';

/**
 * Root (global) error boundary. Replaces the root layout when an error is thrown
 * above/within it, so it must render its own <html>/<body>. Styles are inlined
 * (dark tokens from the design system) because the app stylesheet may not be
 * present when the root itself fails. Always offers a working recovery button —
 * the UI must never freeze with no way out.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('DeshiA fatal error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0B0D10',
          color: '#F5F7FA',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 8px' }}>
            DeshiA could not start this screen
          </h2>
          <p style={{ color: '#B1BAC4', lineHeight: 1.5, margin: '0 0 16px' }}>
            An unexpected error occurred. Your saved work on disk is not affected. Reload to
            continue.
          </p>
          {error.message ? (
            <pre
              style={{
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#11151A',
                border: '1px solid #252B33',
                borderRadius: 8,
                padding: '8px 12px',
                color: '#7D8792',
                fontSize: '0.8125rem',
                margin: '0 0 16px',
              }}
            >
              {error.message}
            </pre>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                borderRadius: 8,
                border: '1px solid #343B45',
                background: '#171C22',
                color: '#F5F7FA',
                padding: '8px 16px',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Reload app
            </button>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                borderRadius: 8,
                border: '1px solid #4DA3FF',
                background: '#4DA3FF',
                color: '#0B0D10',
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
