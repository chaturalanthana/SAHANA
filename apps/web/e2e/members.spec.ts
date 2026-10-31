import { expect, test } from '@playwright/test';

const email = 'admin.a@demo.sahana.test';
const password = process.env.SEED_DEMO_PASSWORD;

test.beforeEach(() => {
  test.skip(!password, 'SEED_DEMO_PASSWORD is not set');
});

test('opens the member registry and keeps the formula notice visible', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Configuration' })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: 'Members' }).click();
  await expect(page.getByRole('heading', { name: 'Members and family' })).toBeVisible();
  await expect(page.getByText('Welfare eligibility, loan interest, approval thresholds, and ESG results are not calculated.')).toBeVisible();
  const memberNo = `M-${Date.now().toString().slice(-6)}`;
  await page.getByLabel('Member number').fill(memberNo);
  await page.getByLabel('Given name').fill('Nimal');
  await page.getByLabel('Family name').fill('Perera');
  await page.getByLabel('Status code').fill('recorded');
  await page.getByLabel('Category code').fill('recorded');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.getByRole('link', { name: `${memberNo} · Nimal · Perera` }).click();
  await expect(page.getByRole('heading', { name: 'Nimal Perera' })).toBeVisible();
  await expect(page.getByText('recorded · Recorded')).toBeVisible();
  const history = page.getByRole('form', { name: 'Status history' });
  await history.getByLabel('New status code').fill('left');
  await history.getByLabel('Reason').fill('Later status');
  await history.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('left · Later status')).toBeVisible();
  await expect(page.getByText('recorded · Recorded')).toBeVisible();
  const family = page.getByRole('form', { name: 'Family' });
  await family.getByLabel('Given name').fill('Kamala');
  await family.getByLabel('Family name').fill('Perera');
  await family.getByLabel('Relationship code').fill('spouse');
  await family.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Kamala Perera · spouse')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contributions' })).toBeVisible();
  await expect(page.getByText('Nothing in this section has been calculated.')).toBeVisible();
  await page.getByRole('button', { name: 'Welfare — Open' }).click();
  await expect(page.getByRole('region', { name: 'Welfare' }).getByText('Nothing here yet')).toBeVisible();
});
