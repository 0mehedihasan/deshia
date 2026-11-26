'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { bootstrapAdminAction, loginAction } from '@/app/actions/auth';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [bootstrapping, setBootstrapping] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await loginAction(email, password);
      if (!res.ok) setError(res.error ?? 'Sign-in failed.');
      else router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const bootstrap = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await bootstrapAdminAction({ email, name: name || email, password });
      if (!res.ok) setError(res.error ?? 'Could not create administrator.');
      else {
        setBootstrapping(false);
        setError('Administrator created. Sign in now.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mt-4 space-y-3" onSubmit={submit}>
      {bootstrapping && (
        <input
          className="w-full rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
          placeholder="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <input
        type="email"
        required
        placeholder="Email"
        className="w-full rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        required
        placeholder="Password"
        className="w-full rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-meta text-error">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Sign in
      </Button>
      <button
        type="button"
        onClick={() => setBootstrapping((v) => !v)}
        className="w-full text-meta text-muted hover:text-text"
      >
        {bootstrapping ? 'Cancel first-run setup' : 'First run: create administrator'}
      </button>
      {bootstrapping && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => void bootstrap()}
          disabled={busy}
        >
          Create administrator
        </Button>
      )}
    </form>
  );
}
