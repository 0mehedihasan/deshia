import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'e2e', 'src-tauri'],
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
