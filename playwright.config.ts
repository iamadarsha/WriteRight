import { defineConfig } from '@playwright/test';

/**
 * Browser E2E + visual regression (§23.2, §5.6).
 *
 * These run a real Chromium with the built extension loaded, so they need
 * browser binaries: `npx playwright install chromium`. They are NOT part of
 * `npm run check` (which stays reproducible with only `npm`); they run in a
 * dedicated CI job and before a release.
 *
 * Build the extension first: `npm run build`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'e2e',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /visual\.spec\.ts/,
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      snapshotDir: 'e2e/__screenshots__',
      use: { colorScheme: 'light' },
    },
  ],
});
