/**
 * E2E Tests for swarm-app dashboard
 * Ported from Forge
 */
import { test, expect } from '@playwright/test';

const TEST_USER = {
  email: 'admin@swarmstack.net',
  password: 'AdminTest123!'
};

async function login(page) {
  await page.goto('/signin');
  await page.fill('#email', TEST_USER.email);
  await page.fill('#password', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

test.describe('Authentication', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('can login with valid credentials', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/dashboard/);
  });
});

test.describe('Secrets/API Keys Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('navigates to secrets page', async ({ page }) => {
    await page.goto('/secrets');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Anthropic')).toBeVisible({ timeout: 10000 });
  });

  test('displays provider list', async ({ page }) => {
    await page.goto('/secrets');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Anthropic')).toBeVisible();
    await expect(page.locator('text=OpenAI')).toBeVisible();
  });

  test('expands provider row on click', async ({ page }) => {
    await page.goto('/secrets');
    await page.waitForLoadState('networkidle');
    await page.click('text=Anthropic');
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar shows main nav items', async ({ page }) => {
    await expect(page.locator('text=Tickets')).toBeVisible();
    await expect(page.locator('text=VMs')).toBeVisible();
  });

  test('can navigate to tickets', async ({ page }) => {
    await page.click('a:has-text("Tickets")');
    await expect(page).toHaveURL(/tickets/);
  });
});
