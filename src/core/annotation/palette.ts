/**
 * Deterministic annotation color palette.
 *
 * Hard requirements (see .claude/CLAUDE.md §9):
 *  - Different components active in the same image never share a color.
 *  - The same component may reuse its color across multiple boxes.
 *  - Assignment is deterministic and stable within a session (no per-render
 *    randomness) — colors are assigned by a component's position in the ordered
 *    component list for the current class+view, so adding a box never recolors
 *    an existing component.
 *  - Perceptually separated, color-blind-aware base palette; red/green are never
 *    the sole distinguishing cue.
 *  - Border + label text use the component color; label background is a darker
 *    translucent version; interior fill is highly transparent.
 */

export interface AnnotationColor {
  /** Base hex, used for the box border and label text. */
  base: string;
  /** Box border color (== base). */
  border: string;
  /** Highly transparent interior fill (image stays visible underneath). */
  fill: string;
  /** Darker, translucent same-hue label background. */
  labelBg: string;
  /** Label text color (== base). */
  labelText: string;
}

/**
 * Base palette — ordered so the earliest slots are maximally separated and the
 * color-blind-safe core (adapted Okabe–Ito) comes first. Tuned for legibility
 * on both dark and bright image backgrounds.
 */
export const BASE_PALETTE: readonly string[] = [
  '#56B4E9', // sky blue
  '#F5A742', // orange
  '#10B981', // green
  '#E67FB5', // reddish purple / magenta
  '#F0E442', // yellow
  '#FF6B4A', // vermillion
  '#3B82F6', // blue
  '#2DD4BF', // teal
  '#FB7185', // pink
  '#A3E635', // lime
  '#A78BFA', // purple
  '#22D3EE', // cyan
] as const;

const GOLDEN_ANGLE = 137.508;
const FILL_ALPHA = 0.1;

/** Return the base hex color for a palette index (0-based), with overflow. */
export function baseColorForIndex(index: number): string {
  if (index < 0) index = 0;
  if (index < BASE_PALETTE.length) return BASE_PALETTE[index]!;
  // Beyond the base palette, rotate hue by the golden angle for perceptual
  // separation, deterministically.
  const step = index - BASE_PALETTE.length + 1;
  const hue = (210 + step * GOLDEN_ANGLE) % 360;
  return hslToHex(hue, 0.68, 0.62);
}

/** Build the full color (border/fill/label variants) from a base hex. */
export function deriveColor(base: string): AnnotationColor {
  const { r, g, b } = hexToRgb(base);
  const { h, s } = rgbToHsl(r, g, b);
  const darkHex = hslToHex(h, Math.min(s, 0.6), 0.16);
  const dark = hexToRgb(darkHex);
  return {
    base,
    border: base,
    fill: `rgba(${r}, ${g}, ${b}, ${FILL_ALPHA})`,
    labelBg: `rgba(${dark.r}, ${dark.g}, ${dark.b}, 0.9)`,
    labelText: base,
  };
}

export function colorForIndex(index: number): AnnotationColor {
  return deriveColor(baseColorForIndex(index));
}

/**
 * Assign a stable color to each component key. Input MUST be the ordered list of
 * component keys for the current class+view (stable for the session). Distinct
 * keys receive distinct colors; order determines the assignment.
 */
export function assignPaletteColors(componentKeys: readonly string[]): Map<string, AnnotationColor> {
  const map = new Map<string, AnnotationColor>();
  let i = 0;
  for (const key of componentKeys) {
    if (map.has(key)) continue; // de-dupe while preserving first position
    map.set(key, colorForIndex(i));
    i += 1;
  }
  return map;
}

// ---- color math -----------------------------------------------------------

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function componentToHex(c: number): string {
  return Math.round(clamp255(c)).toString(16).padStart(2, '0');
}

function clamp255(n: number): number {
  return Math.min(255, Math.max(0, n));
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      default:
        h = ((r - g) / d + 4) * 60;
    }
  }
  return { h, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `#${componentToHex((r + m) * 255)}${componentToHex((g + m) * 255)}${componentToHex((b + m) * 255)}`;
}
