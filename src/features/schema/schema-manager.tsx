'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  FolderPlus,
  Loader2,
  Plus,
  Save,
  Send,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WorkspaceTopBar } from '@/components/workspace-top-bar';
import { AppFooter } from '@/components/app-footer';
import { GEOMETRY_KINDS, type GeometryKind } from '@/core/geometry/types';
import {
  createGroup,
  createLabel,
  createEmptyRecursiveSchema,
  newNodeId,
  type RecursiveSchema,
  type SchemaNode,
} from '@/schemas/nodes';
import { ATTRIBUTE_TYPES, type AttributeDef, type AttributeType } from '@/schemas/attributes';
import {
  insertNode,
  moveNode,
  removeAttribute,
  removeNode,
  toggleGeometryType,
  upsertAttribute,
  updateNode,
} from '@/schemas/nodes-edit';
import { serializeRecursiveSchema } from '@/schemas/nodes-validate';
import type { SchemaSummary } from '@/db/repositories/schemas';
import {
  activateSchemaAction,
  createSchemaAction,
  createSchemaDraftAction,
  deleteSchemaAction,
  importSchemaAction,
  renameSchemaAction,
  loadSchemaAction,
  publishSchemaAction,
  updateSchemaDraftAction,
} from '@/app/actions/schemas';

/**
 * Local schema editor. A single user authors an ontology for their workspace:
 * groups and labels, geometry types, colors and attributes. Published versions
 * are immutable; a new draft is required for further edits, so annotations keep
 * resolving against the exact version they were stamped with.
 */

type Status = 'DRAFT' | 'PUBLISHED' | null;

function describeError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/load failed|failed to fetch|networkerror|network error/i.test(msg)) {
    return 'Lost connection to the local DeshiA server. Your local edits are still here — retry.';
  }
  return msg || fallback;
}

export function SchemaManager({
  workspaceId,
  workspaceName,
  schemas,
  initialSchemaId,
  initialDefinition,
  initialVersionId,
  initialStatus,
}: {
  workspaceId: string;
  workspaceName: string;
  schemas: SchemaSummary[];
  initialSchemaId: string | null;
  initialDefinition: RecursiveSchema | null;
  initialVersionId: string | null;
  initialStatus: Status;
}) {
  const [selectedId, setSelectedId] = React.useState(initialSchemaId);
  const [definition, setDefinition] = React.useState<RecursiveSchema | null>(initialDefinition);
  const [versionId, setVersionId] = React.useState(initialVersionId);
  const [status, setStatus] = React.useState<Status>(initialStatus);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState('');
  const [renameValue, setRenameValue] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const [importText, setImportText] = React.useState('');

  const editable = status === 'DRAFT';
  const activeSchema = schemas.find((s) => s.id === selectedId);

  const changeDefinition = (update: (current: RecursiveSchema) => RecursiveSchema) => {
    setDefinition((current) => (current ? update(current) : current));
    setDirty(true);
    setNotice(null);
  };

  const switchSchema = async (id: string) => {
    setSelectedId(id);
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await loadSchemaAction(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDefinition(res.definition);
      setVersionId(res.versionId);
      setStatus(res.status);
      setDirty(false);
      setRenameValue(schemas.find((s) => s.id === id)?.name ?? '');
    } catch (err) {
      setError(describeError(err, 'Could not load schema.'));
    } finally {
      setBusy(false);
    }
  };

  const run = async (
    action: () => Promise<{ ok: boolean; error?: string; id?: string }>,
    message: string,
    after?: (res: { ok: boolean; id?: string }) => void,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await action();
      if (!res.ok) setError(res.error ?? 'Operation failed.');
      else {
        setNotice(message);
        after?.(res);
      }
    } catch (err) {
      setError(describeError(err, 'Operation failed.'));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(
      async () => {
        const template = createEmptyRecursiveSchema(newName.trim() || 'New schema');
        return createSchemaAction({ workspaceId, name: template.name, definition: template });
      },
      'Schema created. Add labels, then publish it to use it for annotation.',
      (res) => {
        if (res.id) {
          window.location.reload();
        }
      },
    );

  const save = () => {
    if (!definition) return;
    if (!versionId || !editable) {
      setError('Publishing is irreversible. Create a new draft to edit this schema.');
      return;
    }
    void run(
      () =>
        updateSchemaDraftAction({
          workspaceId,
          versionId,
          definition: { ...definition, version: definition.version },
        }),
      'Draft saved.',
      () => setDirty(false),
    );
  };

  const publish = () => {
    if (!versionId) return;
    void run(
      () => publishSchemaAction({ workspaceId, versionId }),
      'Schema published. Annotations now reference this immutable version.',
      () => {
        setStatus('PUBLISHED');
        setDirty(false);
      },
    );
  };

  const newDraft = () => {
    if (!selectedId) return;
    void run(
      () => createSchemaDraftAction({ workspaceId, schemaId: selectedId }),
      'New draft created.',
      () => {
        window.location.reload();
      },
    );
  };

  const rename = () => {
    if (!selectedId || !renameValue.trim()) return;
    void run(
      () => renameSchemaAction({ workspaceId, schemaId: selectedId, name: renameValue }),
      'Schema renamed.',
      () => window.location.reload(),
    );
  };

  const remove = () => {
    if (!selectedId) return;
    void run(
      () => deleteSchemaAction({ workspaceId, schemaId: selectedId }),
      'Schema deleted.',
      () => window.location.reload(),
    );
  };

  const activate = () => {
    if (!selectedId || !activeSchema?.activeVersionId) return;
    void run(
      () =>
        activateSchemaAction({
          workspaceId,
          schemaId: selectedId,
          version: activeSchema.currentVersion,
        }),
      'Workspace now uses this schema.',
    );
  };

  const download = () => {
    if (!definition) return;
    const blob = new Blob([serializeRecursiveSchema(definition)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${definition.id || 'schema'}-v${definition.version}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const doImport = () => {
    void run(
      () => importSchemaAction({ workspaceId, json: importText }),
      'Schema imported and activated for this workspace.',
      () => {
        setImportOpen(false);
        setImportText('');
        window.location.reload();
      },
    );
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <WorkspaceTopBar workspaceId={workspaceId} name={workspaceName} active="schema" />
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-section font-semibold text-text">Label schemas</h1>
          {activeSchema && (
            <Badge tone={activeSchema.activeStatus === 'PUBLISHED' ? 'success' : 'warning'} mono>
              {activeSchema.activeStatus ?? 'NO VERSION'} · v{activeSchema.currentVersion}
            </Badge>
          )}
          {dirty && <Badge tone="warning">Unsaved edits</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
            value={selectedId ?? ''}
            onChange={(e) => void switchSchema(e.target.value)}
          >
            <option value="" disabled>
              Select schema…
            </option>
            {schemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.labelCount} labels)
              </option>
            ))}
          </select>
          <input
            className="w-40 rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New schema name"
          />
          <input
            className="w-40 rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-body text-text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Rename selected"
          />
          <Button size="sm" variant="ghost" onClick={rename} disabled={busy || !selectedId}>
            Rename
          </Button>
          <Button size="sm" variant="danger" onClick={remove} disabled={busy || !selectedId}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <Button size="sm" variant="secondary" onClick={create} disabled={busy}>
            <Plus className="h-3.5 w-3.5" />
            Create
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={activate}
            disabled={busy || !activeSchema?.activeVersionId}
          >
            <Check className="h-3.5 w-3.5" />
            Use in workspace
          </Button>
          <Button size="sm" variant="ghost" onClick={download} disabled={!definition}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setImportOpen((v) => !v)}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-error/40 bg-error/10 mx-6 mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-meta-lg text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="border-success/40 bg-success/10 mx-6 mt-3 rounded-md border px-3 py-2 text-meta-lg text-success">
          {notice}
        </div>
      )}

      {importOpen && (
        <div className="mx-6 mt-3 rounded-lg border border-border bg-surface p-3">
          <label className="mb-1 block text-meta font-medium uppercase tracking-wide text-muted">
            Paste a DeshiA recursive schema JSON
          </label>
          <textarea
            className="h-28 w-full rounded-md border border-border-strong bg-bg p-2 font-mono text-meta text-text"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{ "formatVersion": 1, … }'
          />
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={doImport}
            disabled={busy || !importText.trim()}
          >
            Import schema
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
        {!definition ? (
          <div className="grid flex-1 place-items-center text-center">
            <div className="max-w-md">
              <Tag className="mx-auto mb-3 h-10 w-10 text-muted" />
              <h2 className="text-section font-semibold text-text">No schema selected</h2>
              <p className="mt-2 text-body text-text-secondary">
                Create a schema above, or import one. Labels you define here become the objects you
                can annotate in the Objects editor.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-elevated p-3">
              <span className="font-mono text-meta text-muted">{definition.id}</span>
              <span className="text-meta text-text-secondary">v{definition.version}</span>
              <span className="text-meta text-muted">·</span>
              <span className="text-meta text-muted">
                {status === 'PUBLISHED' ? 'Published — immutable' : 'Draft — editable'}
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={save}
                  disabled={busy || !editable || !dirty}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save draft
                </Button>
                <Button size="sm" variant="success" onClick={publish} disabled={busy || !editable}>
                  <Send className="h-3.5 w-3.5" />
                  Publish
                </Button>
                <Button size="sm" variant="ghost" onClick={newDraft} disabled={busy || editable}>
                  New draft
                </Button>
              </div>
            </div>

            <div className="mb-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!editable}
                onClick={() =>
                  changeDefinition((d) => ({
                    ...d,
                    roots: insertNode(d.roots, null, createGroup('New group')),
                  }))
                }
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Add group
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!editable}
                onClick={() =>
                  changeDefinition((d) => ({
                    ...d,
                    roots: insertNode(d.roots, null, createLabel('New label')),
                  }))
                }
              >
                <Tag className="h-3.5 w-3.5" />
                Add label
              </Button>
            </div>

            <div className="space-y-2">
              {definition.roots.map((node, index) => (
                <NodeEditor
                  key={node.id}
                  node={node}
                  index={index}
                  count={definition.roots.length}
                  editable={editable}
                  onPatch={(patch) =>
                    changeDefinition((d) => ({ ...d, roots: updateNode(d.roots, node.id, patch) }))
                  }
                  onMove={(direction) =>
                    changeDefinition((d) => ({
                      ...d,
                      roots: moveNode(d.roots, node.id, direction),
                    }))
                  }
                  onDelete={() =>
                    changeDefinition((d) => ({ ...d, roots: removeNode(d.roots, node.id) }))
                  }
                  onInsert={(child) =>
                    changeDefinition((d) => ({
                      ...d,
                      roots: insertNode(d.roots, node.id, child),
                    }))
                  }
                  onChangeNode={(childId, patch) =>
                    changeDefinition((d) => ({ ...d, roots: updateNode(d.roots, childId, patch) }))
                  }
                  onMoveChild={(childId, direction) =>
                    changeDefinition((d) => ({
                      ...d,
                      roots: moveNode(d.roots, childId, direction),
                    }))
                  }
                  onDeleteChild={(childId) =>
                    changeDefinition((d) => ({ ...d, roots: removeNode(d.roots, childId) }))
                  }
                  onUpsertAttribute={(nodeId, attr) =>
                    changeDefinition((d) => ({
                      ...d,
                      roots: upsertAttribute(d.roots, nodeId, attr),
                    }))
                  }
                  onRemoveAttribute={(nodeId, attrId) =>
                    changeDefinition((d) => ({
                      ...d,
                      roots: removeAttribute(d.roots, nodeId, attrId),
                    }))
                  }
                  onToggleGeometry={(nodeId, kind) =>
                    changeDefinition((d) => ({
                      ...d,
                      roots: toggleGeometryType(d.roots, nodeId, kind),
                    }))
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
      <AppFooter compact />
    </div>
  );
}

interface NodeEditorProps {
  node: SchemaNode;
  index: number;
  count: number;
  editable: boolean;
  onPatch: (patch: Partial<SchemaNode>) => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
  onInsert: (node: SchemaNode) => void;
  onChangeNode: (id: string, patch: Partial<SchemaNode>) => void;
  onMoveChild: (id: string, direction: 'up' | 'down') => void;
  onDeleteChild: (id: string) => void;
  onUpsertAttribute: (id: string, attr: AttributeDef) => void;
  onRemoveAttribute: (id: string, attrId: string) => void;
  onToggleGeometry: (id: string, kind: GeometryKind) => void;
}

function NodeEditor(props: NodeEditorProps) {
  const { node, index, count, editable } = props;
  const [open, setOpen] = React.useState(true);
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-meta text-muted"
          aria-label={open ? 'Collapse node' : 'Expand node'}
        >
          {open ? '▾' : '▸'}
        </button>
        <Badge tone={node.kind === 'group' ? 'neutral' : 'primary'} mono>
          {node.kind}
        </Badge>
        <input
          className="w-48 rounded border border-border-strong bg-elevated px-2 py-1 text-meta-lg text-text disabled:opacity-60"
          value={node.name}
          disabled={!editable}
          onChange={(e) => props.onPatch({ name: e.target.value })}
        />
        <input
          type="color"
          className="h-7 w-9 rounded border border-border-strong bg-elevated"
          value={node.color ?? '#4DA3FF'}
          disabled={!editable}
          onChange={(e) => props.onPatch({ color: e.target.value })}
          aria-label="Label color"
        />
        <span className="font-mono text-meta text-muted">{node.id}</span>
        <Toggle
          label="Enabled"
          checked={node.enabled}
          disabled={!editable}
          onChange={(v) => props.onPatch({ enabled: v })}
        />
        <Toggle
          label="Archived"
          checked={node.archived}
          disabled={!editable}
          onChange={(v) => props.onPatch({ archived: v })}
        />
        <Toggle
          label="Visible"
          checked={node.visible}
          disabled={!editable}
          onChange={(v) => props.onPatch({ visible: v })}
        />
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={!editable || index === 0}
            onClick={() => props.onMove('up')}
            aria-label="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!editable || index === count - 1}
            onClick={() => props.onMove('down')}
            aria-label="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!editable}
            onClick={props.onDelete}
            aria-label="Delete node"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 p-3">
          {node.kind === 'label' && (
            <>
              <div className="flex items-center gap-4">
                <Toggle
                  label="Redact on export"
                  checked={node.redactOnExport === true}
                  disabled={!editable}
                  onChange={(v) => props.onPatch({ redactOnExport: v })}
                />
                <span className="text-meta text-muted">
                  Blurs this object&apos;s region in exported image copies only.
                </span>
              </div>
              <div>
                <p className="mb-1 text-meta font-medium uppercase tracking-wide text-muted">
                  Geometry types
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {GEOMETRY_KINDS.map((kind) => {
                    const on = (node.geometryTypes ?? []).includes(kind);
                    return (
                      <button
                        key={kind}
                        type="button"
                        disabled={!editable}
                        onClick={() => props.onToggleGeometry(node.id, kind)}
                        className={`rounded border px-2 py-0.5 font-mono text-meta transition-colors ${
                          on
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'border-border text-muted'
                        }`}
                      >
                        {kind}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1 text-meta font-medium uppercase tracking-wide text-muted">
                  Attributes
                </p>
                <div className="space-y-1.5">
                  {(node.attributes ?? []).map((attr) => (
                    <div
                      key={attr.id}
                      className="flex flex-wrap items-center gap-2 rounded border border-border bg-elevated p-2"
                    >
                      <input
                        className="w-28 rounded border border-border-strong bg-bg px-2 py-1 font-mono text-meta text-text"
                        value={attr.key}
                        disabled={!editable}
                        onChange={(e) =>
                          props.onUpsertAttribute(node.id, { ...attr, key: e.target.value })
                        }
                      />
                      <input
                        className="w-32 rounded border border-border-strong bg-bg px-2 py-1 text-meta text-text"
                        value={attr.label}
                        disabled={!editable}
                        onChange={(e) =>
                          props.onUpsertAttribute(node.id, { ...attr, label: e.target.value })
                        }
                      />
                      <select
                        className="rounded border border-border-strong bg-bg px-2 py-1 text-meta text-text"
                        value={attr.type}
                        disabled={!editable}
                        onChange={(e) =>
                          props.onUpsertAttribute(node.id, {
                            ...attr,
                            type: e.target.value as AttributeType,
                          })
                        }
                      >
                        {ATTRIBUTE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <Toggle
                        label="Required"
                        checked={attr.required === true}
                        disabled={!editable}
                        onChange={(v) => props.onUpsertAttribute(node.id, { ...attr, required: v })}
                      />
                      <Toggle
                        label="Mutable"
                        checked={attr.mutable !== false}
                        disabled={!editable}
                        onChange={(v) => props.onUpsertAttribute(node.id, { ...attr, mutable: v })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!editable}
                        onClick={() => props.onRemoveAttribute(node.id, attr.id)}
                        aria-label="Remove attribute"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!editable}
                    onClick={() =>
                      props.onUpsertAttribute(node.id, {
                        id: newNodeId('attr'),
                        key: 'attribute',
                        label: 'Attribute',
                        type: 'text',
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add attribute
                  </Button>
                </div>
              </div>
            </>
          )}
          {node.kind === 'group' && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!editable}
                onClick={() => props.onInsert(createGroup('New group'))}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Child group
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!editable}
                onClick={() => props.onInsert(createLabel('New label'))}
              >
                <Tag className="h-3.5 w-3.5" />
                Child label
              </Button>
            </div>
          )}
          {node.children.length > 0 && (
            <div className="ml-4 space-y-2 border-l border-border pl-3">
              {node.children.map((child, i) => (
                <NodeEditor
                  key={child.id}
                  node={child}
                  index={i}
                  count={node.children.length}
                  editable={editable}
                  onPatch={(patch) => props.onChangeNode(child.id, patch)}
                  onMove={(direction) => props.onMoveChild(child.id, direction)}
                  onDelete={() => props.onDeleteChild(child.id)}
                  onInsert={(grandchild) =>
                    props.onChangeNode(child.id, {
                      children: [...child.children, grandchild],
                    })
                  }
                  onChangeNode={(id, patch) => props.onChangeNode(id, patch)}
                  onMoveChild={(id, direction) => props.onMoveChild(id, direction)}
                  onDeleteChild={(id) => props.onDeleteChild(id)}
                  onUpsertAttribute={props.onUpsertAttribute}
                  onRemoveAttribute={props.onRemoveAttribute}
                  onToggleGeometry={props.onToggleGeometry}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-meta text-text-secondary">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
