/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native Node modules used only on the server (DB, image processing) must not
  // be bundled into the client. They are marked external for server components.
  serverExternalPackages: ['better-sqlite3', 'sharp'],
  // Keep the desktop build self-contained; Tauri wraps a `next start` server
  // (see docs/architecture.md) so we use the standalone output.
  output: 'standalone',
  eslint: {
    // Lint is run explicitly in CI via `pnpm lint`; do not fail production
    // builds on lint so packaging stays deterministic.
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // All imagery is local filesystem content served through our own route
    // handler; the Next image optimizer is not used for annotation frames.
    unoptimized: true,
  },
};

export default nextConfig;
