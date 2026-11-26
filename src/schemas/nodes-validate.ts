import { z } from 'zod';
import { GEOMETRY_KINDS } from '@/core/geometry/types';
import { ATTRIBUTE_TYPES } from './attributes';
import { SCHEMA_FORMAT_VERSION, type RecursiveSchema, type SchemaNode } from './nodes';
import { findDuplicateIds } from './traverse';

/**
 * Runtime validation for IMPORTED recursive schemas. Imported JSON is untrusted
 * input, so it is fully validated before the app trusts it. Errors are phrased
 * for humans (invalid structure, missing fields, duplicate ids, unsupported
 * version). Never throws.
 */

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const attributeOptionSchema = z
  .object({ value: z.string().min(1), label: z.string().optional() })
  .strict();

const attributeDefSchema = z
  .object({
    id: z.string().min(1),
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(ATTRIBUTE_TYPES),
    required: z.boolean().optional(),
    mutable: z.boolean().optional(),
    defaultValue: z
      .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
      .optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    options: z.array(attributeOptionSchema).optional(),
    help: z.string().optional(),
  })
  .strict();

const schemaNodeSchema: z.ZodType<SchemaNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      kind: z.enum(['group', 'label']),
      name: z.string().min(1),
      description: z.string().optional(),
      color: z.string().regex(HEX, 'color must be a hex code like #4DA3FF').optional(),
      enabled: z.boolean(),
      archived: z.boolean(),
      visible: z.boolean(),
      geometryTypes: z.array(z.enum(GEOMETRY_KINDS)).optional(),
      attributes: z.array(attributeDefSchema).optional(),
      redactOnExport: z.boolean().optional(),
      annotatable: z.boolean().optional(),
      legacyKey: z.string().optional(),
      children: z.array(schemaNodeSchema),
    })
    .strict(),
);

const recursiveSchemaSchema = z
  .object({
    formatVersion: z.number().int().positive(),
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    version: z.number().int().positive(),
    roots: z.array(schemaNodeSchema),
  })
  .strict();

export type SchemaValidationResult =
  | { ok: true; schema: RecursiveSchema }
  | { ok: false; errors: string[] };

/** Validate an unknown value as a RecursiveSchema. Never throws. */
export function validateRecursiveSchema(input: unknown): SchemaValidationResult {
  const parsed = recursiveSchemaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const schema = parsed.data as RecursiveSchema;

  // Version gate: refuse to silently misread a newer format.
  if (schema.formatVersion > SCHEMA_FORMAT_VERSION) {
    return {
      ok: false,
      errors: [
        `unsupported schema format version ${schema.formatVersion} (this build supports up to ${SCHEMA_FORMAT_VERSION}). Update DeshiA to open it.`,
      ],
    };
  }

  // Stable-identity invariant: ids must be unique across the whole forest.
  const dupes = findDuplicateIds(schema.roots);
  if (dupes.length > 0) {
    return { ok: false, errors: [`duplicate node ids found: ${dupes.join(', ')}`] };
  }

  return { ok: true, schema };
}

/** Parse + validate a JSON string into a schema. Never throws. */
export function parseRecursiveSchemaJson(json: string): SchemaValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    return { ok: false, errors: [`invalid JSON: ${(err as Error).message}`] };
  }
  return validateRecursiveSchema(value);
}

/** Serialize a schema to pretty JSON for export (native, lossless). */
export function serializeRecursiveSchema(schema: RecursiveSchema): string {
  return JSON.stringify(schema, null, 2);
}
