import { createProfile, expect, uniqueName, goTo, setNow, test } from './fixtures';

test('logs bedtime in the evening and wake-up in the morning with one tap each', async ({ page }) => {
  await setNow(page, '2026-09-24T22:40');
  await createProfile(page, uniqueName('Kim'));
  await goTo(page, 'Today');

  const hero = page.getByRole('region', { name: /Night ending Fri 25 Sep/ });
  await expect(hero.getByRole('heading', { name: 'Ready for bed?' })).toBeVisible();
  await hero.getByRole('button', { name: 'Going to bed' }).click();
  await expect(page.getByText('Bedtime 22:40 saved. Sleep well.')).toBeVisible();
  await expect(hero.getByText('In bed since')).toBeVisible();
  await expect(hero.getByText('22:40')).toBeVisible();

  // Next morning.
  await setNow(page, '2026-09-25T06:55');
  await page.reload();
  const morning = page.getByRole('region', { name: /Night ending Fri 25 Sep/ });
  await expect(morning.getByText('8 h 15 min so far')).toBeVisible();
  await morning.getByRole('button', { name: "I'm up" }).click();
  await expect(morning.getByText('Time in bed')).toBeVisible();
  await expect(morning.getByText('8 h 15 min')).toBeVisible();
  await expect(morning.getByText('22:40 → 06:55')).toBeVisible();

  // Undo reverts the wake-up, leaving the night incomplete again.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(morning.getByText('In bed since')).toBeVisible();
});

test('completes an incomplete wake-only night', async ({ page }) => {
  await setNow(page, '2026-09-24T07:15');
  await createProfile(page, uniqueName('Noa'));
  await goTo(page, 'Today');
  const hero = page.getByRole('region', { name: /Night ending Thu 24 Sep/ });
  await hero.getByRole('button', { name: "I'm up" }).click();
  await expect(hero.getByText('Add your bedtime to complete this night.')).toBeVisible();

  await hero.getByRole('button', { name: 'Add bedtime' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit night' });
  await dialog.getByRole('switch', { name: 'Bedtime recorded' }).click();
  await dialog.getByRole('radio', { name: 'Thu 24 Sep' }).click();
  const bed = dialog.getByRole('textbox', { name: 'Bedtime' });
  await bed.fill('00:40');
  await bed.press('Enter');
  await expect(dialog.getByText('6 h 35 min')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(hero.getByText('6 h 35 min')).toBeVisible();
  await expect(hero.getByText('00:40 → 07:15')).toBeVisible();
});
