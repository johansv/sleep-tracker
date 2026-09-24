import { expect, test, type Page } from '@playwright/test';

/** Local wall-clock "now" for tests; the seeded demo data is anchored at 2026-09-24. */
export async function setNow(page: Page, localDateTime: string) {
  // Browser runs in Europe/Stockholm (CEST in September: +02:00).
  await page.clock.setFixedTime(new Date(`${localDateTime}:00+02:00`));
}

/** Profile name unique per test run and viewport project, since projects share one database. */
export function uniqueName(prefix: string): string {
  const info = test.info();
  return `${prefix} ${info.project.name.slice(0, 3)}${Date.now() % 100000}`;
}

export { expect, test };

export async function createProfile(page: Page, name: string) {
  await page.goto('/profiles');
  await page.getByRole('button', { name: 'Add person' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add person' });
  // The sheet starts focus in the form, not on its Close button.
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
  await dialog.getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByText(`${name} added`)).toBeVisible();
}

/** The persistent "Viewing" selection on profile-scoped screens. */
export function viewing(page: Page) {
  return page.getByRole('radiogroup', { name: 'Viewing' });
}

export async function selectProfile(page: Page, name: string) {
  await viewing(page)
    .getByRole('radio', { name: new RegExp(name) })
    .click();
}

export async function goTo(page: Page, label: 'Today' | 'History' | 'Insights' | 'People') {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }).click();
}
