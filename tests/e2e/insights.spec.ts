import type { Page } from '@playwright/test';
import { expect, selectProfile, setNow, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await setNow(page, '2026-09-24T12:00');
  await page.goto('/insights');
});

async function previousWeek(page: Page) {
  await page.getByRole('button', { name: 'Previous period' }).click();
  await expect(page.getByText('14–20 Sep 2026')).toBeVisible();
}

test('shows known fixture-week statistics for a consistent profile', async ({ page }) => {
  await selectProfile(page, 'Alex');
  await previousWeek(page);
  await expect(page.getByTestId('coverage-note')).toHaveText('Based on 7 complete nights of 7');
  const average = page.getByRole('group', { name: 'Avg in bed' });
  await expect(average).toContainText('8 h 9 min');
  await expect(average).toContainText('Median 8 h');
});

test('excludes incomplete and missing nights and aggregates bedtimes around midnight', async ({ page }) => {
  await selectProfile(page, 'Sam');
  await previousWeek(page);
  await expect(page.getByTestId('coverage-note')).toHaveText(
    'Based on 4 complete nights of 7 · 2 incomplete nights and 1 night without records not counted',
  );
  await expect(page.getByRole('group', { name: 'Avg in bed' })).toContainText('8 h 10 min');
  // 00:20, 23:40, 00:50, 01:30 → typical 00:35, not midday.
  await expect(page.getByRole('group', { name: 'Bedtime' })).toContainText('00:35');
  await expect(page.getByRole('group', { name: 'Complete' })).toContainText('4 of 7');
});

test('switches periods and keeps coverage visible', async ({ page }) => {
  for (const [label, range] of [
    ['Month', /1–24 Sep 2026 · so far/],
    ['Year', /1 Jan – 24 Sep 2026 · so far/],
    ['7 days', /18–24 Sep 2026/],
    ['Week', /21–24 Sep 2026 · so far/],
  ] as const) {
    await page.getByRole('radio', { name: label }).click();
    await expect(page.getByText(range)).toBeVisible();
    await expect(page.getByTestId('coverage-note')).toContainText('complete');
  }
  await expect(page.getByRole('button', { name: 'Next period' })).toBeDisabled();
});

test('compares profiles over the same period', async ({ page }) => {
  await selectProfile(page, 'Alex');
  await previousWeek(page);
  const compare = page.getByRole('region', { name: 'Compare people' });
  const list = compare.getByRole('list', { name: 'Comparison' });
  // Other tests may add people to the shared run database; assert on the seeded ones.
  await expect(list.getByRole('listitem').filter({ hasText: 'Alex' })).toContainText('7 of 7');
  await expect(list.getByRole('listitem').filter({ hasText: 'Sam' })).toContainText('4 of 7');
  await expect(list.getByRole('listitem').filter({ hasText: 'Mia' })).toContainText('of 7');
  await compare.getByRole('checkbox', { name: /Sam/ }).uncheck();
  await expect(list.getByRole('listitem').filter({ hasText: 'Sam' })).toHaveCount(0);
  await expect(list.getByRole('listitem').filter({ hasText: 'Alex' })).toBeVisible();
});

test('shows an intentional empty state for a period without complete nights', async ({ page }) => {
  await selectProfile(page, 'Mia');
  await page.getByRole('radio', { name: 'Year' }).click();
  await page.getByRole('button', { name: 'Previous period' }).click();
  await expect(page.getByRole('heading', { name: 'No complete nights in this period' })).toBeVisible();
  await expect(page.getByTestId('coverage-note')).toContainText('Based on 0 complete nights of 365');
});
