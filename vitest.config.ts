import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'e2e', 'src-tauri'],
    // Native modules (better-sqlite3) can crash a Vitest worker thread on
    // constrained CI runners. Forks with a small pool are slower but stable.
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/schemas/**', 'src/utils/**'],
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
