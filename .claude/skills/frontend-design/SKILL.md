---
name: frontend-design
description: Building or reshaping DeshiA UI — the workstation aesthetic, tokens, typography, the three-zone annotation layout, and box-color rendering.
---

# Frontend Design — DeshiA

DeshiA must read as a **serious computer vision research workstation**: dark-first,
technical, dense, precise. Not a SaaS dashboard, not an AI landing page.

## Hard don'ts
Purple AI gradients · glassmorphism · huge rounded cards · oversized hero
sections · heavy shadows · decorative/looping animation · charts for their own
sake · random colors · pill-shaped everything.

## Tokens & type
- Colors come from CSS variables in `src/app/globals.css`, used via Tailwind
  semantic classes: `bg-bg`, `bg-surface`, `bg-elevated`, `border-border`,
  `border-border-strong`, `text-text`, `text-text-secondary`, `text-muted`,
  `text-primary`, `bg-primary`, `text-success|warning|error`. **Never hex in
  components.**
- Geist Sans for UI; **Geist Mono for paths, dimensions, IDs, metadata**
  (`font-mono`). Sizes via the `tailwind.config` scale: `text-title`,
  `text-section`, `text-body`, `text-meta`.
- Radius: buttons/inputs 8px, cards `rounded-lg` (10px)/`rounded-xl` (12px).
  Motion 150–250ms, `ease-out`; use `animate-fade-in`/`animate-slide-up`.

## The annotation screen (most important)
Three zones + bottom bar: **Left 20%** (image info, mono metadata), **Center
60%** (the canvas — largest visual weight), **Right 20%** (class/view radios,
dynamic components). Bottom: Previous · Skip · Reset · Save Draft · Submit.
Preserve image visibility above all. On narrow widths, collapse side panels;
never shrink the canvas into uselessness.

## Rendering boxes
Box border + label text use the component's semantic color from
`core/annotation/palette.ts`; label bg = darker/translucent variant; interior
fill ~8–12% alpha. Selected box: stronger border/glow, same hue. Colors are
assigned by component key (stable), never per render.

## Quality gate (run before calling UI done)
Inspect welcome, workspace, scanner, dashboard, annotation, settings, plus
error/loading/empty/recovery states and 1280–1920 widths. Check spacing,
alignment, contrast, hierarchy, density, hover/active/focus/disabled, keyboard
nav, canvas usability, and that **every box is distinguishable from every
other**. Ask: does this speed up annotation? Does anything look generic? Fix it.

Consult the bundled `frontend-design` guidance for typography/aesthetic depth,
but DeshiA's dark technical direction above always wins.
