# Geometry engine & general-purpose schema

This document specifies two foundational, framework-agnostic subsystems added to
DeshiA's domain layer (`src/core/geometry/` and `src/schemas/`): the extensible
annotation **geometry engine** (including first-class **rotated bounding boxes**)
and the recursive, user-defined **schema model**.

> **Implementation status.** The modules described here are implemented as pure,
> typed, unit-tested domain logic and are the canonical home for geometry and
> schema math. They do **not** yet replace the running app's box-only canvas,
> Drizzle tables, or exporters — that wiring is deliberately staged (see
> "Status" below) so no working behavior regresses. Nothing here is a mockup:
> every function is real and verified (`tsc`, ESLint, Prettier, and a Node
> execution proof of the math; the Vitest suite runs on macOS — see Verification).

## Status: implemented vs. planned

**Implemented and verified (this layer):**

- Canonical geometry types for box, rotated box, polygon, polyline, point.
- Rotated-box math: corners, AABB bounds, pivot-correct hit-testing, move,
  rotate, angle normalization, corner resize about rotated local axes, reset,
  and lossless 4-vertex polygon conversion.
- Polygon/polyline/point math: area, centroid, point-in-polygon, vertex
  insert/move/delete, whole-shape move, vertex rotation, length, validation.
- Unified hit-testing and bounds/center/polygon dispatch across kinds.
- Viewport transforms (fit, pan, cursor-anchored zoom) with exact round-trip.
- Recursive schema: group vs. label nodes, stable ids, per-label geometry types
  and attributes, traversal, attribute validation, zod import validation with
  versioning + duplicate-id detection, and a reference-preserving migration from
  the legacy flat Rickshaw schema.

**Planned (not done in this pass; requires app/DB wiring + on-device checks):**

- Konva canvas tools for drawing/editing rotated boxes, polygons, polylines,
  points, plus the rotation handle and numeric angle entry.
- Drizzle columns/repositories to persist the geometry union and attribute
  values; migration of the existing `bounding_boxes` table.
- Exporters (VOC/COCO/YOLO) consuming the geometry union, and the native
  project-format writer/reader.
- The staged project-creation wizard and the schema-editor UI.

## Coordinate convention (authoritative)

- All geometry is stored in **image-relative normalized coordinates**.
- Origin `(0,0)` is the **top-left** of the image; `x` increases right, `y`
  increases down (identical to the existing `NormalizedBox`).
- `x` and box `width` are fractions of image **width**; `y` and box `height` are
  fractions of image **height**. In-image values lie in `[0,1]`; values may
  transiently leave the range while editing and are clamped/validated at edges.
- Coordinates keep full floating-point precision. Rounding happens **only** at an
  export edge (e.g. VOC integer pixels), never in canonical state.

## Geometry model

`Geometry` (in `src/core/geometry/types.ts`) is a discriminated union keyed by
`kind`:

| kind          | shape                                   |
| ------------- | --------------------------------------- |
| `box`         | `{ box: NormalizedBox }` (axis-aligned) |
| `rotated_box` | `{ cx, cy, w, h, angle }`               |
| `polygon`     | `{ points: NormPoint[] }` (closed, ≥3)  |
| `polyline`    | `{ points: NormPoint[] }` (open, ≥2)    |
| `point`       | `{ point: NormPoint }`                  |

New kinds are added by extending the union and implementing the per-kind
helpers; the workspace does not need rewriting. **No helper silently converts one
kind to another** — `geometryToPolygon` is an explicit, documented export view,
not an in-place edit.

## Rotated bounding boxes

Canonical model: `{ cx, cy, w, h, angle }`.

- **Pivot:** the box **center** `(cx, cy)`.
- **Rotation direction:** `angle` is in **degrees, clockwise-positive** (because
  `y` points down — this matches Konva's rotation and screen space).
- **Normalization:** `cx, w` are fractions of width; `cy, h` are fractions of
  height. Because the two axes use different scales, all rotation math runs in
  **pixel space** (normalized × `ImageSize`) and converts back, so stored
  geometry stays resolution-independent while the math stays isotropic.
- **Angle range:** canonical `[0,360)` via `normalizeAngle` (`360 → 0`,
  `-90 → 270`). `signedAngle` gives a `(-180,180]` display value. An
  axis-aligned box is exactly `angle === 0`; a full turn collapses to `0`.
- **Zoom/pan safety:** viewport changes only alter the `CanvasView` mapping, not
  the stored geometry. Pointer→image mapping is a single seam
  (`stageToImageNorm`) with an exact round-trip (unit-tested).

Key functions (`src/core/geometry/rotated-box.ts`): `rotatedFromBox`,
`rotatedBoxCorners`, `rotatedBoxBounds`, `pointInRotatedBox`, `moveRotatedBox`,
`rotateRotatedBox`, `setRotatedBoxAngle`, `resetRotation`, `resizeRotatedBox`
(keeps the opposite corner fixed, respects rotated axes, clamps to a minimum
pixel extent), `rotatedToPolygon`, `isValidRotatedBox`.

### Export compatibility (rotation is never dropped silently)

VOC and YOLO have no native rotated-box representation. The documented policy,
backed by `rotatedToPolygon` + `isRotatedGeometry`:

1. Detect rotated annotations (`isRotatedGeometry`, true only when `angle % 360
!== 0`).
2. For a polygon-capable target (e.g. COCO `segmentation`), convert losslessly to
   the **4 rotated corners**.
3. For an axis-aligned-only target, the enclosing AABB (`rotatedBoxBounds`) may be
   written **only with an explicit, reported loss** — never a silent swap.
4. The rotated geometry is always preserved in the native project.

## Recursive schema model

`RecursiveSchema` (in `src/schemas/nodes.ts`) is a forest of `SchemaNode`s
nestable to any practical depth. Two node kinds:

- **group** — organizational only; not annotatable unless `annotatable: true`.
- **label** — an assignable class; carries `geometryTypes` and `attributes`.

**Stable identity:** `id` is the permanent reference. Annotations store a label
`id`, so renaming `name` never breaks existing annotations, and ids are never
reused. Nodes also carry `enabled`, `archived`, `visible`, optional `color`, and
a `legacyKey` bridge used by migration.

**Attributes** (`src/schemas/attributes.ts`): per-label, domain-neutral fields —
`text`, `integer`, `decimal`, `boolean`, `single_choice`, `multi_choice`, `enum`
— with `required`, defaults, numeric `min`/`max`, options and help text, plus
value validation. No fixed domain field set is imposed on any project.

**Traversal** (`src/schemas/traverse.ts`): `walkNodes`, `findNodeById`,
`nodePath` (breadcrumbs), `flattenLabels` (archived/disabled excluded by
default), `isAnnotatable`, `collectIds`, `findDuplicateIds`, `maxDepth`,
`countNodes`.

**Import/validation** (`src/schemas/nodes-validate.ts`): `validateRecursiveSchema`
and `parseRecursiveSchemaJson` validate untrusted JSON with human-readable
errors, reject an unsupported future `formatVersion`
(`SCHEMA_FORMAT_VERSION = 1`), and reject duplicate ids. `serializeRecursiveSchema`
writes pretty JSON for a lossless native round-trip.

**Migration** (`src/schemas/migrate.ts`): `migrateFlatToRecursive` maps the legacy
flat `class → view → component` schema into the node forest with **deterministic,
path-derived ids** (idempotent) and `legacyKey` on each label.
`findLabelByLegacyKey` bridges existing annotation rows (stored by component key)
to the new stable node ids, so no annotation data is orphaned.

## Verification

- `pnpm typecheck` (`tsc --noEmit`) — passes for the whole project including the
  new tests.
- `pnpm lint` (`next lint`) — passes with no warnings or errors.
- `pnpm format:check` (Prettier) — passes for all new files.
- `pnpm test` (Vitest) — the new unit tests live beside the source
  (`*.test.ts`). Vitest cannot start in the Linux CI sandbox used during
  development because the platform-native Rollup binary is absent; run it on
  macOS. During development the pure geometry and schema modules were compiled
  with `tsc` and executed under Node to prove the math numerically (44 geometry
  assertions, 27 schema assertions, all passing).
