---
name: testing
description: How DeshiA is tested — Vitest units for pure logic, Playwright for the annotation loop, and the per-phase verification gate.
---

# Testing — DeshiA

## Vitest (unit, `src/**/*.test.ts`)
Cover the pure logic — these are the correctness/data-safety core:
- scanner classification + **checksum** determinism
- schema validation (zod) + **annotation validation** (missing required box, etc.)
- bbox **normalization/conversion** + geometry invariants + clamping
- **color assignment**: distinct components → distinct colors, same component →
  same color, stable across calls, > base-palette overflow still distinct
- **filename generation** (sanitization, padding, class/view mapping)
- **VOC XML generation** (structure + integer pixel bndbox)
- exporter output-path building + **recovery** draft detection

Keep tests deterministic and filesystem-light; use temp dirs (`node:os.tmpdir`)
for anything touching disk and clean up.

## Playwright (e2e, `e2e/`)
Full loop: create workspace → select source/output → scan → open annotation →
select class → select view → create boxes → **assert box colors differ** →
save draft → close → reopen → **resume draft** → submit → verify output files +
DB status `ANNOTATED` → next image loads. Native dialogs are mocked via the
`DESHIA_E2E` path-input fallback (see `src/lib/native-dialog.ts`).

## Per-phase gate (run and fix before moving on)
```
pnpm typecheck   # tsc --noEmit, strict
pnpm lint        # eslint
pnpm test        # vitest run
pnpm build       # where meaningful
```
A phase is not "done" until these are green. Prefer adding a failing test first
when fixing a bug.
