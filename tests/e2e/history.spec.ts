import { createProfile, expect, goTo, selectProfile, setNow, test, uniqueName } from './fixtures';

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
  // Whose night is fixed and shown; there is no way to move it to someone else.
  await expect(dialog.getByText(`${name}’s night`)).toBeVisible();
  await expect(dialog.getByRole('radiogroup')).toHaveCount(0);
  // A past night starts empty and needs both endpoints.
  await expect(dialog.getByRole('textbox', { name: 'Bedtime' })).toHaveValue('');
  await expect(dialog.getByRole('textbox', { name: 'Wake-up' })).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Save night' })).toBeDisabled();

  await dialog.getByLabel('Night ending').fill('2026-09-10');
  const bed = dialog.getByRole('textbox', { name: 'Bedtime' });
  await bed.fill('23:35');
  await bed.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Save night' })).toBeDisabled();
  const wake = dialog.getByRole('textbox', { name: 'Wake-up' });
  await wake.fill('07:10');
  await wake.press('Enter');
  await expect(dialog.getByRole('group', { name: 'Went to bed' })).toContainText('Wed 9 Sep');
  await expect(dialog.getByText('7 h 35 min')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save night' }).click();
  await expect(page.getByText(`${name}: night ending Thu 10 Sep saved`)).toBeVisible();

  const row = page.getByRole('button', { name: /Night ending Thu 10 Sep: 7 h 35 min, 23:35 to 07:10/ });
  await expect(row).toBeVisible();

  // Moving the bedtime past midnight re-derives its date.
  await row.click();
  dialog = page.getByRole('dialog', { name: 'Edit night' });
  await expect(dialog.getByText(`${name}’s night`)).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Went to bed' })).toContainText('Recorded');
  const bed2 = dialog.getByRole('textbox', { name: 'Bedtime' });
  await bed2.fill('00:15');
  await bed2.press('Enter');
  await expect(dialog.getByRole('group', { name: 'Went to bed' })).toContainText('Thu 10 Sep');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const edited = page.getByRole('button', { name: /Night ending Thu 10 Sep: 6 h 55 min, 00:15 to 07:10/ });
  await expect(edited).toBeVisible();

  // Adding the same night again points to the existing record instead of duplicating it.
  await page.getByRole('button', { name: 'Add night' }).first().click();
  const again = page.getByRole('dialog', { name: 'Add night' });
  await again.getByLabel('Night ending').fill('2026-09-10');
  await expect(again.getByText(`${name} already has a record for this night`)).toBeVisible();
  await again.getByRole('button', { name: `Edit ${name}’s night` }).click();
  await expect(page.getByRole('dialog', { name: 'Edit night' }).getByRole('textbox', { name: 'Bedtime' })).toHaveValue(
    '00:15',
  );

  // Delete, undo, then delete for good.
  await page.getByRole('dialog', { name: 'Edit night' }).getByRole('button', { name: 'Delete night' }).click();
  await expect(page.getByText(`${name}: night ending Thu 10 Sep deleted`)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Night ending Thu 10 Sep: 6 h 55 min/ })).toBeVisible();
  await page.getByRole('button', { name: /Night ending Thu 10 Sep: 6 h 55 min/ }).click();
  await page.getByRole('dialog', { name: 'Edit night' }).getByRole('button', { name: 'Delete night' }).click();
  await expect(page.getByRole('heading', { name: /No nights for/ })).toBeVisible();
});

test('draws a night that ends before midnight on its night date', async ({ page }) => {
  await createProfile(page, uniqueName('Eve'));
  await goTo(page, 'History');
  await page.getByRole('button', { name: 'Add night' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add night' });
  await dialog.getByLabel('Night ending').fill('2026-09-23');
  for (const [label, value] of [
    ['Bedtime', '19:30'],
    ['Wake-up', '23:25'],
  ] as const) {
    const field = dialog.getByRole('textbox', { name: label });
    await field.fill(value);
    await field.press('Enter');
  }
  await expect(dialog.getByRole('group', { name: 'Went to bed' })).toContainText('Wed 23 Sep');
  await dialog.getByRole('button', { name: 'Save night' }).click();

  const row = page.getByRole('button', { name: /Night ending Wed 23 Sep: 3 h 55 min, 19:30 to 23:25/ });
  await expect(row).toBeVisible();
  // The evening interval sits inside the 18:00 → 12:00 timeline instead of collapsing at its edge.
  const bar = await row.evaluate((el) => {
    const track = el.querySelector('[aria-hidden="true"][class*="track"]')!;
    const span = track.querySelector('[class*="bar"]')!.getBoundingClientRect();
    const box = track.getBoundingClientRect();
    return { left: (span.left - box.left) / box.width, width: span.width / box.width };
  });
  expect(bar.left).toBeGreaterThan(0.05);
  expect(bar.width).toBeGreaterThan(0.15);
});

test('repairs a legacy wake-only night by adding its bedtime', async ({ page }) => {
  const name = uniqueName('Ivo');
  await createProfile(page, name);
  // Normal UI can no longer create wake-only nights, so seed one through the API.
  const { profiles } = await (await page.request.get('/api/profiles')).json();
  const profileId = profiles.find((p: { name: string }) => p.name === name).id;
  const created = await page.request.post('/api/sessions', {
    data: { profileId, nightDate: '2026-09-20', bedtime: null, wakeTime: '2026-09-20T07:45' },
  });
  expect(created.ok()).toBe(true);

  await goTo(page, 'History');
  const row = page.getByRole('button', { name: /Night ending Sun 20 Sep: incomplete/ });
  await expect(row).toContainText('Wake-up only');
  await row.click();
  const dialog = page.getByRole('dialog', { name: 'Edit night' });
  await expect(dialog.getByRole('group', { name: 'Got up' })).toContainText('Recorded');
  await expect(dialog.getByRole('group', { name: 'Went to bed' })).toContainText('Not recorded');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  const bed = dialog.getByRole('textbox', { name: 'Bedtime' });
  await bed.fill('23:15');
  await bed.press('Enter');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /Night ending Sun 20 Sep: 8 h 30 min, 23:15 to 07:45/ })).toBeVisible();
});

test('shows incomplete and missing nights distinctly in history', async ({ page }) => {
  await page.goto('/history');
  await selectProfile(page, 'Sam');
  // Fixture week: Thu 17 Sep bedtime-only, Sun 20 Sep wake-only, Wed 16 Sep missing.
  await expect(page.getByRole('button', { name: /Night ending Thu 17 Sep: incomplete/ })).toContainText('Bedtime only');
  await expect(page.getByRole('button', { name: /Night ending Sun 20 Sep: incomplete/ })).toContainText('Wake-up only');
  await expect(page.getByRole('button', { name: /Night ending Wed 16 Sep: no record/ })).toBeVisible();
});
