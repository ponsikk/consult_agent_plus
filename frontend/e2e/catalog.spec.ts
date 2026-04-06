import { test, expect } from '@playwright/test';

test.describe('Catalog', () => {
  test.beforeEach(async ({ page }) => {
    // Register and login for access
    const randomEmail = `catalog-test-${Math.floor(Math.random() * 1000000)}@example.com`;
    await page.goto('/register');
    await page.fill('#fullName', 'Catalog Tester');
    await page.fill('#email', randomEmail);
    await page.fill('#password', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('should view defect catalog', async ({ page }) => {
    await page.goto('/catalog');
    await expect(page.locator('h1:has-text("Каталог дефектов")')).toBeVisible();

    // Check if some defect categories are visible (e.g., Roof systems)
    // The CatalogPage uses Accordion by system
    await expect(page.locator('text=Плоские кровли')).toBeVisible();

    // Expand accordion and see items
    await page.click('text=Плоские кровли');
    // Check if a specific defect is visible (assuming defect_catalog.json has some content)
    // Just check if there's any text below the expanded item
    await expect(page.locator('text=Критичность')).toBeVisible();
  });

  test('should search in catalog', async ({ page }) => {
    await page.goto('/catalog');
    await page.fill('input[placeholder*="Поиск по названию или коду"]', 'трещина');
    // Check if results are filtered (at least one should be there if catalog is seeded)
  });
});
