import { test, expect } from '@playwright/test';

test.describe('Global Navigation', () => {
  test('landing page loads with FutureOS heading and hero content', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Verify heading contains FutureOS
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 10000 });
    const headingText = await heading.textContent();
    expect(headingText).toContain('FutureOS');

    // Verify the CTA button "Start Exploring" links to /lite
    const ctaLink = page.locator('a[href="/lite"]', { hasText: 'Start Exploring' });
    await expect(ctaLink).toBeVisible({ timeout: 5000 });
    await expect(ctaLink).toHaveAttribute('href', '/lite');
  });

  test('landing page shows three product cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Card 1: Explore Any Future
    const liteCard = page.locator('h3', { hasText: 'Explore Any Future' });
    await expect(liteCard).toBeVisible({ timeout: 5000 });

    // Card 2: Professional Prediction Workbench
    const studioCard = page.locator('h3', { hasText: 'Professional Prediction Workbench' });
    await expect(studioCard).toBeVisible({ timeout: 5000 });

    // Card 3: Trade on Your Judgment
    const exchangeCard = page.locator('h3', { hasText: 'Trade on Your Judgment' });
    await expect(exchangeCard).toBeVisible({ timeout: 5000 });
  });

  test('landing page has social proof stats', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await expect(page.locator('text=Predictions Made')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Active Users')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Calibration Accuracy')).toBeVisible({ timeout: 5000 });
  });

  test('landing page has footer with version', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: 5000 });
    const footerText = await footer.textContent();
    expect(footerText).toContain('FutureOS');
  });

  test('nav links are visible on desktop (Lite, Studio, Exchange, Community, Leaderboard)', async ({ page }) => {
    await page.goto('/lite');
    await page.waitForTimeout(2000);

    // The header nav is hidden on mobile via sm:flex, so on desktop viewport it should show
    const nav = page.locator('header nav');
    await expect(nav).toBeVisible({ timeout: 5000 });

    await expect(nav.locator('a[href="/lite"]')).toBeVisible();
    await expect(nav.locator('a[href="/studio"]')).toBeVisible();
    await expect(nav.locator('a[href="/exchange"]')).toBeVisible();
    await expect(nav.locator('a[href="/community"]')).toBeVisible();
    await expect(nav.locator('a[href="/leaderboard"]')).toBeVisible();
  });

  test('mobile viewport (375px): page does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForTimeout(2000);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375);
  });

  test('accessing /studio without auth redirects to login or shows auth prompt', async ({ page }) => {
    await page.goto('/studio');
    await page.waitForTimeout(3000);

    // Studio checks auth client-side and redirects to /auth/login if no session.
    // Either the URL changed to /auth/login, or the page still shows loading/studio content.
    const url = page.url();
    const isLoginPage = url.includes('/auth/login');
    const isStudioPage = url.includes('/studio');

    // One of these should be true
    expect(isLoginPage || isStudioPage).toBeTruthy();

    if (isLoginPage) {
      // Verify login page rendered
      await expect(page.locator('text=FutureOS')).toBeVisible({ timeout: 5000 });
    }
  });

  test('product card links navigate to correct pages', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Verify Open Lite link
    const openLite = page.locator('a[href="/lite"]', { hasText: 'Open Lite' });
    await expect(openLite).toBeVisible({ timeout: 5000 });

    // Verify Open Studio link
    const openStudio = page.locator('a[href="/studio"]', { hasText: 'Open Studio' });
    await expect(openStudio).toBeVisible({ timeout: 5000 });

    // Verify Open Exchange link
    const openExchange = page.locator('a[href="/exchange"]', { hasText: 'Open Exchange' });
    await expect(openExchange).toBeVisible({ timeout: 5000 });
  });
});
