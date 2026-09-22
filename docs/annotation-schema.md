# Annotation Schema

The annotation engine is **schema-driven**. A schema is data (in `src/schemas`),
not code. The engine (`src/core/annotation/engine.ts`) reads it to decide which
views a class offers, which components a (class, view) requires, and how boxes
and visibility behave. Nothing about Rickshaws is hardcoded in the engine.

## Concepts

```
AnnotationSchema
├─ id, version, name
├─ classes[]            (e.g. "rickshaw", "e_rickshaw")
│  ├─ key, label
│  └─ views[]           (e.g. "front", "side", "back")
│     ├─ key, label
│     └─ components[]
│        ├─ key, label           stable id + display name
│        ├─ required             must be handled before submit
│        ├─ box: 'required' | 'optional' | 'none'
│        └─ allowedVisibilities  subset of VISIBLE|OCCLUDED|NOT_VISIBLE
```

- **Class** — top-level category. Selecting a class determines available views.
- **View / subclass** — perspective or variant. Selecting a view determines
  available components.
- **Component** — a labeled part that may need one or more bounding boxes.
- **Visibility** — `VISIBLE`, `OCCLUDED`, `NOT_VISIBLE`. A component's
  `box` rule combined with its visibility decides whether a box is required.

## Visibility × box rule

| Visibility | `box: required` | `box: optional` | `box: none` |
| --- | --- | --- | --- |
| VISIBLE | box required | box allowed | no box |
| OCCLUDED | schema-defined (default: box allowed, not required) | allowed | no box |
| NOT_VISIBLE | no box required | no box required | no box |

## Built-in schema: Rickshaw / E-Rickshaw v1

`src/schemas/rickshaw.ts`. Classes: `rickshaw`, `e_rickshaw`. Views: `front`,
`side`, `back`.

| Class + View | Required components | Other components | Notes |
| --- | --- | --- | --- |
| rickshaw + front | Rickshaw Body, Steering Head | — | |
| rickshaw + side | Rickshaw Body | Pedal / Crank Assembly, **Chain** | Chain is a **separate** box, never merged into Pedal/Crank |
| rickshaw + back | Rickshaw Body | Rear Drive Assembly | The round rear part is **not** a Motor |
| e_rickshaw + front | E-Rickshaw Body, Steering Head | Electric Control / Circuit | |
| e_rickshaw + side | E-Rickshaw Body | Electric Drive Area, Pedal (**optional**) | Do not require the pedal when absent |
| e_rickshaw + back | E-Rickshaw Body, Electric Motor | — | |

## Annotation scope

Annotate **major** body / structural / mechanical / electrical /
class-discriminative components only. Do **not** annotate decorative elements,
tiny screws, tiny lights, individual spokes, or minor hardware unless a future
schema explicitly configures them.

## Custom schemas

Schemas can be authored as JSON and validated with zod
(`src/schemas/validate.ts`) before use. Imported schemas are untrusted input:
they are validated (shape, key uniqueness, size) and rejected if malformed. A
schema carries `id` + `version`; every annotation stores the `schemaId` and
`schemaVersion` it was made against, so exports remain reproducible even as the
schema evolves.
