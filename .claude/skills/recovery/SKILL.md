---
name: recovery
description: DeshiA autosave, draft persistence, and crash recovery — how in-progress annotations survive close/crash/restart and are resumed exactly.
---

# Autosave & Recovery — DeshiA

Progress must survive app close, OS shutdown, restart, and crash. This is a
core, non-negotiable feature.

## Autosave
- The Zustand annotation store (`src/stores/annotation.ts`) tracks the working
  `AnnotationState` and a save status: `Saved | Saving… | Unsaved changes`.
- Persist (DRAFT) on: class change, view change, component visibility change,
  box create/move/resize/delete. **Debounce** rapid geometry edits
  (move/resize) so we don't thrash SQLite; flush on discrete events (create/
  delete/class/view) promptly.
- Each save upserts the annotation (status `DRAFT`) and its boxes in one
  transaction, and appends a `DRAFT_SAVED` `annotation_events` row.
- Status is subtle — never interrupt the workflow with modal notifications.

## Crash recovery
- On workspace open, `src/core/recovery/detect.ts` finds images in status
  `IN_PROGRESS` (or with a DRAFT annotation newer than any submission).
- Present a Resume prompt with the exact draft summary: image, class, view, box
  count. Options: **Resume** (load the exact saved state) or **Discard Draft**
  (archive via event, then reset the image to `PENDING` — never a silent wipe).
- Resume must restore the precise state: class, view, per-component visibility,
  and every box with its normalized coordinates and component key.

## Rules
- **Never silently discard** unfinished annotation. Discards are explicit and
  audited.
- Recovery reads from the DB (source of truth), not from volatile client state.
- Marking an image `IN_PROGRESS` happens as soon as the user starts editing, so
  an interrupted session is always detectable.
