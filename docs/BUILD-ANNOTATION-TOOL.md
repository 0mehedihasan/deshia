# Building an annotation tool — complete guide

This guide is for anyone who wants to build (or port features into) a
local-first, schema-driven image/video annotation workstation. It is distilled
from the DeshiA codebase and the RooyaCVAT feature port. The reusable agent
playbook is `.claude/skills/annotation-tool-builder/SKILL.md`.

The product name, logo and copy are yours to choose. The engineering rules
below are what keep annotation data correct and reproducible.

---

## 1. What you are building

```
source media (read-only)
        │
        ▼
   ┌────────────┐   schema    ┌──────────────┐   draft    ┌───────────┐
   │  scanner   │────────────▶│   engine     │◀───────────│  canvas   │
   └────────────┘             └──────────────┘            └─────┬─────┘
                                     │                          │
                                     ▼                          ▼
                            ┌────────────────┐        ┌───────────────────┐
                            │  repositories  │◀───────│  server actions   │
                            └────────┬───────┘        └───────────────────┘
                                     ▼
                              SQLite + event log
                                     │
                                     ▼
                       exporters → verified output tree
```

One person, one device: files and database stay on the machine. The optional
multi-user layer (section 11) is off unless explicitly enabled.

---

## 2. Non-negotiable rules

| #   | Rule                      | Why                                                                        |
| --- | ------------------------- | -------------------------------------------------------------------------- |
| 1   | Ontology is data          | The same engine must serve any dataset; hardcoded class names break reuse. |
| 2   | Never silently lose work  | A failed save keeps the draft and surfaces an error.                       |
| 3   | Verify before "done"      | An image is complete only after every output file exists and is non-empty. |
| 4   | Source media is read-only | Originals are scientific input; derivatives go to an output tree.          |
| 5   | No DB/FS in components    | UI → actions → repositories → domain → filesystem.                         |
| 6   | Deterministic colors      | Label identity, not render order, decides color.                           |
| 7   | Normalized coordinates    | `[0,1]` internal geometry; pixels only at edges.                           |
| 8   | No fake functionality     | If a feature is not built, say so.                                         |

---

## 3. Directory layout

```
src/core/geometry/      pure math: types, rotated-box, shapes, distance, hit-test,
                        convert, transform, extended-shapes
src/core/annotation/    engine, bbox, palette, validate, objects, snapping,
                        interpolation, redaction
src/core/exporter/      voc, coco, yolo, object-formats, coco-aggregate, zip,
                        output-tree, filenames, submit, cleanup, visualization
src/core/importer/      YOLO/COCO/VOC/CVAT/native parsers
src/core/recovery/      next-image detection, browser drafts
src/core/scanner/       walk, checksum, metadata, video, scan
src/core/video/         ffprobe parsing, ffmpeg frame decoding
src/schemas/            types, zod validation, nodes, attributes, traverse,
                        nodes-validate, migrate, nodes-edit
src/db/                 client, bootstrap, migrations, Drizzle tables,
                        repositories/*
src/stores/             Zustand working draft + undo/redo
src/features/           annotation, schema, analytics, auth
src/app/actions/        server actions (DB/FS orchestration only)
src/app/api/            byte routes for source images and video frames
```

Dependency direction: `features → actions → core/db → filesystem`. Never import
`next/headers` or `node:fs` into a client component.

---

## 4. Data model

### 4.1 Schema (ontology as data)

A recursive schema is a forest of nodes:

```ts
interface SchemaNode {
  id: string; // permanent, never reused
  kind: 'group' | 'label';
  name: string; // renamable without breaking references
  color?: string;
  enabled: boolean;
  archived: boolean;
  visible: boolean;
  geometryTypes?: GeometryKind[];
  attributes?: AttributeDef[];
  annotatable?: boolean; // groups can opt in
  legacyKey?: string; // bridge for migrated flat schemas
  children: SchemaNode[];
  redactOnExport?: boolean;
}
```

`AttributeDef` carries `id`, `key`, `label`, `type`
(`text|integer|decimal|boolean|single_choice|multi_choice|enum`), `required`,
`mutable`, `defaultValue`, `min`/`max`, `options`, `help`.

Versioning: `schemas` → `schema_versions` with `status DRAFT|PUBLISHED`.
Published rows are immutable via SQLite triggers. Editing requires a new draft
copied from the latest version. Annotations stamp `schemaId` + `schemaVersion`.

If you start with a simple flat schema (class → view → component), migrate it
into nodes with deterministic path-derived ids and `legacyKey`, so existing
annotations still resolve.

### 4.2 Annotation objects

One row per object instance (many per frame):

```ts
interface AnnotationObject {
  id: string;
  labelId: string; // stable schema id
  labelName: string; // denormalized display name
  geometry: Geometry;
  attributes: Record<string, AttributeValue>;
  occluded: boolean; // CVAT occluded
  zOrder: number; // CVAT z_order
  visible: boolean;
  locked: boolean; // edits rejected server-side
  trackId: string | null; // identity across frames
  frameNumber: number; // 0 for still images
  outside: boolean; // tracked object left the scene
  source: 'MANUAL' | 'AI';
  score: number | null;
  createdAt: number;
  updatedAt: number;
}
```

Keep the original single-annotation/component-box model if it is already in
use; add the object layer alongside it so no existing data is lost.

### 4.3 Tables (minimum)

- `workspace(id, name, sourceDir, outputDir, schemaId, schemaVersion, ...)`
- `image(id, workspaceId, datasetIndex, path, extension, checksum, width,
height, status, mediaKind, durationMs, fps, frameCount, ...)`
- `annotations(imageId UNIQUE, status, saveRevision, componentVisibility,
redactions, audit fields)`
- `annotation_objects(id, imageId, frameNumber, labelId, geometryType,
geometryJson, attributesJson, occluded, zOrder, visible, locked, trackId,
outside, source, score, timestamps)`
- `annotation_events(id, imageId, kind, payload, createdAt)` — **append-only**
- `schemas`, `schema_versions`, `export_jobs`, `source_image_duplicates`
- optional: `users`, `sessions`

Every foreign key is declared and indexed. Timestamps are epoch milliseconds.
`datasetIndex` is a persistent monotonic counter — **never** count files to
name outputs.

---

## 5. Geometry contract

Canonical coordinates are image-relative normalized values, top-left origin,
`x` right, `y` down. `x`/`w` are fractions of width; `y`/`h` fractions of
height. Rotation runs in pixel space to stay isotropic, then converts back.

| Kind          | Canonical fields        | Validity                       |
| ------------- | ----------------------- | ------------------------------ |
| `box`         | `{xMin,yMin,xMax,yMax}` | `0 <= min < max <= 1`          |
| `rotated_box` | `{cx,cy,w,h,angle}`     | positive size, angle `[0,360)` |
| `polygon`     | `points[]`              | ≥3 vertices, non-zero area     |
| `polyline`    | `points[]`              | ≥2 vertices, non-zero extent   |
| `point`       | `point`                 | both finite                    |
| `points`      | `points[]`              | ≥1 keypoint                    |
| `ellipse`     | `{cx,cy,rx,ry,angle}`   | positive radii                 |
| `cuboid`      | 8 `points[]`            | CVAT front/back corner order   |

Implement these pure helpers per kind: `isValid`, `bounds`, `center`, `toPolygon`
(explicit, documented export view), `hitTest`, `move`, `setVertex`,
`insertVertex`, `removeVertex`. Dispatch through a single union-level module so
the canvas never switches on kind itself.

Viewport transform (`CanvasView {scale, offsetX, offsetY}`):

```
stage = offset + imageNorm × naturalSize × scale
imageNorm = (stage - offset) / (naturalSize × scale)
```

Wheel zoom must keep the image point under the cursor fixed. Pan changes only
the view. Stored geometry never changes on zoom/pan.

---

## 6. Canvas contract

Tools: Select, Rectangle, Rotated box, Ellipse, Polygon, Polyline, Point,
Points, Cuboid. Number keys `1`–`9` select tools; Alt+`1`–`9` select labels.

Interaction checklist:

- Drag-to-draw for box/rotated/ellipse/cuboid; also a **4-point** rectangle mode.
- Click-to-place path vertices; double-click, Enter or **Finish** closes;
  Shift-drag freehand with downsampling.
- Double-click an edge inserts a vertex; right-click a vertex deletes it.
- Snap to nearby vertices within ~10 stage px; Ctrl/Cmd bypasses.
- Marquee selection with drag on empty background; Ctrl/Cmd+A selects all.
- Ctrl/Cmd+C/V duplicates with a small offset in one undo step.
- Transformer handles for box-like shapes, vertex handles for paths.
- All four z-order moves; per-object and per-label visibility/lock.
- Occlusion toggle; `outside` toggle for tracks.
- Display-only brightness/contrast/gamma on a cached image node.
- Full-image crosshair and live `W × H px` while drawing.
- Selection is UI state; it is never stored as annotation metadata.

Colors: assign by stable label id from a perceptually separated base palette;
overflow via golden-angle hue rotation. Border and label text share the hue;
label background is a dark translucent variant; fill ~8–12% alpha.

---

## 7. Persistence and audit

Draft save transaction:

1. Validate input.
2. Upsert annotation row.
3. Replace object rows for that image (delete + insert) — or upsert by id.
4. Append a `DRAFT_SAVED` event with a JSON snapshot.
5. Move image `PENDING → IN_PROGRESS` only. Never mark complete here.

Submission order (strict):

1. Validate schema + objects.
2. Persist draft (as above).
3. Write VOC, COCO, YOLO, CVAT XML + ZIP, native project.
4. Copy clean image(s); bake redactions into copies only.
5. Verify every file exists and is non-empty.
6. Bump annotation version, mark image `ANNOTATED`, record `SUBMITTED`.
7. Post-commit cleanup of stale outputs — best effort, never fails a good submit.

`annotation_events` is append-only. Restore writes a new revision plus a
`RECOVERED` event; nothing is rewritten or deleted.

Optimistic concurrency: keep `saveRevision`; client sends `expectedRevision`.
On mismatch, return a conflict with server state and offer **Use saved** /
**Keep my version**; the latter re-saves with the current revision.

---

## 8. Autosave and crash recovery

Client store (Zustand or equivalent) holds only working state: draft, selection,
status (`idle|dirty|saving|saved|error`), `past`/`future` snapshots (limit 50).
`loadDraft`, `loadFromState`, `reset`, per-object mutations, `undo`, `redo`.

Autosave: 800 ms debounce on `dirty`; status badge; immediate Save button.
Mirror successful saves to IndexedDB keyed by `imageId:frameNumber`. On reopen,
compare with server state; if different, offer an accessible **Restore /
Discard** dialog. Missing IndexedDB must never block annotation.

Revision panel: read the last ~20 `OBJECTS_SAVED` events, show time and object
count, and restore as a new revision.

---

## 9. Export and import

| Format             | Use                    | Notes                                                  |
| ------------------ | ---------------------- | ------------------------------------------------------ |
| Pascal VOC         | classic detection      | integer pixel bndbox, `<occluded>`                     |
| COCO               | detection/segmentation | bbox + polygon segmentation, dataset-level aggregate   |
| YOLO               | training               | normalized `class cx cy w h`, `classes.txt`            |
| CVAT 1.1 XML + ZIP | interchange            | real geometry, attributes, occlusion, z-order, cuboids |
| Native JSON        | lossless project       | schema + raw object rows + media metadata              |

Loss policy: if a format cannot represent a geometry, convert explicitly and
report it. Examples: rotated/polygon → AABB; paths/points/cuboid → box;
point-only → skipped; attributes omitted. Never count a skipped object as
exported without telling the user.

ZIP can be implemented as a stored (uncompressed) archive with CRC32, local
headers, central directory and EOCD; remember the classic 4 GiB / 65,535 entry
limits. Validate generated archives with `unzip -t`.

Importers parse untrusted text defensively: skip corrupt rows, resolve label
references (id, name or `legacyKey`) to stable ids, and never throw on bad input.

Redaction: circular regions stored normalized (`cx`, `cy`, radius as fraction
of width) and baked into **copies** only, never into source bytes.

---

## 10. Video and tracks

- Media rows carry `mediaKind`, `durationMs`, `fps`, `frameCount`.
- Objects carry `frameNumber`; same object across frames shares `trackId`.
- Keyframes are the rows you persist. Frames between them are interpolated on
  read: linear position/size, shortest-arc rotation, vertex-matched paths,
  hold-left when counts differ, no extrapolation; `outside` closes a segment.
- Editing an interpolated object promotes it to a real keyframe.
- Timeline: slider with keyframe markers, prev/next, Add-keyframe, New-track,
  track list with rename/remove.
- Decode frames via optional `ffprobe`/`ffmpeg`, bounded cache, byte route.
  If the binary is missing, return a clear message — never show a blank canvas
  as if it worked.

---

## 11. Optional multi-user layer

Default: single user, no sign-in and no session reads. If a team needs
accounts, gate them behind `DESHIA_MULTIUSER=1`:

- `users` with PBKDF2-SHA256 hashes (per-user salt, 310k iterations).
- `sessions` storing only a hash of an opaque random token; HttpOnly cookie,
  30 days, SameSite=Lax, Secure in production.
- Roles `ADMIN | ANNOTATOR | REVIEWER`; first-run admin bootstrap at `/login`;
  user management at `/admin/users`.
- Guard **write** actions only when the flag is on; when off, `requireUser()`
  is a no-op. Turning the flag off returns to the single-user path without
  deleting user rows.

Do not claim hosted security features (remote IdP, CSRF tokens, TLS, password
reset) unless you actually implement them.

---

## 12. Verification gate

After every phase:

```bash
pnpm typecheck   # strict TS, no any escapes
pnpm lint
pnpm test        # Vitest for pure logic
pnpm build       # when build output changes
```

Also verify migrations on a fresh DB, trigger behaviour, ZIP integrity with
`unzip -t`, and a Playwright loop:
create → scan → annotate → save/reload → submit → verify files on disk.

Keep a written feature matrix with honest statuses. Distinguish **pure helper
exists** from **reachable in the UI** — this is the most common false claim.

---

## 13. Phase checklist

- [ ] Schema model, validation, migration from any legacy schema
- [ ] Geometry union + pure math + tests
- [ ] DB tables, repositories, append-only events, immutable published schemas
- [ ] Canvas tools, gestures, snapping, colors, undo/redo
- [ ] Debounced autosave, IndexedDB crash drafts, revision restore
- [ ] VOC/COCO/YOLO/CVAT/native exporters with loss reports + importers
- [ ] Verified submission transaction and clean output tree
- [ ] Video ingest, frame route, interpolation, tracks, timeline
- [ ] Local analytics, backup/manifest, optional multi-user (if wanted)
- [ ] Unit + e2e tests, docs, CI, honesty audit of UI reachability

---

## 14. Anti-patterns

- Hardcoding dataset names in components or validators.
- Palette keyed by render order → colors shift after deletion.
- Marking complete before verifying exported files.
- Counting files to generate `NNN` filenames instead of a stored index.
- Treating hidden/`NOT_VISIBLE`/`outside` objects as corrupt exports instead of
  reporting their exclusion.
- Editing a published schema version in place.
- Assuming ffmpeg exists.
- Leaving placeholder buttons or claiming a pure helper is a finished feature.

---

## 15. Glossary

- **Keyframe** — an object row actually persisted at a frame.
- **Interpolated object** — a read-time synthetic shape between two keyframes.
- **Track** — a stable `trackId` shared by objects across frames.
- **Outside** — the tracked object has left the scene; closes a track segment.
- **Occluded** — partly hidden in the scene (CVAT semantic).
- **Visibility** — annotator-facing show/hide; independent of occlusion.
- **Loss report** — explicit notice that a format could not represent geometry.
- **Audit event** — append-only record of a mutation or recovery action.

For a worked feature inventory and the port decisions, read
`docs/rooyacvat-parity.md`. For the agent-facing checklist, read
`.claude/skills/annotation-tool-builder/SKILL.md`.
