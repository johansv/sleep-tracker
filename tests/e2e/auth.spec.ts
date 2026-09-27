import { expect, goTo, setNow, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Real sign-in against the local build. Other journeys use the loopback-only local identity; this
 * spec opts out of it so the app behaves exactly as a remote environment does. The password is
 * the E2E run's disposable test fixture (scripts/e2e.ts).
 */
test.use({ extraHTTPHeaders: { 'x-sleep-tracker-auth': 'enforce' } });

const password = process.env.E2E_PASSWORD!;

test.beforeEach(async ({ page }) => {
  await setNow(page, '2026-09-24T21:30');
});

async function signIn(page: Page, value: string) {
  await page.getByLabel('Password').fill(value);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('keeps data behind sign-in and signs out again @responsive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Sleep Tracker' })).toBeVisible();
  await expect(page.getByLabel('Password')).toBeFocused();
  expect((await page.request.get('/api/profiles')).status()).toBe(401);

  await signIn(page, 'not the password');
  await expect(page.getByRole('alert')).toHaveText('That password is not right.');
  await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');

  await signIn(page, password);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  expect((await page.request.get('/api/profiles')).status()).toBe(200);

  // The session survives a reload (HttpOnly cookie, not script-visible state).
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).toBe('');

  await goTo(page, 'People');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sleep Tracker' })).toBeVisible();
  expect((await page.request.get('/api/profiles')).status()).toBe(401);
});

test('returns to sign-in when the session ends elsewhere', async ({ page, context }) => {
  await page.goto('/history');
  await signIn(page, password);
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();

  // E.g. the session expired or the password was rotated: the app notices on its next refresh
  // (here: returning to the foreground) and drops the loaded data.
  await context.clearCookies();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { level: 1, name: 'Sleep Tracker' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toHaveCount(0);
});
