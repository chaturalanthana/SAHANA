import { expect, test } from '@playwright/test';

const email = 'admin.a@demo.sahana.test';
const password = process.env.SEED_DEMO_PASSWORD;

test.beforeEach(() => {
  test.skip(!password, 'SEED_DEMO_PASSWORD is not set');
});

test('signs in and saves a society contact phone', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Configuration' })).toBeVisible();
  await expect(page.getByLabel('Society name')).toHaveValue('Demo Society A');

  const phone = page.getByLabel('Contact phone');
  await phone.fill('0112000000');
  await page.getByLabel('Reason for change').fill('Playwright check');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');

  await page.locator('[data-locale="si"]').click();
  await expect(page.getByRole('heading', { name: 'වින්‍යාසය' })).toBeVisible();
  await page.locator('[data-locale="ta"]').click();
  await expect(page.getByRole('heading', { name: 'அமைப்பு' })).toBeVisible();
});
