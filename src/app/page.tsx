import { ensureDatabaseReady } from '@/db/bootstrap';
import { workspaceRepo } from '@/db/repositories';
import { WelcomeScreen, type WorkspaceSummary } from '@/features/welcome/welcome-screen';

/**
 * Entry route. Lists existing workspaces and offers workspace creation. We do
 * not auto-redirect: a researcher may keep several datasets and choose which to
 * open. Reads run server-side through the repository layer.
 */
export const dynamic = 'force-dynamic';

export default function HomePage() {
  ensureDatabaseReady();
  const workspaces: WorkspaceSummary[] = workspaceRepo.listWorkspaces().map((w) => ({
    id: w.id,
    name: w.name,
    sourceDir: w.sourceDir,
    outputDir: w.outputDir,
    schemaId: w.schemaId,
    updatedAt: w.updatedAt,
  }));

  return <WelcomeScreen workspaces={workspaces} />;
}
