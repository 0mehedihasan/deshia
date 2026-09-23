import { notFound } from 'next/navigation';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { workspaceRepo } from '@/db/repositories';
import { getBuiltInSchema } from '@/schemas';
import { Settings } from '@/features/settings/settings';

export const dynamic = 'force-dynamic';

export default function SettingsPage({ params }: { params: { id: string } }) {
  ensureDatabaseReady();
  const ws = workspaceRepo.getWorkspace(params.id);
  if (!ws) notFound();
  const schema = getBuiltInSchema(ws.schemaId);

  return (
    <Settings
      workspace={{
        id: ws.id,
        name: ws.name,
        sourceDir: ws.sourceDir,
        outputDir: ws.outputDir,
        schemaId: ws.schemaId,
        schemaVersion: ws.schemaVersion,
      }}
      schema={
        schema
          ? {
              name: schema.name,
              description: schema.description ?? '',
              classes: schema.classes.map((c) => ({
                key: c.key,
                label: c.label,
                views: c.views.map((v) => ({
                  key: v.key,
                  label: v.label,
                  components: v.components.map((cp) => ({
                    key: cp.key,
                    label: cp.label,
                    required: cp.required,
                    box: cp.box,
                  })),
                })),
              })),
            }
          : null
      }
    />
  );
}
