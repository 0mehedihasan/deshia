'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogIn, LogOut, Users } from 'lucide-react';
import { currentUserAction, logoutAction } from '@/app/actions/auth';

/** Visible only when DESHIA_MULTIUSER=1. Renders nothing in the default build. */
export function AuthStatus() {
  const [state, setState] = React.useState<{
    enabled: boolean;
    user: { name: string; role: string } | null;
  } | null>(null);

  React.useEffect(() => {
    let active = true;
    void currentUserAction().then((res) => active && setState(res));
    return () => {
      active = false;
    };
  }, []);

  if (!state?.enabled) return null;

  return (
    <div className="fixed bottom-2 right-3 z-40 flex items-center gap-2 rounded-md border border-border-strong bg-elevated px-2 py-1 text-meta text-text-secondary shadow">
      {state.user ? (
        <>
          <span className="font-mono text-text">{state.user.name}</span>
          <Badge>{state.user.role}</Badge>
          {state.user.role === 'ADMIN' && (
            <Link href="/admin/users" title="Users">
              <Users className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => void logoutAction().then(() => window.location.reload())}
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <Link href="/login" className="inline-flex items-center gap-1">
          <LogIn className="h-3.5 w-3.5" />
          Sign in
        </Link>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-primary/15 rounded px-1.5 py-0.5 font-mono text-primary">{children}</span>
  );
}
