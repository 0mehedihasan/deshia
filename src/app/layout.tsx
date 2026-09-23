import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'DeshiA — Deshi Annotation',
  description:
    'Desktop image annotation workstation for structured computer-vision dataset creation.',
};

/**
 * Root layout. Dark-first by default (the `.light` class on <html> is toggled by
 * the theme control). Geist Sans drives the UI; Geist Mono is reserved for
 * technical metadata (paths, dimensions, IDs) per the design system.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-full bg-bg font-sans text-text antialiased">{children}</body>
    </html>
  );
}
