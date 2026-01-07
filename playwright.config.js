import { defineConfig, devices } from '@playwright/test';

// Prevent list reporter from truncating test names
process.stdout.columns = 200;

export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: '{snapshotDir}/{arg}{ext}',
  snapshotDir: './tests/screenshots',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
  expect: {
    toHaveScreenshot: {
      // Balanced threshold: catch CSS issues while allowing rendering variance
      // 0.5% catches missing button gaps (~8px) but tolerates font anti-aliasing
      maxDiffPixelRatio: 0.005,
      // Per-pixel threshold: allow slight color variance from anti-aliasing
      threshold: 0.2,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
