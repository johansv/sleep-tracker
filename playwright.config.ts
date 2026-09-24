import { defineConfig, devices } from '@playwright/test';

/**
 * Run through `pnpm test:e2e`, which prepares isolated D1 state and a build and sets the
 * variables below. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a preinstalled Chromium.
 */
const port = Number(process.env.E2E_PORT ?? 4173);
const inspectorPort = Number(process.env.E2E_INSPECTOR_PORT ?? 9230);
const outDir = process.env.E2E_OUT_DIR;
const stateDir = process.env.SLEEP_TRACKER_STATE_DIR;
if (!outDir || !stateDir) {
  throw new Error('Run E2E tests with `pnpm test:e2e` so they get their own isolated database and build.');
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: `test-results/${process.env.E2E_RUN_ID ?? 'local'}`,
  // Tests share one seeded database per run; mutating tests use their own profiles/nights.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Europe/Stockholm',
    locale: 'en-GB',
    colorScheme: 'dark',
    launchOptions,
  },
  projects: [
    {
      name: 'iphone-15-pro-max',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'small-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // The production build in the local Workers runtime, against this run's isolated D1 state.
    command: [
      'pnpm exec wrangler dev --local',
      `-c "${outDir}/sleep_tracker/wrangler.json"`,
      `--persist-to "${stateDir}"`,
      `--ip 127.0.0.1 --port ${port} --inspector-port ${inspectorPort}`,
      '--show-interactive-dev-session=false',
    ].join(' '),
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
