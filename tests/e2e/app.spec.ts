import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.getByText('Gathering your nights…')).toBeHidden();
}
async function go(page: Page, label: string) {
  await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
  await ready(page);
}
async function anchor(page: Page) {
  await page.getByLabel('Period anchor date').fill('2026-09-24');
  await ready(page);
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-24T08:00:00+02:00') });
  await page.goto('/');
  await ready(page);
});

test('responsive shell, representative insights and online-only PWA', async ({
  page,
  request,
}, info) => {
  await expect(page.getByRole('heading', { name: 'A little more clarity, Alex.' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('today.png'), fullPage: true });
  await go(page, 'Insights');
  await anchor(page);
  await expect(page.getByText('6 complete nights of 7').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Everyone’s rhythm' })).toBeVisible();
  await expect(page.getByText('Jamie', { exact: true }).last()).toBeVisible();
  for (const label of ['Week', 'Month', 'Year', 'Last 7 days']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await ready(page);
    await expect(page.getByRole('heading', { name: 'Your nightly rhythm' })).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath('insights.png'), fullPage: true });
  await page.getByText('View nightly values').click();
  await expect(page.getByRole('cell', { name: 'incomplete', exact: true })).toHaveCount(1);
  await go(page, 'History');
  await anchor(page);
  await expect(page.getByText('Incomplete', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('history.png'), fullPage: true });
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
  }
  expect(
    await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)),
  ).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('profile administration and complete night lifecycle', async ({ page }, info) => {
  await go(page, 'Profiles');
  await page.getByRole('button', { name: 'Add profile', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(`Taylor ${info.project.name}`);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
  await page.getByLabel('Selected profile').selectOption({ label: `Taylor ${info.project.name}` });
  await ready(page);
  await go(page, 'Today');
  await expect(page.getByRole('heading', { name: 'How was your night?' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('empty.png'), fullPage: true });
  await go(page, 'Insights');
  await expect(
    page.getByRole('heading', { name: 'A little history goes a long way' }),
  ).toBeVisible();
  await go(page, 'Today');
  await page.getByRole('button', { name: 'I’m up' }).click();
  await ready(page);
  await expect(page.getByRole('heading', { name: 'A night to finish.' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('incomplete.png'), fullPage: true });
  await page.getByRole('button', { name: 'Review this night' }).click();
  await page.getByLabel('Bedtime date', { exact: true }).fill('2026-09-23');
  await page.getByLabel('Bedtime time', { exact: true }).fill('23:30');
  await page.getByRole('button', { name: 'Save night', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
  await expect(page.getByRole('heading', { name: '8 h 30 min' })).toBeVisible();
  await page.reload();
  await ready(page);
  await page.getByLabel('Selected profile').selectOption({ label: `Taylor ${info.project.name}` });
  await ready(page);
  await expect(page.getByRole('heading', { name: '8 h 30 min' })).toBeVisible();
  await go(page, 'History');
  await anchor(page);
  await page.getByRole('button', { name: 'Add night ending 2026-09-22', exact: true }).click();
  await page.getByLabel('Bedtime date', { exact: true }).fill('2026-09-22');
  await page.getByLabel('Bedtime time', { exact: true }).fill('00:40');
  await page.getByLabel('Wake-up time', { exact: true }).fill('08:15');
  await page.screenshot({ path: info.outputPath('editor.png'), fullPage: true });
  expect(
    await page.getByLabel('Wake-up time', { exact: true }).evaluate((el) => el.clientWidth),
  ).toBeGreaterThanOrEqual(85);
  await page.getByRole('button', { name: 'Save night', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
  await expect(page.getByText('7 h 35 min', { exact: true })).toBeVisible();
  await go(page, 'Insights');
  await anchor(page);
  await expect(page.getByText('2 complete nights of 7').first()).toBeVisible();
  await go(page, 'History');
  await page.getByRole('button', { name: 'Edit night ending 2026-09-22', exact: true }).click();
  await page.getByLabel('Wake-up date', { exact: true }).fill('2026-09-21');
  await page.getByRole('button', { name: 'Save night', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Wake-up must be later');
  await page.getByLabel('Wake-up date', { exact: true }).fill('2026-09-23');
  await page.getByLabel('Bedtime date', { exact: true }).fill('2026-09-23');
  await page.getByRole('button', { name: 'Save night', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
  await page.getByRole('button', { name: 'Edit night ending 2026-09-23', exact: true }).click();
  await page.getByRole('button', { name: 'Delete night', exact: true }).click();
  await page.getByRole('button', { name: 'Keep night', exact: true }).click();
  await page.getByRole('button', { name: 'Delete night', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
  await expect(
    page.getByRole('button', { name: 'Add night ending 2026-09-23', exact: true }),
  ).toBeVisible();
  await go(page, 'Profiles');
  await page.getByRole('button', { name: `Edit Taylor ${info.project.name}`, exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(`Archived ${info.project.name}`);
  await page.getByLabel('Active profile', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
  await go(page, 'History');
  await expect(page.getByText('This profile is inactive.', { exact: false })).toBeVisible();
  await expect(page.getByText('8 h 30 min', { exact: true })).toBeVisible();
});

test('connection errors, retry, loading and keyboard modal dismissal', async ({ page }, info) => {
  await page.route('**/api/profiles', (route) => route.abort());
  await go(page, 'History');
  await expect(page.getByRole('alert')).toContainText('Connection lost');
  await page.screenshot({ path: info.outputPath('error.png'), fullPage: true });
  await page.unroute('**/api/profiles');
  await page.getByRole('button', { name: 'Try again' }).click();
  await ready(page);
  await page.getByRole('link', { name: 'Skip to content' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your nights, at a glance.' })).toBeVisible();
  await expect(page.locator('#main')).toBeFocused();
  await page.getByRole('button', { name: 'Add night', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add night', exact: true })).toBeFocused();
  await page.context().setOffline(true);
  await expect(page.getByRole('alert')).toContainText('You’re offline');
  await page.context().setOffline(false);
  await ready(page);
  await page.route('**/api/profiles', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.getByRole('navigation').getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByText('Gathering your nights…')).toBeVisible();
  await page.screenshot({ path: info.outputPath('loading.png'), fullPage: true });
  await ready(page);
});

test('one-tap bedtime then wake-up across midnight', async ({ page, request }, info) => {
  const name = `Quick ${info.project.name}`;
  await request.post('/api/profiles', { data: { name, is_active: true } });
  await page.reload();
  await ready(page);
  await page.getByLabel('Selected profile').selectOption({ label: name });
  await ready(page);
  await page.clock.setFixedTime(new Date('2026-09-24T23:35:00+02:00'));
  await page.getByRole('button', { name: 'I’m going to bed' }).click();
  await ready(page);
  await expect(page.getByRole('button', { name: 'Complete 25 Sept' })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-09-25T07:10:00+02:00'));
  await page.getByRole('button', { name: 'I’m up' }).click();
  await ready(page);
  await expect(page.getByRole('heading', { name: '7 h 35 min' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m up' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit your night' })).toBeVisible();
  await expect(page.getByLabel('Wake-up time', { exact: true })).toHaveValue('07:10');
});
