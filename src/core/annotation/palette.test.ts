import { describe, expect, it } from 'vitest';
import {
  BASE_PALETTE,
  assignPaletteColors,
  baseColorForIndex,
  colorForIndex,
  deriveColor,
  hexToRgb,
  hslToHex,
  rgbToHsl,
} from '@/core/annotation/palette';

describe('palette', () => {
  it('returns the base palette hues for the first slots', () => {
    for (let i = 0; i < BASE_PALETTE.length; i++) {
      expect(baseColorForIndex(i)).toBe(BASE_PALETTE[i]);
    }
  });

  it('generates deterministic distinct colors beyond the base palette', () => {
    const a = baseColorForIndex(BASE_PALETTE.length);
    const b = baseColorForIndex(BASE_PALETTE.length + 1);
    expect(a).toMatch(/^#[0-9a-f]{6}$/);
    expect(b).toMatch(/^#[0-9a-f]{6}$/);
    expect(a).not.toBe(b);
    // Deterministic: same index → same color.
    expect(baseColorForIndex(BASE_PALETTE.length)).toBe(a);
  });

  it('never returns the same color for two different active components', () => {
    const keys = Array.from({ length: 40 }, (_, i) => `component_${i}`);
    const map = assignPaletteColors(keys);
    const bases = [...map.values()].map((c) => c.base);
    expect(new Set(bases).size).toBe(keys.length);
  });

  it('assigns by order and is stable when a component is appended', () => {
    const first = assignPaletteColors(['a', 'b', 'c']);
    const grown = assignPaletteColors(['a', 'b', 'c', 'd']);
    // Existing components keep their color when a new one is added.
    expect(grown.get('a')!.base).toBe(first.get('a')!.base);
    expect(grown.get('b')!.base).toBe(first.get('b')!.base);
    expect(grown.get('c')!.base).toBe(first.get('c')!.base);
  });

  it('de-dupes repeated keys to a single color slot', () => {
    const map = assignPaletteColors(['a', 'a', 'b']);
    expect(map.size).toBe(2);
    expect(map.get('a')!.base).toBe(colorForIndex(0).base);
    expect(map.get('b')!.base).toBe(colorForIndex(1).base);
  });

  it('derives border == labelText == base and a low-alpha fill', () => {
    const c = deriveColor('#56B4E9');
    expect(c.border).toBe('#56B4E9');
    expect(c.labelText).toBe('#56B4E9');
    expect(c.base).toBe('#56B4E9');
    expect(c.fill).toMatch(/rgba\(\d+, \d+, \d+, 0\.1\)/);
    expect(c.labelBg).toMatch(/rgba\(\d+, \d+, \d+, 0\.9\)/);
  });

  it('round-trips hex → rgb', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#56B4E9')).toEqual({ r: 0x56, g: 0xb4, b: 0xe9 });
  });

  it('round-trips rgb ↔ hsl ↔ hex closely', () => {
    const { h, s, l } = rgbToHsl(0x56, 0xb4, 0xe9);
    const hex = hslToHex(h, s, l);
    const rgb = hexToRgb(hex);
    expect(Math.abs(rgb.r - 0x56)).toBeLessThanOrEqual(2);
    expect(Math.abs(rgb.g - 0xb4)).toBeLessThanOrEqual(2);
    expect(Math.abs(rgb.b - 0xe9)).toBeLessThanOrEqual(2);
  });
});
