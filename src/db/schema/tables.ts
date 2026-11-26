import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    /** Format and MIME detected from file contents, not trusted filename suffixes. */
    detectedFormat: text('detected_format'),
    mimeType: text('mime_type'),
    colorMode: text('color_mode'),
    metadataStatus: text('metadata_status').notNull().default('PENDING'),
    metadataError: text('metadata_error'),
    /** IMAGE | VIDEO — videos are frame sources, never modified. */
    mediaKind: text('media_kind').notNull().default('IMAGE'),
    durationMs: integer('duration_ms'),
    fps: real('fps'),
    frameCount: integer('frame_count'),
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
    byMetadataStatus: index('images_metadata_status_idx').on(
      t.workspaceId,
      t.metadataStatus,
      t.datasetIndex,
    ),
    uniqIndex: uniqueIndex('images_dataset_index_uq').on(t.workspaceId, t.datasetIndex),
  }),
);

/** Source files with duplicate bytes, kept out of annotation rows by design. */
export const sourceImageDuplicates = sqliteTable(
  'source_image_duplicates',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    duplicateOfImageId: text('duplicate_of_image_id').references(() => images.id, {
      onDelete: 'set null',
    }),
    originalFilename: text('original_filename').notNull(),
    originalPath: text('original_path').notNull(),
    extension: text('extension').notNull(),
    detectedFormat: text('detected_format').notNull(),
    mimeType: text('mime_type').notNull(),
    colorMode: text('color_mode'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    fileSize: integer('file_size').notNull(),
    checksum: text('checksum').notNull(),
    modifiedAt: integer('modified_at').notNull(),
    discoveredAt: integer('discovered_at').notNull().default(now),
  },
  (t) => ({
    byWorkspace: index('source_image_duplicates_workspace_idx').on(t.workspaceId),
    byChecksum: index('source_image_duplicates_checksum_idx').on(t.workspaceId, t.checksum),
    uniquePath: uniqueIndex('source_image_duplicates_path_uq').on(t.workspaceId, t.originalPath),
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
    /** Incremented on every accepted draft save; guards concurrent writers. */
    saveRevision: integer('save_revision').notNull().default(0),
    /** DRAFT | SUBMITTED */
    status: text('status').notNull().default('DRAFT'),
    /** JSON: Record<componentKey, Visibility>. */
    componentVisibility: text('component_visibility').notNull().default('{}'),
    /** JSON: RedactionCircle[] — circular face/privacy regions to blur on export. */
    redactions: text('redactions').notNull().default('[]'),
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
    /** Optional cross-image entity identity; existing annotations remain NULL. */
    vehicleInstanceId: text('vehicle_instance_id'),
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
 * Generalized annotation objects: many independent, schema-labelled objects per
 * image. This is additive to the original component-box model so existing
 * Rickshaw annotations remain untouched. Geometry is stored as the canonical
 * JSON union; all columns mirror Rooyacvat/CVAT object state.
 */
export const annotationObjects = sqliteTable(
  'annotation_objects',
  {
    id: text('id').primaryKey(),
    imageId: text('image_id')
      .notNull()
      .references(() => images.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    schemaId: text('schema_id').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    labelId: text('label_id').notNull(),
    labelName: text('label_name').notNull(),
    /** One of GEOMETRY_TYPES, stored for fast reporting/filters. */
    geometryType: text('geometry_type').notNull(),
    /** Canonical Geometry union serialized with `serializeObjects`. */
    geometryJson: text('geometry_json').notNull(),
    attributesJson: text('attributes_json').notNull().default('{}'),
    occluded: integer('occluded', { mode: 'boolean' }).notNull().default(false),
    zOrder: integer('z_order').notNull().default(0),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    trackId: text('track_id'),
    frameNumber: integer('frame_number').notNull().default(0),
    outside: integer('outside', { mode: 'boolean' }).notNull().default(false),
    source: text('source').notNull().default('MANUAL'),
    score: real('score'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    byImage: index('objects_image_idx').on(t.imageId),
    byWorkspace: index('objects_workspace_idx').on(t.workspaceId),
    byTrack: index('objects_track_idx').on(t.trackId),
    byFrame: index('objects_frame_idx').on(t.imageId, t.frameNumber),
  }),
);

/**
 * User-authored recursive schemas with immutable published versions. The
 * ontology is DATA: annotations reference stable label ids inside a stamped
 * schema version, never hardcoded names.
 */
export const schemas = sqliteTable('schemas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  currentVersion: integer('current_version').notNull().default(1),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
});

export const schemaVersions = sqliteTable(
  'schema_versions',
  {
    id: text('id').primaryKey(),
    schemaId: text('schema_id')
      .notNull()
      .references(() => schemas.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** DRAFT | PUBLISHED — published rows are immutable via SQLite triggers. */
    status: text('status').notNull().default('DRAFT'),
    definitionJson: text('definition_json').notNull(),
    publishedAt: integer('published_at'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    bySchema: index('schema_versions_schema_idx').on(t.schemaId, t.version),
    uniqueVersion: uniqueIndex('schema_versions_version_uq').on(t.schemaId, t.version),
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

/**
 * Optional multi-user layer. DeshiA is single-user by default; these tables
 * are only exercised when DESHIA_MULTIUSER=1.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** ADMIN | ANNOTATOR | REVIEWER */
    role: text('role').notNull().default('ANNOTATOR'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_uq').on(t.email),
  }),
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Only the hash of the opaque cookie token is stored. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => ({
    tokenUnique: uniqueIndex('sessions_token_uq').on(t.tokenHash),
    byUser: index('sessions_user_idx').on(t.userId),
  }),
);

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;
export type ImageRow = typeof images.$inferSelect;
export type NewImageRow = typeof images.$inferInsert;
export type AnnotationRow = typeof annotations.$inferSelect;
export type NewAnnotationRow = typeof annotations.$inferInsert;
export type BoundingBoxRow = typeof boundingBoxes.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SchemaRow = typeof schemas.$inferSelect;
export type SchemaVersionRow = typeof schemaVersions.$inferSelect;
export type AnnotationObjectRow = typeof annotationObjects.$inferSelect;
export type NewAnnotationObjectRow = typeof annotationObjects.$inferInsert;
export type NewBoundingBoxRow = typeof boundingBoxes.$inferInsert;
export type AnnotationEventRow = typeof annotationEvents.$inferSelect;
export type ExportJobRow = typeof exportJobs.$inferSelect;
