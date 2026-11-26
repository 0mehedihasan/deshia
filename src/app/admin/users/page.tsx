import { redirect } from 'next/navigation';
import { isMultiUserEnabled } from '@/core/auth/config';
import { currentUser } from '@/core/auth/session';
import { UserManager } from '@/features/auth/user-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Users · DeshiA' };

export default function UsersPage() {
  if (!isMultiUserEnabled()) redirect('/');
  const user = currentUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/');
  return <UserManager />;
}
