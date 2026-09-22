import type { Config } from 'tailwindcss';

/**
 * DeshiA design system.
 *
 * All colors are CSS variables (see src/app/globals.css) so the dark/light
 * themes stay in one place and no hex values are scattered across components.
 * The semantic annotation palette lives in src/core/annotation/palette.ts and
 * is intentionally NOT expressed here — annotation box colors are assigned
 * deterministically at runtime, not via utility classes.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        'text-secondary': 'var(--text-secondary)',
        muted: 'var(--muted)',
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          fg: 'var(--primary-fg)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        ring: 'var(--ring)',
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        meta: ['12px', { lineHeight: '16px' }],
        'meta-lg': ['13px', { lineHeight: '18px' }],
        body: ['14px', { lineHeight: '20px' }],
        'body-lg': ['15px', { lineHeight: '22px' }],
        section: ['18px', { lineHeight: '24px' }],
        'section-lg': ['22px', { lineHeight: '28px' }],
        title: ['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
        'title-lg': ['32px', { lineHeight: '38px', letterSpacing: '-0.02em' }],
      },
      spacing: {
        '4.5': '18px',
      },
      transitionDuration: {
        DEFAULT: '180ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
