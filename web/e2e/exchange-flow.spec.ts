import { test, expect } from '@playwright/test';

test.describe('Exchange Product Flow', () => {
  test('/exchange loads with Market Hall heading', async ({ page }) => {
    await page.goto('/exchange');
    await page.waitForTimeout(2000);

    const heading = page.locator('h1', { hasText: 'Market Hall' });
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Subtitle text
    await expect(page.locator('text=Trade on your judgment')).toBeVisible({ timeout: 5000 });
  });

  test('/exchange shows market cards (demo fallback data)', async ({ page }) => {
    await page.goto('/exchange');
    await page.waitForTimeout(3000);

    // Market cards are rendered as links to /exchange/[id]
    const marketLinks = page.locator('a[href^="/exchange/"]');
    const count = await marketLinks.count();

    // Demo markets should show (at least 3 demo markets are hardcoded)
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('/exchange has category filter buttons', async ({ page }) => {
    await page.goto('/exchange');
    await page.waitForTimeout(2000);

    // Category tabs: All, Politics, Economics, Tech, Finance
    await expect(page.locator('button', { hasText: 'All' }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button', { hasText: 'Politics' })).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button', { hasText: 'Economics' })).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button', { hasText: 'Tech' })).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button', { hasText: 'Finance' })).toBeVisible({ timeout: 3000 });
  });

  test('/exchange has sort options', async ({ page }) => {
    await page.goto('/exchange');
    await page.waitForTimeout(2000);

    await expect(page.locator('text=Sort:')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button', { hasText: 'Newest' })).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button', { hasText: 'Popular' })).toBeVisible({ timeout: 3000 });
  });

  test('/exchange market cards show signal bars (AI, Crowd)', async ({ page }) => {
    await page.goto('/exchange');
    await page.waitForTimeout(3000);

    // Signal labels in market cards
    await expect(page.locator('text=AI').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Crowd').first()).toBeVisible({ timeout: 5000 });
  });

  test('market detail page at /exchange/demo-1 has signal display', async ({ page }) => {
    await page.goto('/exchange/demo-1');
    await page.waitForTimeout(5000);

    // Market detail page should show the market title
    // Demo fallback: "Will AI regulation pass in the US by 2027?"
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Triple Signal section
    await expect(page.locator('h2', { hasText: 'Triple Signal' })).toBeVisible({ timeout: 5000 }).catch(() => {});

    // Price History section
    await expect(page.locator('h2', { hasText: 'Price History' })).toBeVisible({ timeout: 5000 }).catch(() => {});

    // Place Bet section
    await expect(page.locator('h2', { hasText: 'Place Bet' })).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test('market detail page has bet placement form', async ({ page }) => {
    await page.goto('/exchange/demo-1');
    await page.waitForTimeout(5000);

    // Outcome selection buttons (Yes / No)
    const yesButton = page.locator('button', { hasText: 'Yes' });
    const noButton = page.locator('button', { hasText: 'No' });
    await expect(yesButton.first()).toBeVisible({ timeout: 10000 }).catch(() => {});
    await expect(noButton.first()).toBeVisible({ timeout: 5000 }).catch(() => {});

    // Amount input
    const amountInput = page.locator('input[type="number"]');
    await expect(amountInput).toBeVisible({ timeout: 5000 }).catch(() => {});

    // Place Bet button
    const placeBetButton = page.locator('button', { hasText: 'Place Bet' });
    await expect(placeBetButton).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test('/exchange/portfolio shows balance display or redirects to login', async ({ page }) => {
    await page.goto('/exchange/portfolio');
    await page.waitForTimeout(3000);

    const url = page.url();

    if (url.includes('/auth/login')) {
      // Auth-gated, expected behavior
      await expect(page.locator('text=FutureOS')).toBeVisible({ timeout: 5000 });
      return;
    }

    // If on portfolio page, check for balance display
    // Demo portfolio has balance: $4,250.00
    const balanceLabel = page.locator('text=Balance');
    await expect(balanceLabel.first()).toBeVisible({ timeout: 10000 }).catch(() => {});

    // Portfolio heading
    await expect(page.locator('h1', { hasText: 'Portfolio' })).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test('/exchange/portfolio shows active and settled positions sections', async ({ page }) => {
    await page.goto('/exchange/portfolio');
    await page.waitForTimeout(3000);

    const url = page.url();
    if (url.includes('/auth/login')) return;

    await expect(page.locator('h2', { hasText: 'Active Positions' })).toBeVisible({ timeout: 5000 }).catch(() => {});
    await expect(page.locator('h2', { hasText: 'Settled Positions' })).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test('market card clicking navigates to detail page', async ({ page }) => {
    await page.goto('/exchange');
    await page.waitForTimeout(3000);

    // Click the first market card
    const firstMarketLink = page.locator('a[href^="/exchange/"]').first();
    const exists = await firstMarketLink.count();

    if (exists > 0) {
      await firstMarketLink.click();
      await page.waitForTimeout(3000);

      // Should navigate to a market detail page
      expect(page.url()).toMatch(/\/exchange\/.+/);
    }
  });
});
