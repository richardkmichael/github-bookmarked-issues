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
      // 2% threshold: tolerates system font differences across platforms
      // (macOS: San Francisco, Linux: Noto Sans/DejaVu, Windows: Segoe UI)
      maxDiffPixelRatio: 0.02,
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
