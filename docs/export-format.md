# Export Format

DeshiA's initial export format is **Pascal VOC XML**. COCO JSON and YOLO are
declared in the UI/settings as future formats but are not yet implemented.

## Output tree

Written under the chosen output directory as `DeshiA_Output/`:

```
DeshiA_Output/
├─ RAW/
│  ├─ rickshaw/{front,side,back}/
│  └─ e_rickshaw/{front,side,back}/
├─ ANNOTATED/
│  ├─ rickshaw/
│  │  ├─ front/{images,annotations}/
│  │  ├─ side/{images,annotations}/
│  │  └─ back/{images,annotations}/
│  └─ e_rickshaw/{front,side,back}/{images,annotations}/
└─ VISUALIZATIONS/
```

- **`ANNOTATED/**/images` holds CLEAN images** — copies of the original with no
  boxes drawn. Boxes are drawn only into `VISUALIZATIONS/`.
- `ANNOTATED/**/annotations` holds the matching `.xml` files.
- `RAW/` holds the untouched source copy, organized by class/view.

## File naming

Numbering comes from the persistent `images.datasetIndex` (zero-padded), never
from counting files in a directory:

| Kind | Pattern | Example |
| --- | --- | --- |
| RAW image | `raw_<class>_<view>_<NNN>.<ext>` | `raw_rickshaw_side_002.jpg` |
| Annotated image | `annotated_<class>_<view>_<NNN>.<ext>` | `annotated_rickshaw_side_002.jpg` |
| Annotation XML | `annotated_<class>_<view>_<NNN>.xml` | `annotated_rickshaw_side_002.xml` |

`<class>`/`<view>` are sanitized to lower snake case (`e_rickshaw`, `front`).
All names are sanitized (separators/control chars stripped).

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
    <name>Chain</name>
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
component's display label. `truncated`/`difficult` default to `0`; `pose` is
`Unspecified`. The generator is deterministic — the same annotation + schema
version yields byte-stable XML.

## Submission transaction

Export happens inside the atomic submission flow (`src/core/exporter/submit.ts`):

1. Validate annotation
2. Persist annotation (DB)
3. Generate VOC XML
4. Copy RAW image
5. Copy annotated (clean) image
6. **Verify** all written files exist and are non-empty
7. Update DB
8. Mark image `ANNOTATED`
9. Load next `PENDING`

If any step fails, the annotation is preserved, the image is **not** marked
complete, a useful error is shown, and the user can retry. `ANNOTATED` is set
only after step 6.
