import { z } from 'zod';
import { VISIBILITY_STATES } from '@/types/domain';
import type { AnnotationSchema } from './types';

/**
 * Runtime validation for annotation schemas. Imported/user-supplied schemas are
 * untrusted input, so every schema is validated before the engine uses it.
 */

const KEY_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

const visibilitySchema = z.enum(VISIBILITY_STATES);

const componentSchema = z
  .object({
    key: z.string().min(1).max(64).regex(KEY_RE, 'component key must be snake_case'),
    label: z.string().min(1).max(120),
    required: z.boolean(),
    box: z.enum(['required', 'optional', 'none']),
    allowedVisibilities: z.array(visibilitySchema).min(1),
    hint: z.string().max(240).optional(),
  })
  .strict();

const viewSchema = z
  .object({
    key: z.string().min(1).max(64).regex(KEY_RE),
    label: z.string().min(1).max(120),
    components: z.array(componentSchema).max(64),
  })
  .strict()
  .refine((v) => uniqueKeys(v.components.map((c) => c.key)), {
    message: 'component keys must be unique within a view',
  });

const classSchema = z
  .object({
    key: z.string().min(1).max(64).regex(KEY_RE),
    label: z.string().min(1).max(120),
    views: z.array(viewSchema).min(1).max(32),
  })
  .strict()
  .refine((c) => uniqueKeys(c.views.map((v) => v.key)), {
    message: 'view keys must be unique within a class',
  });

export const annotationSchemaSchema = z
  .object({
    id: z.string().min(1).max(64).regex(KEY_RE),
    version: z.number().int().positive(),
    name: z.string().min(1).max(160),
    description: z.string().max(1000).optional(),
    classes: z.array(classSchema).min(1).max(64),
  })
  .strict()
  .refine((s) => uniqueKeys(s.classes.map((c) => c.key)), {
    message: 'class keys must be unique within a schema',
  });

function uniqueKeys(keys: string[]): boolean {
  return new Set(keys).size === keys.length;
}

export type SchemaValidationResult =
  | { ok: true; schema: AnnotationSchema }
  | { ok: false; errors: string[] };

/** Validate an unknown value as an AnnotationSchema. Never throws. */
export function validateSchema(input: unknown): SchemaValidationResult {
  const parsed = annotationSchemaSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, schema: parsed.data as AnnotationSchema };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
    ),
  };
}

/** Parse a JSON string into a validated schema. Never throws. */
export function parseSchemaJson(json: string): SchemaValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    return { ok: false, errors: [`invalid JSON: ${(err as Error).message}`] };
  }
  return validateSchema(value);
}
