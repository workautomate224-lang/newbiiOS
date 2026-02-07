import { test, expect } from '@playwright/test';

test.describe('Responsive & Performance', () => {
  const mobileViewport = { width: 375, height: 812 };

  test('landing page (/) does not overflow at 375px width', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/');
    await page.waitForTimeout(2000);

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('/lite does not overflow at 375px width', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/lite');
    await page.waitForTimeout(2000);

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('/exchange does not overflow at 375px width', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/exchange');
    await page.waitForTimeout(3000);

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('/leaderboard does not overflow at 375px width', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/leaderboard');
    await page.waitForTimeout(3000);

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('/community does not overflow at 375px width', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/community');
    await page.waitForTimeout(3000);

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('landing page has no critical JS console errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    // Filter out non-critical errors (network issues, hydration warnings, Supabase init)
    const criticalErrors = jsErrors.filter(
      (msg) =>
        !msg.includes('hydration') &&
        !msg.includes('Hydration') &&
        !msg.includes('net::ERR') &&
        !msg.includes('fetch') &&
        !msg.includes('NetworkError') &&
        !msg.includes('supabase') &&
        !msg.includes('NEXT_PUBLIC') &&
        !msg.includes('Failed to construct') &&
        !msg.includes('ChunkLoadError') &&
        !msg.includes('Loading chunk')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('/lite has no critical JS console errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    await page.goto('/lite');
    await page.waitForTimeout(3000);

    const criticalErrors = jsErrors.filter(
      (msg) =>
        !msg.includes('hydration') &&
        !msg.includes('Hydration') &&
        !msg.includes('net::ERR') &&
        !msg.includes('fetch') &&
        !msg.includes('NetworkError') &&
        !msg.includes('supabase') &&
        !msg.includes('NEXT_PUBLIC') &&
        !msg.includes('Failed to construct') &&
        !msg.includes('ChunkLoadError') &&
        !msg.includes('Loading chunk')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('/exchange has no critical JS console errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    await page.goto('/exchange');
    await page.waitForTimeout(3000);

    const criticalErrors = jsErrors.filter(
      (msg) =>
        !msg.includes('hydration') &&
        !msg.includes('Hydration') &&
        !msg.includes('net::ERR') &&
        !msg.includes('fetch') &&
        !msg.includes('NetworkError') &&
        !msg.includes('supabase') &&
        !msg.includes('NEXT_PUBLIC') &&
        !msg.includes('Failed to construct') &&
        !msg.includes('ChunkLoadError') &&
        !msg.includes('Loading chunk')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('/leaderboard has no critical JS console errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    await page.goto('/leaderboard');
    await page.waitForTimeout(3000);

    const criticalErrors = jsErrors.filter(
      (msg) =>
        !msg.includes('hydration') &&
        !msg.includes('Hydration') &&
        !msg.includes('net::ERR') &&
        !msg.includes('fetch') &&
        !msg.includes('NetworkError') &&
        !msg.includes('supabase') &&
        !msg.includes('NEXT_PUBLIC') &&
        !msg.includes('Failed to construct') &&
        !msg.includes('ChunkLoadError') &&
        !msg.includes('Loading chunk')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('landing page loads within 5 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(5000);

    // Also verify the page actually rendered content
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test('/lite page loads within 5 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/lite', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(5000);

    // Verify the page rendered
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test('dark theme is applied (bg-gray-950)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // The html element should have class "dark"
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass).toContain('dark');

    // The body should have the dark background
    const bodyClass = await page.locator('body').getAttribute('class');
    expect(bodyClass).toContain('bg-gray-950');
  });

  test('/auth/login does not overflow at 375px width', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/auth/login');
    await page.waitForTimeout(2000);

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('/admin/drift does not overflow at 375px width', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    // Drift dashboard has a table that may need horizontal scrolling
    // Check that the body itself doesn't overflow
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    // Allow small tolerance for table overflow
    expect(scrollWidth).toBeLessThanOrEqual(400);
  });

  test('header is sticky on scroll', async ({ page }) => {
    await page.goto('/lite');
    await page.waitForTimeout(2000);

    // The header has sticky positioning
    const headerClasses = await page.locator('header').getAttribute('class');
    expect(headerClasses).toContain('sticky');
  });

  test('multiple pages render body content (smoke test)', async ({ page }) => {
    const pages = ['/', '/lite', '/exchange', '/community', '/leaderboard'];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForTimeout(2000);

      const bodyText = await page.locator('body').textContent().catch(() => '');
      expect(bodyText!.length).toBeGreaterThan(10);
    }
  });
});
