import { createProfile, expect, goTo, selectProfile, setNow, test, uniqueName, viewing } from './fixtures';

test.beforeEach(async ({ page }) => {
  await setNow(page, '2026-09-24T12:00');
});

test('adds, edits and deletes (with undo) a historical night @responsive', async ({ page }) => {
  const name = uniqueName('Ellis');
  await createProfile(page, name);
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
  await expect(page.getByText(`${name}: night ending Thu 10 Sep saved`)).toBeVisible();

  const row = page.getByRole('button', { name: /Night ending Thu 10 Sep: 7 h 35 min, 23:35 to 07:10/ });
  await expect(row).toBeVisible();

  // Edit both date and time of an endpoint.
  await row.click();
  dialog = page.getByRole('dialog', { name: 'Edit night' });
  await expect(dialog.getByText(`${name}’s night`)).toBeVisible();
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
  await expect(page.getByText(`${name}: night ending Thu 10 Sep deleted`)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Night ending Thu 10 Sep: 6 h 55 min/ })).toBeVisible();
  await page.getByRole('button', { name: /Night ending Thu 10 Sep: 6 h 55 min/ }).click();
  await page.getByRole('dialog', { name: 'Edit night' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: /No nights for/ })).toBeVisible();
});

test('adding a night for another person opens their existing record instead of duplicating it', async ({ page }) => {
  const name = uniqueName('Ivo');
  await createProfile(page, name);
  await goTo(page, 'History');

  await page.getByRole('button', { name: 'Add night' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add night' });
  await dialog.getByRole('radiogroup', { name: 'Log for' }).getByRole('radio', { name: /Alex/ }).click();
  await expect(dialog.getByText(`Saving for Alex — you’re viewing ${name}.`)).toBeVisible();
  // Fixture week: Alex already has Sun 20 Sep (23:15 → 07:45).
  await dialog.getByLabel('Night ending').fill('2026-09-20');
  await expect(dialog.getByText('Alex already has a record for this night')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save night' })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Edit Alex’s night' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit night' });
  await expect(edit.getByText('Alex’s night')).toBeVisible();
  await expect(edit.getByRole('textbox', { name: 'Bedtime' })).toHaveValue('23:15');
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(viewing(page).getByRole('radio', { name: new RegExp(name) })).toHaveAttribute('aria-checked', 'true');
});

test('shows incomplete and missing nights distinctly in history', async ({ page }) => {
  await page.goto('/history');
  await selectProfile(page, 'Sam');
  // Fixture week: Thu 17 Sep bedtime-only, Sun 20 Sep wake-only, Wed 16 Sep missing.
  await expect(page.getByRole('button', { name: /Night ending Thu 17 Sep: incomplete/ })).toContainText('Bedtime only');
  await expect(page.getByRole('button', { name: /Night ending Sun 20 Sep: incomplete/ })).toContainText('Wake-up only');
  await expect(page.getByRole('button', { name: /Night ending Wed 16 Sep: no record/ })).toBeVisible();
});
