import { expect, test } from '@playwright/test';

test('home page renders primary mobile content', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /hope city highlands/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /i'm new \/ connect/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /give online/i })).toBeVisible();
  await expect(page.getByText(/upcoming events/i)).toBeVisible();
});

test('tap page renders quick actions in mobile viewport', async ({ page }) => {
  await page.goto('/tap?action=give&source=lobby&tag=test01');

  await expect(page.getByRole('heading', { name: /hope city highlands/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /give online/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
});

test('admin route renders an accessible shell on mobile', async ({ page }) => {
  await page.goto('/admin');

  await expect(
    page.getByRole('heading', { name: /admin login|admin unavailable/i })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /back to site/i })).toBeVisible();
});
