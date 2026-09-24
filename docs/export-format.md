# Export Format

DeshiA emits **three annotation formats on every submission**, side by side:
**Pascal VOC XML**, **COCO JSON**, and **YOLO TXT**. There is no format toggle —
each submitted image always produces all three, so a workspace is ready for any
downstream trainer without re-exporting. A single dataset-level YOLO
`classes.txt` is kept at the `ANNOTATED/` root, consistent across every folder.

All three formats describe the **same** objects (every box whose component is
not `NOT_VISIBLE`) and use the **schema component key** as the class name (e.g.
`chain`, `rickshaw_body`) so the label is machine-stable and identical across
formats.

## Output tree

Written under the chosen output directory as `DeshiA_Output/`:

```
DeshiA_Output/
├─ RAW/
│  ├─ rickshaw/{front,side,back}/
│  └─ e_rickshaw/{front,side,back}/
├─ ANNOTATED/
│  ├─ classes.txt                      ← YOLO class list (dataset-level, shared)
│  ├─ rickshaw/
│  │  ├─ front/{images,annotations}/
│  │  ├─ side/{images,annotations}/
│  │  └─ back/{images,annotations}/
│  └─ e_rickshaw/{front,side,back}/{images,annotations}/
└─ VISUALIZATIONS/
   ├─ rickshaw/{front,side,back}/       ← box-rendered previews (viz_*.jpg)
   └─ e_rickshaw/{front,side,back}/
```

- **`ANNOTATED/**/images` holds CLEAN images** — copies of the original with no
  boxes drawn. Boxes are drawn only into `VISUALIZATIONS/`.
- `ANNOTATED/**/annotations` holds the matching annotation files for each image:
  a `.xml` (VOC), a `.json` (COCO), and a `.txt` (YOLO).
- `ANNOTATED/classes.txt` is the **single** YOLO class list for the whole
  dataset. Line N (0-based) is YOLO class id N; it is identical no matter which
  class/view folder a label came from.
- `RAW/` holds the untouched source copy, organized by class/view.
- **`VISUALIZATIONS/<class>/<view>/` holds box-rendered previews** — one per
  submitted image (`viz_<class>_<view>_<NNN>`), the **only** images DeshiA ever
  draws boxes onto. They are previews for humans, never part of the dataset.

## File naming

Numbering comes from the persistent `images.datasetIndex` (zero-padded), never
from counting files in a directory:

| Kind | Pattern | Example |
| --- | --- | --- |
| RAW image | `raw_<class>_<view>_<NNN>.<ext>` | `raw_rickshaw_side_002.jpg` |
| Annotated image | `annotated_<class>_<view>_<NNN>.<ext>` | `annotated_rickshaw_side_002.jpg` |
| Annotation XML (VOC) | `annotated_<class>_<view>_<NNN>.xml` | `annotated_rickshaw_side_002.xml` |
| Annotation JSON (COCO) | `annotated_<class>_<view>_<NNN>.json` | `annotated_rickshaw_side_002.json` |
| Annotation TXT (YOLO) | `annotated_<class>_<view>_<NNN>.txt` | `annotated_rickshaw_side_002.txt` |
| YOLO class list | `classes.txt` (at `ANNOTATED/` root) | `classes.txt` |
| Visualization | `viz_<class>_<view>_<NNN>.<ext>` | `viz_rickshaw_side_002.jpg` |

`<class>`/`<view>` are sanitized to lower snake case (`e_rickshaw`, `front`).
All names are sanitized (separators/control chars stripped).

## Label map (shared class ids)

COCO and YOLO both need a stable integer id per class. DeshiA derives one
deterministic label map from the schema (`src/core/exporter/labelmap.ts`): the
id space is the set of **unique component keys across the whole schema, in
declaration order** (first occurrence wins). The same component key therefore
always maps to the same id regardless of which class/view it appears under.

- **YOLO class id** → 0-based (index into the label map / line in `classes.txt`).
- **COCO `category_id`** → 1-based (index + 1).
- **name** (all three formats) → the component key.

The ontology stays entirely in the schema — this module only enumerates whatever
schema it is handed, so a different dataset schema yields a different, still
consistent, label map.

## Pascal VOC XML

```xml
<annotation>
  <folder>rickshaw/side</folder>
  <filename>annotated_rickshaw_side_002.jpg</filename>
  <path>.../ANNOTATED/rickshaw/side/images/annotated_rickshaw_side_002.jpg</path>
  <source><database>DeshiA</database></source>
  <size>
    <width>4032</width>
    <height>3024</height>
    <depth>3</depth>
  </size>
  <segmented>0</segmented>
  <object>
    <name>chain</name>
    <pose>Unspecified</pose>
    <truncated>0</truncated>
    <difficult>0</difficult>
    <bndbox>
      <xmin>1204</xmin>
      <ymin>1890</ymin>
      <xmax>1512</xmax>
      <ymax>2140</ymax>
    </bndbox>
  </object>
  <!-- one <object> per bounding box -->
</annotation>
```

### Coordinate conversion

Boxes are stored normalized `[0,1]`. At export they convert to **integer
pixels**: `xmin = round(xMin * width)` etc., clamped inside the image so no
coordinate falls outside `[0, width]` / `[0, height]`. `<object><name>` is the
schema component key. `truncated` defaults to `0`; `difficult` is `1` when the
box is `OCCLUDED`; `pose` is `Unspecified`. The generator is deterministic — the
same annotation + schema version yields byte-stable XML.

## COCO JSON

DeshiA writes **one self-contained COCO document per image** (not a single
growing aggregate file), which keeps each submission atomic and idempotent:
re-submitting an image overwrites only that image's `.json` and never rewrites a
shared dataset file. Downstream tooling can merge the per-image files trivially.

```json
{
  "info": { "description": "DeshiA annotation export", "version": "1.0", "generator": "DeshiA" },
  "images": [
    { "id": 2, "file_name": "annotated_rickshaw_side_002.jpg", "width": 4032, "height": 3024 }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 2,
      "category_id": 4,
      "bbox": [1203.0, 1889.0, 308.0, 250.0],
      "area": 77000.0,
      "iscrowd": 0,
      "segmentation": []
    }
  ],
  "categories": [
    { "id": 1, "name": "rickshaw_body", "supercategory": "component" }
  ]
}
```

- `image.id` / `annotations[].image_id` is the persistent `datasetIndex`.
- `bbox` is **`[x, y, width, height]` in absolute pixels**, top-left origin,
  rounded to 2 decimals. `area = width * height`.
- `category_id` is the **1-based** label-map id; `categories` always lists the
  full schema class set.
- A zero-object image still emits a valid document (empty `annotations`, full
  `categories`, one `images` entry).

## YOLO TXT

One `.txt` per image, one object per line:

```
<class_id> <x_center> <y_center> <width> <height>
```

```
3 0.336975 0.626488 0.076389 0.082672
0 0.500000 0.500000 0.980000 0.960000
```

- All four geometry values are **normalized `[0,1]`** — DeshiA's native storage,
  so no image size is needed — formatted to 6 decimals and clamped to `[0,1]`.
- `class_id` is the **0-based** label-map id (the line number in `classes.txt`).
- An image with **no exported objects yields an empty (0-byte) file**, which is
  a valid YOLO label for a background/negative image.

`ANNOTATED/classes.txt` lists one class name per line ordered by class id, with a
trailing newline, and is rewritten (identically) on every submission so it stays
consistent across all folders.

## Visualizations

For every submitted image DeshiA also renders a **box-annotated preview** to
`VISUALIZATIONS/<class>/<view>/viz_<class>_<view>_<NNN>.<ext>`. This is the
**only** output with boxes drawn — `RAW` and `ANNOTATED` images always stay
clean (CLAUDE.md §10), so the dataset itself is never contaminated with overlays.

The preview is produced by compositing plain **RGBA raster tiles** onto a Sharp
copy of the source — the source is only read, never modified. Each exported
object (every box whose component is not `NOT_VISIBLE`) is drawn as:

- one highly transparent (~10%) interior fill in the component's color, so the
  underlying image stays clearly visible; and
- four opaque border strips (top/bottom/left/right) in the same color, forming
  the box outline.

This deliberately avoids SVG/text rasterization (the native librsvg/pango code
path): a box preview does not need it, and feeding an SVG overlay to `composite`
can crash some libvips builds. Consequently the raster preview draws **no text
label** — the component label is still carried through the pipeline (`VizObject`)
for a possible future overlay. Colors come from the **same deterministic palette
and schema** the annotation workbench uses (`colorsForView`), keyed by component
so a preview matches exactly what the annotator saw on the canvas. A zero-object
image still gets a valid, box-free preview. The tile layout is pure and
deterministic (`layoutVizRects`) and every tile is clamped inside the image
bounds, so previews are reproducible and never overflow the base image.

## Submission transaction

Export happens inside the atomic submission flow (`src/core/exporter/submit.ts`):

1. Validate annotation
2. Persist annotation (DB)
3. Generate VOC XML + COCO JSON + YOLO TXT + dataset-level `classes.txt`
4. Copy RAW image
5. Copy annotated (clean) image + write all annotation files, then render the
   box-annotated `VISUALIZATIONS` preview (the only image with boxes). The
   preview is **best-effort**: a render failure is logged and the preview is
   skipped, never failing an otherwise-valid submission.
6. **Verify** every dataset file (RAW, clean ANNOTATED, VOC/COCO/YOLO, and
   `classes.txt`) exists and is non-empty — the YOLO `.txt` may be 0 bytes when
   the image has no objects (a valid negative label). The preview is a human
   convenience, not dataset data, so it is not part of this mandatory check.
7. Update DB
8. Mark image `ANNOTATED`
9. Load next `PENDING`

If any step fails, the annotation is preserved, the image is **not** marked
complete, a useful error is shown, and the user can retry. `ANNOTATED` is set
only after step 6. Every output path is confined to the output root
(`assertInside`) before anything is written.
