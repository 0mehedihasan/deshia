/**
 * DeshiA geometry engine — public surface.
 *
 * Canonical geometry is normalized (top-left origin, x→right, y→down). Rotated
 * boxes carry a clockwise-positive degree angle about their center. See
 * `types.ts` for the full convention and `docs/geometry-and-schema.md` for the
 * narrative. All helpers are pure and framework-agnostic.
 */
export * from './types';
export * from './rotated-box';
export * from './shapes';
export * from './hit-test';
export * from './convert';
export * from './transform';
export * from './distance';
export * from './extended-shapes';
