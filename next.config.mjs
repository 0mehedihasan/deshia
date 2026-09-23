/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native Node modules used only on the server (DB, image processing) must not
  // be bundled into the client. They are marked external for server components.
  // (Next 14 exposes this under `experimental`; it graduates to a top-level
  // `serverExternalPackages` key in Next 15.)
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'sharp'],
  },
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
  webpack: (config) => {
    // Konva's node entry (index-node.js) does an optional `require('canvas')`
    // for server-side rendering. We only ever use Konva in the browser
    // (react-konva is dynamically imported with `ssr: false`), so the native
    // `canvas` package isn't installed. Alias it to false so webpack resolves
    // it to an empty module instead of failing the build.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
