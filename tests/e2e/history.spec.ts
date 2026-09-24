import { createProfile, expect, uniqueName, goTo, selectProfile, setNow, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await setNow(page, '2026-09-24T12:00');
});

test('adds, edits and deletes (with undo) a historical night', async ({ page }) => {
  await createProfile(page, uniqueName('Ellis'));
  await goTo(page, 'History');
  await expect(page.getByRole('heading', { name: /No nights for/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add night' }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Add night' });
  await dialog.getByLabel('Night ending').fill('2026-09-10');
  const bed = dialog.getByRole('textbox', { name: 'Bedtime' });
  await bed.fill('23:35');
  await bed.press('Enter');
  const wake = dialog.getByRole('textbox', { name: 'Wake-up' });
  await wake.fill('07:10');
  await wake.press('Enter');
  await expect(dialog.getByText('7 h 35 min')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save night' }).click();

  const row = page.getByRole('button', { name: /Night ending Thu 10 Sep: 7 h 35 min, 23:35 to 07:10/ });
  await expect(row).toBeVisible();
  // Nights after the first record without data are missing, never zero.
  await expect(
    page
      .getByRole('button', { name: /Night ending Fri 11 Sep: no record/ })
      .or(page.getByText(/nights without records/).first()),
  ).toBeVisible();

  // Edit both date and time of an endpoint.
  await row.click();
  dialog = page.getByRole('dialog', { name: 'Edit night' });
  await dialog.getByRole('radio', { name: 'Thu 10 Sep' }).click();
  const bed2 = dialog.getByRole('textbox', { name: 'Bedtime' });
  await bed2.fill('00:15');
  await bed2.press('Enter');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const edited = page.getByRole('button', { name: /Night ending Thu 10 Sep: 6 h 55 min, 00:15 to 07:10/ });
  await expect(edited).toBeVisible();

  // Delete, undo, then delete for good.
  await edited.click();
  await page.getByRole('dialog', { name: 'Edit night' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Night ending Thu 10 Sep deleted')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Night ending Thu 10 Sep: 6 h 55 min/ })).toBeVisible();
  await page.getByRole('button', { name: /Night ending Thu 10 Sep: 6 h 55 min/ }).click();
  await page.getByRole('dialog', { name: 'Edit night' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: /No nights for/ })).toBeVisible();
});

test('shows incomplete and missing nights distinctly in history', async ({ page }) => {
  await page.goto('/history');
  await selectProfile(page, 'Sam');
  // Fixture week: Thu 17 Sep bedtime-only, Sun 20 Sep wake-only, Wed 16 Sep missing.
  await expect(page.getByRole('button', { name: /Night ending Thu 17 Sep: incomplete/ })).toContainText('Bedtime only');
  await expect(page.getByRole('button', { name: /Night ending Sun 20 Sep: incomplete/ })).toContainText('Wake-up only');
  await expect(page.getByRole('button', { name: /Night ending Wed 16 Sep: no record/ })).toBeVisible();
});

test('rejects a second record for the same night', async ({ page }) => {
  await createProfile(page, uniqueName('Dup'));
  await goTo(page, 'History');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Add night' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add night' });
    await dialog.getByLabel('Night ending').fill('2026-09-20');
    await dialog.getByRole('button', { name: 'Save night' }).click();
    if (i === 1) {
      await expect(dialog.getByText('This profile already has a record for that night.')).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
    }
  }
});
