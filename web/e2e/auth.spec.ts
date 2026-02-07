import { test, expect } from '@playwright/test';

test.describe('Auth Flow', () => {
  test('/auth/login renders with email input and Send Magic Link button', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForTimeout(2000);

    // FutureOS branding
    await expect(page.locator('a[href="/"]', { hasText: 'FutureOS' })).toBeVisible({ timeout: 10000 });

    // Subtitle text
    await expect(page.locator('text=Sign in to explore the future')).toBeVisible({ timeout: 5000 });

    // Email input field — has placeholder "Email address"
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await expect(emailInput).toHaveAttribute('placeholder', 'Email address');

    // Send Magic Link button
    const submitButton = page.locator('button[type="submit"]', { hasText: 'Send Magic Link' });
    await expect(submitButton).toBeVisible({ timeout: 5000 });
  });

  test('empty email submission triggers HTML5 validation (required field)', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 10000 });

    // The input has the required attribute, so submitting empty should not navigate away
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Page should still be on login — HTML5 validation prevents submission
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/auth/login');

    // The email input should still be visible (form was not submitted)
    await expect(emailInput).toBeVisible();
  });

  test('Continue with Google button is visible', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForTimeout(2000);

    const googleButton = page.locator('button', { hasText: 'Continue with Google' });
    await expect(googleButton).toBeVisible({ timeout: 5000 });
  });

  test('login page renders without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      // Ignore Supabase connection errors that occur without a running backend
      if (
        error.message.includes('supabase') ||
        error.message.includes('NEXT_PUBLIC') ||
        error.message.includes('fetch') ||
        error.message.includes('Failed to construct') ||
        error.message.includes('NetworkError')
      ) {
        return;
      }
      jsErrors.push(error.message);
    });

    await page.goto('/auth/login');
    await page.waitForTimeout(3000);

    // Filter out non-critical errors
    const criticalErrors = jsErrors.filter(
      (msg) =>
        !msg.includes('hydration') &&
        !msg.includes('Hydration') &&
        !msg.includes('net::ERR')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('login page has separator between email and Google auth', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForTimeout(2000);

    // "or" divider text
    await expect(page.locator('span', { hasText: 'or' })).toBeVisible({ timeout: 5000 });
  });
});
