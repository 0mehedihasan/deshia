/**
 * Per-label custom attributes — a general-purpose, domain-neutral field system.
 * No project is forced to use any particular attribute; a schema author opts in
 * per label. Attribute VALUES are stored with each annotation object.
 */

export const ATTRIBUTE_TYPES = [
  'text',
  'integer',
  'decimal',
  'boolean',
  'single_choice',
  'multi_choice',
  'enum',
] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export interface AttributeOption {
  value: string;
  label?: string;
}

export interface AttributeDef {
  /** Stable id (reference target). */
  id: string;
  /** Machine key, unique within its label. */
  key: string;
  /** Human label. */
  label: string;
  type: AttributeType;
  required?: boolean;
  /** When false, the value is locked after object creation (CVAT `mutable`). */
  mutable?: boolean;
  defaultValue?: AttributeValue;
  /** Numeric bounds (integer/decimal only). */
  min?: number;
  max?: number;
  /** Allowed options (choice/enum types). */
  options?: AttributeOption[];
  help?: string;
}

/** A stored attribute value. `null` means "unset". */
export type AttributeValue = string | number | boolean | string[] | null;

export interface AttributeIssue {
  attributeKey: string;
  code: string;
  message: string;
}

function isEmpty(v: AttributeValue): boolean {
  return v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/**
 * Validate a single attribute value against its definition. Returns an issue or
 * null. Never throws. Domain-agnostic: the rules come entirely from the def.
 */
export function validateAttributeValue(
  def: AttributeDef,
  value: AttributeValue,
): AttributeIssue | null {
  const fail = (code: string, message: string): AttributeIssue => ({
    attributeKey: def.key,
    code,
    message,
  });

  if (isEmpty(value)) {
    if (def.required) return fail('REQUIRED', `"${def.label}" is required.`);
    return null;
  }

  const optionValues = new Set((def.options ?? []).map((o) => o.value));

  switch (def.type) {
    case 'text':
      if (typeof value !== 'string') return fail('TYPE', `"${def.label}" must be text.`);
      return null;
    case 'boolean':
      if (typeof value !== 'boolean') return fail('TYPE', `"${def.label}" must be true/false.`);
      return null;
    case 'integer':
    case 'decimal': {
      if (typeof value !== 'number' || !Number.isFinite(value))
        return fail('TYPE', `"${def.label}" must be a number.`);
      if (def.type === 'integer' && !Number.isInteger(value))
        return fail('NOT_INTEGER', `"${def.label}" must be a whole number.`);
      if (def.min !== undefined && value < def.min)
        return fail('MIN', `"${def.label}" must be >= ${def.min}.`);
      if (def.max !== undefined && value > def.max)
        return fail('MAX', `"${def.label}" must be <= ${def.max}.`);
      return null;
    }
    case 'single_choice':
    case 'enum':
      if (typeof value !== 'string' || !optionValues.has(value))
        return fail('OPTION', `"${def.label}" must be one of the allowed options.`);
      return null;
    case 'multi_choice':
      if (!Array.isArray(value) || value.some((v) => !optionValues.has(v)))
        return fail('OPTION', `"${def.label}" contains a value outside the allowed options.`);
      return null;
    default:
      return null;
  }
}

/** Validate a bag of values against a label's attribute defs. */
export function validateAttributes(
  defs: readonly AttributeDef[],
  values: Record<string, AttributeValue>,
): AttributeIssue[] {
  const issues: AttributeIssue[] = [];
  for (const def of defs) {
    const issue = validateAttributeValue(def, values[def.key] ?? null);
    if (issue) issues.push(issue);
  }
  return issues;
}

/** Build the default value bag for a set of attribute defs. */
export function defaultAttributeValues(
  defs: readonly AttributeDef[],
): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const def of defs) {
    out[def.key] = def.defaultValue ?? (def.type === 'multi_choice' ? [] : null);
  }
  return out;
}
