import { notFound } from 'next/navigation';
import { ensureDatabaseReady } from '@/db/bootstrap';
import { schemaRepo, workspaceRepo } from '@/db/repositories';
import { getBuiltInSchema } from '@/schemas';
import { migrateFlatToRecursive } from '@/schemas/migrate';
import { SchemaManager } from '@/features/schema/schema-manager';

export const dynamic = 'force-dynamic';

export default function SchemaPage({ params }: { params: { id: string } }) {
  ensureDatabaseReady();
  const ws = workspaceRepo.getWorkspace(params.id);
  if (!ws) notFound();

  const summaries = schemaRepo.listSchemas();
  const isCustom = summaries.some((s) => s.id === ws.schemaId);
  const definition = isCustom
    ? schemaRepo.getDefinition(ws.schemaId)
    : (() => {
        const builtIn = getBuiltInSchema(ws.schemaId);
        return builtIn ? migrateFlatToRecursive(builtIn) : null;
      })();
  const version = isCustom ? schemaRepo.getActiveVersion(ws.schemaId) : undefined;
  // Built-in ontologies are immutable; show them as published/read-only.
  const status = isCustom
    ? version?.status === 'PUBLISHED'
      ? 'PUBLISHED'
      : definition
        ? 'DRAFT'
        : null
    : 'PUBLISHED';

  return (
    <SchemaManager
      workspaceId={ws.id}
      workspaceName={ws.name}
      schemas={summaries}
      initialSchemaId={ws.schemaId}
      initialDefinition={definition}
      initialVersionId={version?.id ?? null}
      initialStatus={status}
    />
  );
}
