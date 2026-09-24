import type { Page } from '@playwright/test';
import { createProfile, expect, goTo, selectProfile, setNow, test, uniqueName, viewing } from './fixtures';

const hero = (page: Page, night: string) => page.getByRole('region', { name: new RegExp(`night ending ${night}`) });

test('logs bedtime in the evening and wake-up in the morning with one tap each', async ({ page }) => {
  const name = uniqueName('Kim');
  await setNow(page, '2026-09-24T22:40');
  await createProfile(page, name);
  await goTo(page, 'Today');

  const evening = hero(page, 'Fri 25 Sep');
  await expect(evening.getByRole('heading', { name: 'Ready for bed?' })).toBeVisible();
  await evening.getByRole('button', { name: 'Going to bed' }).click();
  await expect(page.getByText(`${name}: bedtime 22:40 saved`)).toBeVisible();
  await expect(evening.getByText('In bed since')).toBeVisible();

  await setNow(page, '2026-09-25T06:55');
  await page.reload();
  const morning = hero(page, 'Fri 25 Sep');
  await expect(morning.getByText('8 h 15 min so far')).toBeVisible();
  await morning.getByRole('button', { name: "I'm up" }).click();
  await expect(morning.getByText('Time in bed')).toBeVisible();
  await expect(morning.getByText('22:40 → 06:55')).toBeVisible();

  // Undo reverts the wake-up, leaving the night incomplete again.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(morning.getByText('In bed since')).toBeVisible();
});

test('completes an incomplete wake-only night', async ({ page }) => {
  await setNow(page, '2026-09-24T07:15');
  await createProfile(page, uniqueName('Noa'));
  await goTo(page, 'Today');
  const card = hero(page, 'Thu 24 Sep');
  await card.getByRole('button', { name: "I'm up" }).click();
  await expect(card.getByText('Add your bedtime to complete this night.')).toBeVisible();

  await card.getByRole('button', { name: 'Add bedtime' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit night' });
  await dialog.getByRole('switch', { name: 'Bedtime recorded' }).click();
  await dialog.getByRole('radio', { name: 'Thu 24 Sep' }).click();
  const bed = dialog.getByRole('textbox', { name: 'Bedtime' });
  await bed.fill('00:40');
  await bed.press('Enter');
  await expect(dialog.getByText('6 h 35 min')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByText('00:40 → 07:15')).toBeVisible();
});

test('logs for another person without changing who is viewed, acting on their real night', async ({ page }) => {
  const kim = uniqueName('Kim');
  await setNow(page, '2026-09-24T22:40');
  await createProfile(page, kim);
  await goTo(page, 'Today');
  await selectProfile(page, 'Alex');

  const card = hero(page, 'Fri 25 Sep');
  const logFor = card.getByRole('radiogroup', { name: 'Log for' });
  await logFor.getByRole('radio', { name: kim }).click();
  await expect(card.getByRole('status')).toContainText(`Logging for ${kim} · you’re viewing Alex`);
  await card.getByRole('button', { name: 'Going to bed' }).click();
  await expect(page.getByText(`${kim}: bedtime 22:40 saved`)).toBeVisible();

  // The target was transient: viewing stays on Alex, and Alex's own night is untouched.
  await expect(viewing(page).getByRole('radio', { name: /Alex/ })).toHaveAttribute('aria-checked', 'true');
  await expect(logFor.getByRole('radio', { name: /Alex/ })).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByRole('heading', { name: 'Ready for bed?' })).toBeVisible();

  // Next morning the other person's existing incomplete night is completed, not duplicated.
  await setNow(page, '2026-09-25T06:55');
  await page.reload();
  const morning = hero(page, 'Fri 25 Sep');
  await morning.getByRole('radiogroup', { name: 'Log for' }).getByRole('radio', { name: kim }).click();
  await expect(morning.getByText('In bed since')).toBeVisible();
  await morning.getByRole('button', { name: "I'm up" }).click();
  await expect(page.getByText(`${kim}: wake-up 06:55 saved`)).toBeVisible();

  await selectProfile(page, kim);
  await goTo(page, 'History');
  await expect(page.getByRole('button', { name: /Night ending Fri 25 Sep: 8 h 15 min, 22:40 to 06:55/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Night ending .*Edit/ })).toHaveCount(1);
});
