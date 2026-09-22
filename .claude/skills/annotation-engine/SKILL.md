---
name: annotation-engine
description: Working on DeshiA's schema-driven annotation engine, bounding-box math, visibility rules, and the deterministic box-color palette.
---

# Annotation Engine — DeshiA

The engine turns a **schema** into an annotation experience. It must never
hardcode Rickshaw/E-Rickshaw/Front/Side/Back/Chain/Motor — those are schema data.

## Files
- `src/core/annotation/engine.ts` — resolve available views for a class,
  components for a (class, view), required vs optional, visibility & box rules.
- `src/core/annotation/bbox.ts` — normalize ↔ pixel conversion, clamping,
  geometry validation.
- `src/core/annotation/palette.ts` — deterministic per-component colors.
- `src/core/annotation/validate.ts` — pre-submit validation.
- `src/schemas/*` — schema types, zod validation, built-in Rickshaw schema.

## Engine contract
Input: `AnnotationSchema` + current `classKey`/`viewKey`. Output: the ordered
component descriptors the UI renders (key, label, required, box rule, allowed
visibilities). Changing class recomputes views; changing view recomputes
components. The UI is a pure function of engine output — no ontology in JSX.

## Bounding boxes
Canonical form is **normalized** `{xMin,yMin,xMax,yMax}` in `[0,1]`. Enforce
`0 <= xMin < xMax <= 1` and `0 <= yMin < yMax <= 1`; clamp to image on create/
move/resize so boxes never leave the frame. Convert to pixels only at the canvas
and to integer pixels only at VOC export.

## Colors (see also golden rule #6 in CLAUDE.md)
`colorForComponent(componentKey, allActiveKeys)` returns a stable color such
that distinct components never collide. Base palette is a hand-tuned,
perceptually separated, color-blind-aware set (blue, orange, green, purple,
cyan, magenta, yellow, red, teal, pink, lime, indigo). Beyond the base set,
rotate hue by the golden angle (137.5°) deterministically. Same component key
always maps to the same color within a session. Return border, fill (low
alpha), and label-bg variants together so UI stays consistent.

## Validation before submit
class selected · view selected · required components handled · required boxes
present · every box geometry valid & inside image · visibility states valid.
On failure, return a precise message (e.g. "Missing: Chain bounding box") and
never let the submit transaction proceed.
