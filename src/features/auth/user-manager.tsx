'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { createUserAction, listUsersAction } from '@/app/actions/auth';
import { ROLES } from '@/core/auth/config';

interface ListedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
}

export function UserManager() {
  const [users, setUsers] = React.useState<ListedUser[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({
    email: '',
    name: '',
    password: '',
    role: 'ANNOTATOR',
  });

  const refresh = React.useCallback(() => {
    void listUsersAction().then((res) => {
      if (res.ok && 'users' in res) setUsers(res.users);
      else setError('error' in res ? res.error ?? 'Could not list users.' : 'Could not list users.');
    });
  }, []);

  React.useEffect(refresh, [refresh]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await createUserAction(form);
      if (!res.ok) setError(res.error ?? 'Could not create user.');
      else {
        setForm({ email: '', name: '', password: '', role: 'ANNOTATOR' });
        refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-section font-semibold text-text">Users</h1>
          <p className="mt-1 text-meta text-muted">Optional multi-user mode · administrator only</p>
        </div>
        <Link href="/" className="text-meta text-text-secondary hover:text-text">
          Back to workspaces
        </Link>
      </div>
      <form className="space-y-3 rounded-xl border border-border bg-surface p-4" onSubmit={create}>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            type="email"
            placeholder="Email"
            className="rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            placeholder="Display name"
            className="rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            required
            type="password"
            placeholder="Password (8+ chars)"
            className="rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select
            className="rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {ROLES.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-meta text-error">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create user
        </Button>
      </form>
      <ul className="space-y-2">
        {users.map((user) => (
          <li
            key={user.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-body text-text">{user.name}</p>
              <p className="truncate font-mono text-meta text-muted">{user.email}</p>
            </div>
            <span className="font-mono text-meta text-primary">{user.role}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
