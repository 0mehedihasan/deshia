import { isMultiUserEnabled } from '@/core/auth/config';
import { LoginForm } from '@/features/auth/login-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · DeshiA' };

export default function LoginPage() {
  const enabled = isMultiUserEnabled();
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h1 className="text-section font-semibold text-text">Sign in to DeshiA</h1>
        {enabled ? (
          <LoginForm />
        ) : (
          <p className="mt-3 text-body text-text-secondary">
            Multi-user mode is off. Set{' '}
            <span className="font-mono text-primary">DESHIA_MULTIUSER=1</span> and restart DeshiA to
            enable sign-in.
          </p>
        )}
      </div>
    </main>
  );
}
