import type { Page } from '@playwright/test';
import { createProfile, expect, goTo, selectProfile, setNow, test, uniqueName } from './fixtures';

const hero = (page: Page, night: string) => page.getByRole('region', { name: new RegExp(`night ending ${night}`) });

test('logs bedtime in the evening and wake-up in the morning, reviewed before saving @responsive', async ({ page }) => {
  const name = uniqueName('Kim');
  await setNow(page, '2026-09-24T22:40');
  await createProfile(page, name);
  await goTo(page, 'Today');

  const evening = hero(page, 'Fri 25 Sep');
  await expect(evening.getByRole('heading', { name: 'Ready for bed?' })).toBeVisible();
  // One profile context: Today has no second "log for" selector.
  await expect(page.getByRole('radiogroup', { name: /Log for/ })).toHaveCount(0);

  // Opening the editor writes nothing: cancelling leaves the night empty.
  await evening.getByRole('button', { name: 'Going to bed' }).click();
  let dialog = page.getByRole('dialog', { name: 'Add night' });
  await expect(dialog.getByText(`${name}’s night`)).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Bedtime' })).toHaveValue('22:40');
  await expect(dialog.getByRole('group', { name: 'Went to bed' })).toContainText('Suggested · not saved');
  await expect(dialog.getByRole('textbox', { name: 'Wake-up' })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(evening.getByRole('heading', { name: 'Ready for bed?' })).toBeVisible();

  // Adjust the suggestion and save bedtime alone as the in-progress night.
  await evening.getByRole('button', { name: 'Going to bed' }).click();
  dialog = page.getByRole('dialog', { name: 'Add night' });
  await dialog.getByRole('button', { name: 'Bedtime 5 minutes earlier' }).click();
  await dialog.getByRole('button', { name: 'Save night' }).click();
  await expect(page.getByText(`${name}: night ending Fri 25 Sep saved`)).toBeVisible();
  await expect(evening.getByText('In bed since')).toBeVisible();
  await expect(evening.getByText('22:35')).toBeVisible();

  await setNow(page, '2026-09-25T06:55');
  await page.reload();
  const morning = hero(page, 'Fri 25 Sep');
  await expect(morning.getByText('8 h 20 min in bed so far')).toBeVisible();
  await morning.getByRole('button', { name: "I'm up" }).click();
  dialog = page.getByRole('dialog', { name: 'Edit night' });
  await expect(dialog.getByRole('group', { name: 'Went to bed' })).toContainText('Recorded');
  await expect(dialog.getByRole('textbox', { name: 'Bedtime' })).toHaveValue('22:35');
  await expect(dialog.getByRole('textbox', { name: 'Wake-up' })).toHaveValue('06:55');
  await expect(dialog.getByText('8 h 20 min')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(morning.getByText('Time in bed')).toBeVisible();
  await expect(morning.getByText('22:35 → 06:55')).toBeVisible();
});

test('a morning wake-up needs a bedtime before the night can be saved', async ({ page }) => {
  await setNow(page, '2026-09-24T07:15');
  await createProfile(page, uniqueName('Noa'));
  await goTo(page, 'Today');
  const card = hero(page, 'Thu 24 Sep');
  await card.getByRole('button', { name: "I'm up" }).click();

  const dialog = page.getByRole('dialog', { name: 'Add night' });
  await expect(dialog.getByRole('textbox', { name: 'Wake-up' })).toHaveValue('07:15');
  await expect(dialog.getByText('Add the bedtime to save this night.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save night' })).toBeDisabled();

  // After midnight on the night itself: the date follows from the clock times.
  const bed = dialog.getByRole('textbox', { name: 'Bedtime' });
  await bed.fill('00:40');
  await bed.press('Enter');
  await expect(dialog.getByRole('group', { name: 'Went to bed' })).toContainText('Thu 24 Sep');
  await expect(dialog.getByText('6 h 35 min')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save night' }).click();
  await expect(card.getByText('00:40 → 07:15')).toBeVisible();
});

test('logs one person, switches profile and logs the next in the same focused editor', async ({ page }) => {
  const kim = uniqueName('Kim');
  const noa = uniqueName('Noa');
  await setNow(page, '2026-09-24T20:10');
  await createProfile(page, kim);
  await createProfile(page, noa);
  await goTo(page, 'Today');

  for (const name of [kim, noa]) {
    await selectProfile(page, name);
    const card = hero(page, 'Fri 25 Sep');
    await expect(card).toContainText(`${name} · night ending`);
    await card.getByRole('button', { name: 'Going to bed' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add night' });
    await expect(dialog.getByText(`${name}’s night`)).toBeVisible();
    await dialog.getByRole('button', { name: 'Save night' }).click();
    await expect(page.getByText(`${name}: night ending Fri 25 Sep saved`)).toBeVisible();
    await expect(card.getByText('Going to bed at')).toHaveCount(0);
    await expect(card.getByText('In bed since')).toBeVisible();
  }

  // Each person's night stayed their own.
  await selectProfile(page, kim);
  await expect(hero(page, 'Fri 25 Sep').getByText('20:10')).toBeVisible();
});

test('an old bedtime-only night is shown as needing completion, not as still in bed', async ({ page }) => {
  await setNow(page, '2026-09-24T22:40');
  await createProfile(page, uniqueName('Ari'));
  await goTo(page, 'Today');
  await hero(page, 'Fri 25 Sep').getByRole('button', { name: 'Going to bed' }).click();
  await page.getByRole('dialog', { name: 'Add night' }).getByRole('button', { name: 'Save night' }).click();

  await setNow(page, '2026-09-25T14:30');
  await page.reload();
  const card = hero(page, 'Fri 25 Sep');
  await expect(card.getByText('Wake-up missing')).toBeVisible();
  await expect(card.getByText(/so far/)).toHaveCount(0);
  await card.getByRole('button', { name: 'Add wake-up' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit night' });
  await expect(dialog.getByRole('textbox', { name: 'Wake-up' })).toHaveValue('');
  await expect(dialog.getByRole('textbox', { name: 'Bedtime' })).toHaveValue('22:40');
});
