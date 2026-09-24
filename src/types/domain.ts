/**
 * Shared domain type vocabulary for DeshiA.
 *
 * These are the *runtime* domain types used across the application, DB layer,
 * and core engine. Persisted rows (Drizzle `$inferSelect`) are separate and
 * live in `db/schema`; mapping happens in the repositories.
 */

/** Lifecycle status of a single image in a workspace. */
export const IMAGE_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'ANNOTATED',
  'SKIPPED',
  'ERROR',
] as const;
export type ImageStatus = (typeof IMAGE_STATUSES)[number];

/** Component visibility state within an annotation. Schema decides box rules. */
export const VISIBILITY_STATES = ['VISIBLE', 'OCCLUDED', 'NOT_VISIBLE'] as const;
export type Visibility = (typeof VISIBILITY_STATES)[number];

/** Annotation lifecycle. DRAFT is the recoverable in-progress state. */
export const ANNOTATION_STATUSES = ['DRAFT', 'SUBMITTED'] as const;
export type AnnotationStatus = (typeof ANNOTATION_STATUSES)[number];

/** Supported source image extensions (lower-case, no dot). */
export const SUPPORTED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/** Export formats emitted on every submission: Pascal VOC XML, COCO JSON, YOLO txt. */
export const EXPORT_FORMATS = ['PASCAL_VOC', 'COCO', 'YOLO'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * A bounding box in normalized image coordinates (0..1). This is the canonical
 * internal representation; pixel conversion happens only at the canvas and
 * exporter edges. Invariant: 0 <= xMin < xMax <= 1 and 0 <= yMin < yMax <= 1.
 */
export interface NormalizedBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/** A bounding box in absolute pixels for a specific image size. */
export interface PixelBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** A single annotated box tied to a schema component. */
export interface AnnotationBox {
  id: string;
  /** Stable component key from the schema (e.g. "rickshaw_body"). */
  componentKey: string;
  box: NormalizedBox;
  visibility: Visibility;
  createdAt: number;
  updatedAt: number;
}

/** The full working annotation state for one image (draft or submitted). */
export interface AnnotationState {
  imageId: string;
  schemaId: string;
  schemaVersion: number;
  classKey: string | null;
  viewKey: string | null;
  /** Per-component visibility, even for components with zero boxes. */
  componentVisibility: Record<string, Visibility>;
  boxes: AnnotationBox[];
  status: AnnotationStatus;
  annotationVersion: number;
  createdAt: number;
  updatedAt: number;
}

/** Scanner-level classification of a discovered file. */
export const SCAN_ENTRY_KINDS = [
  'SUPPORTED',
  'DUPLICATE',
  'UNSUPPORTED',
  'ERROR',
] as const;
export type ScanEntryKind = (typeof SCAN_ENTRY_KINDS)[number];

export type Theme = 'dark' | 'light' | 'system';
