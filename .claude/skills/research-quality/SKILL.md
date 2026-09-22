---
name: research-quality
description: The data-integrity and scientific-reproducibility bar for DeshiA — honesty about what is annotated, no fabricated labels, reproducible exports.
---

# Research Quality — DeshiA

DeshiA produces **research datasets**. Integrity and reproducibility outrank
features and polish.

## Non-negotiables
- **Never fabricate labels or functionality.** No placeholder buttons that
  pretend to work, no fake counts, no simulated exports. If something isn't
  implemented, say so in the UI and the docs.
- **Honesty about the ontology.** Rickshaw ↔ E-Rickshaw and their components are
  the *first* schema, not ground truth baked into the tool. Do not present
  guessed components as required by physics; the schema defines them.
- **Domain accuracy traps (Rickshaw schema):** Chain is a *separate* box (not
  part of Pedal/Crank); the round rear part on a rickshaw is **not** a Motor;
  an E-Rickshaw pedal is **optional**. Encode these in the schema, not ad hoc.
- **Reproducible export.** Same annotations + same schema version ⇒ byte-stable
  filenames and directory layout. Numbering is persistent (`datasetIndex`), not
  environment-dependent. Record `schemaId`/`schemaVersion` on every annotation.

## Data safety
- Source images are read-only research inputs — never modify, move, or draw on
  them. Annotated exports are clean copies; visualizations are separate.
- Never mark work complete before it is verified on disk.
- The append-only `annotation_events` log means a reviewer can reconstruct how a
  label was produced. Keep it truthful and complete.

## When unsure
Prefer surfacing uncertainty (visibility = OCCLUDED/NOT_VISIBLE, optional
components, validation warnings) over silently guessing. A missing box the user
must decide on is better than an invented one.
