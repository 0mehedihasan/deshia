import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * DeshiA persistence schema (SQLite / Drizzle).
 *
 * Design rules:
 *  - Every foreign key is declared and indexed.
 *  - Timestamps are epoch milliseconds (integer) for portability.
 *  - Annotation data is never destructively overwritten: submissions bump an
 *    integer version and archived rows are retained (see annotationEvents).
 *  - The dataset ontology is NOT encoded here; class/view/component keys are
 *    free-form strings resolved against a versioned AnnotationSchema.
 */

const now = sql`(unixepoch() * 1000)`;

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourceDir: text('source_dir').notNull(),
  outputDir: text('output_dir').notNull(),
  schemaId: text('schema_id').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
});

export const images = sqliteTable(
  'images',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Stable, monotonic per-workspace index used for output file numbering. */
    datasetIndex: integer('dataset_index').notNull(),
    originalFilename: text('original_filename').notNull(),
    originalPath: text('original_path').notNull(),
    extension: text('extension').notNull(),
    fileSize: integer('file_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    checksum: text('checksum').notNull(),
    modifiedAt: integer('modified_at').notNull(),
    status: text('status').notNull().default('PENDING'),
    /** True when another image with the same checksum was seen first. */
    isDuplicate: integer('is_duplicate', { mode: 'boolean' }).notNull().default(false),
    duplicateOfId: text('duplicate_of_id'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    byWorkspace: index('images_workspace_idx').on(t.workspaceId),
    byStatus: index('images_status_idx').on(t.workspaceId, t.status),
    byChecksum: index('images_checksum_idx').on(t.workspaceId, t.checksum),
    uniqIndex: uniqueIndex('images_dataset_index_uq').on(t.workspaceId, t.datasetIndex),
  }),
);

export const annotations = sqliteTable(
  'annotations',
  {
    id: text('id').primaryKey(),
    imageId: text('image_id')
      .notNull()
      .references(() => images.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    classKey: text('class_key'),
    viewKey: text('view_key'),
    schemaId: text('schema_id').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    annotationVersion: integer('annotation_version').notNull().default(1),
    /** DRAFT | SUBMITTED */
    status: text('status').notNull().default('DRAFT'),
    /** JSON: Record<componentKey, Visibility>. */
    componentVisibility: text('component_visibility').notNull().default('{}'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    byImage: uniqueIndex('annotations_image_uq').on(t.imageId),
    byWorkspace: index('annotations_workspace_idx').on(t.workspaceId),
    byStatus: index('annotations_status_idx').on(t.workspaceId, t.status),
  }),
);

export const boundingBoxes = sqliteTable(
  'bounding_boxes',
  {
    id: text('id').primaryKey(),
    annotationId: text('annotation_id')
      .notNull()
      .references(() => annotations.id, { onDelete: 'cascade' }),
    componentKey: text('component_key').notNull(),
    /** Normalized coordinates in [0,1]. Invariant enforced in the domain layer. */
    xMin: real('x_min').notNull(),
    yMin: real('y_min').notNull(),
    xMax: real('x_max').notNull(),
    yMax: real('y_max').notNull(),
    visibility: text('visibility').notNull().default('VISIBLE'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    byAnnotation: index('boxes_annotation_idx').on(t.annotationId),
    byComponent: index('boxes_component_idx').on(t.annotationId, t.componentKey),
  }),
);

/**
 * Append-only audit trail. Every meaningful mutation (draft save, submit,
 * archive) writes a row so annotation history is recoverable and never lost.
 */
export const annotationEvents = sqliteTable(
  'annotation_events',
  {
    id: text('id').primaryKey(),
    imageId: text('image_id')
      .notNull()
      .references(() => images.id, { onDelete: 'cascade' }),
    annotationId: text('annotation_id'),
    /** e.g. DRAFT_SAVED | SUBMITTED | ARCHIVED | RECOVERED */
    kind: text('kind').notNull(),
    /** JSON snapshot payload for full recoverability. */
    payload: text('payload').notNull().default('{}'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => ({
    byImage: index('events_image_idx').on(t.imageId),
    byKind: index('events_kind_idx').on(t.kind),
  }),
);

export const exportJobs = sqliteTable(
  'export_jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    imageId: text('image_id').references(() => images.id, { onDelete: 'set null' }),
    format: text('format').notNull().default('PASCAL_VOC'),
    /** PENDING | SUCCEEDED | FAILED */
    status: text('status').notNull().default('PENDING'),
    /** Relative output paths written, JSON array. */
    outputs: text('outputs').notNull().default('[]'),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    byWorkspace: index('export_jobs_workspace_idx').on(t.workspaceId),
    byImage: index('export_jobs_image_idx').on(t.imageId),
  }),
);

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;
export type ImageRow = typeof images.$inferSelect;
export type NewImageRow = typeof images.$inferInsert;
export type AnnotationRow = typeof annotations.$inferSelect;
export type NewAnnotationRow = typeof annotations.$inferInsert;
export type BoundingBoxRow = typeof boundingBoxes.$inferSelect;
export type NewBoundingBoxRow = typeof boundingBoxes.$inferInsert;
export type AnnotationEventRow = typeof annotationEvents.$inferSelect;
export type ExportJobRow = typeof exportJobs.$inferSelect;
