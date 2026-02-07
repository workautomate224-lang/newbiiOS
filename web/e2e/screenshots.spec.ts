import { test, expect } from '@playwright/test';

/**
 * Screenshot tests for key pages.
 * Ensures pages render without crashes and contain key elements.
 */

const PAGES = [
  { name: 'landing', url: '/', must_have: ['FutureOS', 'Lite'] },
  { name: 'lite', url: '/lite', must_have: ['predict'] },
  { name: 'auth', url: '/auth/login', must_have: ['email'] },
  { name: 'studio', url: '/studio', must_have: ['project'] },
  { name: 'exchange', url: '/exchange', must_have: ['market'] },
  { name: 'community', url: '/community', must_have: ['predict'] },
  { name: 'leaderboard', url: '/leaderboard', must_have: ['rank'] },
];

for (const pg of PAGES) {
  test(`Screenshot: ${pg.name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(pg.url);
    await page.waitForTimeout(3000);

    // Desktop screenshot
    await page.screenshot({
      path: `e2e/screenshots/${pg.name}-desktop.png`,
      fullPage: true,
    });

    // Mobile screenshot
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `e2e/screenshots/${pg.name}-mobile.png`,
      fullPage: true,
    });

    // No JS errors
    expect(errors).toEqual([]);

    // Key text present (case-insensitive)
    const bodyText = await page.locator('body').textContent();
    for (const text of pg.must_have) {
      expect(bodyText?.toLowerCase()).toContain(text.toLowerCase());
    }
  });
}
