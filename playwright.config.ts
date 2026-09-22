import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the Next.js server in a normal browser (the same
 * webview Tauri hosts). Native folder dialogs are mocked in browser context via
 * the DESHIA_E2E path-input fallback (see src/lib/native-dialog.ts).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DESHIA_E2E: '1' },
  },
});
