import { createProfile, expect, goTo, setNow, test, uniqueName, viewing } from './fixtures';

test('administers profiles: create, rename, deactivate, inspect history, reactivate', async ({ page }) => {
  await setNow(page, '2026-09-24T21:30');
  const name = uniqueName('Robin');
  const renamed = uniqueName('Robyn');
  await createProfile(page, name);

  const active = page.getByRole('region', { name: 'Active' });
  const row = active.getByRole('listitem').filter({ hasText: name });
  await row.getByRole('button', { name: `Edit ${name}` }).click();
  const dialog = page.getByRole('dialog', { name: `Edit ${name}` });
  await dialog.getByRole('textbox', { name: 'Name' }).fill(renamed);
  await dialog.getByRole('radio', { name: 'rose' }).check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(active.getByText(renamed)).toBeVisible();

  await active.getByRole('listitem').filter({ hasText: renamed }).getByRole('button', { name: 'Deactivate' }).click();
  const inactive = page.getByRole('region', { name: 'Inactive' });
  await expect(inactive.getByText(renamed)).toBeVisible();

  // Inactive profiles are not offered for logging…
  await goTo(page, 'Today');
  await viewing(page).getByRole('radio', { name: /Alex/ }).click();
  await expect(viewing(page).getByRole('radio', { name: new RegExp(renamed) })).toHaveCount(0);

  // …but their history remains inspectable (demo profile Olle is inactive with history).
  await goTo(page, 'People');
  await inactive.getByRole('listitem').filter({ hasText: 'Olle' }).getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Olle/ })).toHaveAttribute('aria-checked', 'true');
  // Olle's records ended in May; history starts at the latest record, not months of empty rows.
  await expect(page.getByRole('heading', { name: 'May 2026' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Night ending Wed 27 May: .* Edit/ })).toBeVisible();

  await goTo(page, 'People');
  await inactive.getByRole('listitem').filter({ hasText: renamed }).getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByRole('region', { name: 'Active' }).getByText(renamed)).toBeVisible();
});
