import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
if (!process.env.SLEEP_TEST_RUN_DIR || !process.env.PLAYWRIGHT_BASE_URL)
  throw new Error('Use pnpm test:e2e so tests own their database and server.');
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: resolve(process.env.SLEEP_TEST_RUN_DIR, 'results'),
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Europe/Stockholm',
  },
  projects: [
    {
      name: 'iphone-large',
      use: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'small-mobile',
      use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
