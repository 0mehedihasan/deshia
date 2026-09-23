import { RICKSHAW_SCHEMA } from './rickshaw';
import type { AnnotationSchema } from './types';

export * from './types';
export * from './validate';
export { RICKSHAW_SCHEMA };

/** Schemas bundled with DeshiA, keyed by schema id. */
export const BUILT_IN_SCHEMAS: Record<string, AnnotationSchema> = {
  [RICKSHAW_SCHEMA.id]: RICKSHAW_SCHEMA,
};

export function getBuiltInSchema(id: string): AnnotationSchema | undefined {
  return BUILT_IN_SCHEMAS[id];
}

export function listBuiltInSchemas(): AnnotationSchema[] {
  return Object.values(BUILT_IN_SCHEMAS);
}
