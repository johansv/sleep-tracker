import { expect, goTo, setNow, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await setNow(page, '2026-09-24T21:30');
});

test('navigates between the four jobs of the app shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  for (const [label, heading] of [
    ['History', 'History'],
    ['Insights', 'Insights'],
    ['People', 'People'],
    ['Today', 'Today'],
  ] as const) {
    await goTo(page, label);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('deep links are served by the SPA fallback', async ({ page }) => {
  await page.goto('/insights');
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible();
});

test('ships installable, standalone PWA metadata', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get('/icons/apple-touch-icon.png')).ok()).toBe(true);
});

test('is clear about being offline instead of pretending data is current', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText("You're offline.")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("You're offline.")).toBeHidden();
});

test('shows a recoverable error state when the API fails', async ({ page }) => {
  let fail = true;
  await page.route('**/api/stats**', (route) => (fail ? route.abort('failed') : route.fallback()));
  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: "Couldn't load your data" })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('coverage-note')).toBeVisible();
});
