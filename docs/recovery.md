# Recovery

Annotation progress in DeshiA must survive application close, OS shutdown,
restart, and crash. Nothing in progress is ever silently discarded.

## What is persisted

The SQLite database is the source of truth. As the user annotates:

- The image is marked `IN_PROGRESS` as soon as editing begins, so an interrupted
  session is always detectable.
- A `DRAFT` annotation row and its bounding boxes are upserted on each autosave,
  inside one transaction.
- An append-only `annotation_events` row (`DRAFT_SAVED`) records each save, so
  history is fully reconstructable.

## Autosave triggers

Autosave (`src/stores/annotation.ts` + repository) fires on:

- class change
- view change
- component visibility change
- bounding box created / moved / resized / deleted

Rapid geometry edits (move/resize) are **debounced** to avoid thrashing SQLite;
discrete events (create/delete/class/view) flush promptly. The UI shows a subtle
status — `Saved`, `Saving…`, or `Unsaved changes` — and never interrupts the
workflow with modal popups.

## Crash recovery on reopen

When a workspace opens, `src/core/recovery/detect.ts` finds recoverable images:
those in status `IN_PROGRESS`, or with a `DRAFT` annotation newer than any
submission. For each, DeshiA can present a resume prompt:

```
Resume Previous Annotation?

Image:  IMG_03482.jpg
Draft:  Rickshaw · Side · 3 bounding boxes

[ Resume ]   [ Discard Draft ]
```

- **Resume** restores the exact saved state: class, view, per-component
  visibility, and every box with its normalized coordinates and component key.
- **Discard Draft** is explicit and audited: it appends an `ARCHIVED` event and
  resets the image to `PENDING`. It is never a silent wipe.

## Guarantees

- Recovery reads from the DB, not from volatile client state.
- A draft is only ever removed by an explicit, logged user action.
- Because `annotation_events` is append-only, a reviewer can reconstruct how any
  annotation reached its current state.
