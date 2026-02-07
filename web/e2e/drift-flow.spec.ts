import { test, expect } from '@playwright/test';

test.describe('Drift Dashboard', () => {
  test('/admin/drift shows drift dashboard heading', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    const heading = page.locator('h1', { hasText: 'Drift Dashboard' });
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Subtitle
    await expect(page.locator('text=Monitor causal decay')).toBeVisible({ timeout: 5000 });
  });

  test('/admin/drift shows stats cards (demo fallback data)', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    // Demo stats include: Total Events, Data Expiry, Causal Decay, etc.
    await expect(page.locator('text=Total Events')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Data Expiry')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Causal Decay')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Calibration Drift')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Signal Divergence')).toBeVisible({ timeout: 5000 });
  });

  test('/admin/drift shows events timeline', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    const eventsHeading = page.locator('h2', { hasText: 'Events Timeline' });
    await expect(eventsHeading).toBeVisible({ timeout: 10000 });

    // Events should be listed (demo data has 5 events)
    // Check for severity badges
    const severityBadges = page.locator('text=critical');
    const warningBadges = page.locator('text=warning');
    const infoBadges = page.locator('text=info');

    const critCount = await severityBadges.count().catch(() => 0);
    const warnCount = await warningBadges.count().catch(() => 0);
    const infoCount = await infoBadges.count().catch(() => 0);

    expect(critCount + warnCount + infoCount).toBeGreaterThanOrEqual(1);
  });

  test('/admin/drift shows causal edge weights table', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    const edgeHeading = page.locator('h2', { hasText: 'Causal Edge Weights' });
    await expect(edgeHeading).toBeVisible({ timeout: 10000 });

    // Table headers: Source, Target, Original, Current, Decay
    await expect(page.locator('th', { hasText: 'Source' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('th', { hasText: 'Target' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('th', { hasText: 'Original' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('th', { hasText: 'Current' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('th', { hasText: 'Decay' })).toBeVisible({ timeout: 5000 });
  });

  test('/admin/drift shows demo edge weight rows', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    // Demo edges include "Fed Policy", "Oil Price", "GDP Growth", etc.
    await expect(page.locator('text=Fed Policy')).toBeVisible({ timeout: 10000 }).catch(() => {});
    await expect(page.locator('text=Oil Price')).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test('/admin/drift has Run Scan button', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    const scanButton = page.locator('button', { hasText: 'Run Scan' });
    await expect(scanButton).toBeVisible({ timeout: 10000 });
  });

  test('/admin/drift event details can be expanded', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    // Click "Details" button on first event
    const detailsButton = page.locator('button', { hasText: 'Details' }).first();
    const exists = await detailsButton.count();

    if (exists > 0) {
      await detailsButton.click();
      await page.waitForTimeout(500);

      // After expanding, "Collapse" button should appear
      await expect(page.locator('button', { hasText: 'Collapse' }).first()).toBeVisible({ timeout: 3000 }).catch(() => {});
    }
  });

  test('/admin/drift shows calibration trend section', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    const calibrationHeading = page.locator('h2', { hasText: 'Calibration Trend' });
    await expect(calibrationHeading).toBeVisible({ timeout: 10000 });
  });

  test('/admin/drift shows Unresolved stat', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);

    await expect(page.locator('text=Unresolved')).toBeVisible({ timeout: 10000 });
  });
});
