import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Analysis Workflow', () => {
  const randomEmail = `analysis-test-${Math.floor(Math.random() * 1000000)}@example.com`;
  const password = 'Password123!';
  const fullName = 'Analysis Tester';

  test.beforeEach(async ({ page }) => {
    // Register and login
    await page.goto('/register');
    await page.fill('#fullName', fullName);
    await page.fill('#email', randomEmail);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('should create a new analysis and view results', async ({ page }) => {
    await page.goto('/new');
    await page.fill('#objectName', 'E2E Test Roof');
    await page.fill('#shotDate', '2024-04-06');

    // Upload photo
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('text=Перетащите фото или нажмите для выбора').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, 'assets/test_roof.png'));

    await page.click('button[type="submit"]');

    // Check redirect to result page
    await expect(page).toHaveURL(/\/analyses\/[0-9a-f-]+/);

    // Wait for analysis to complete (using mock AI it should be fast)
    // The page shows "Анализируем фотографии..." while processing
    await expect(page.locator('text=Анализируем фотографии...')).toBeVisible();

    // Increase timeout for analysis completion
    await expect(page.locator('text=Скачать PDF')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('text=E2E Test Roof')).toBeVisible();

    // Check defect table exists
    await expect(page.locator('table')).toBeVisible();
  });

  test('should download PDF and Excel reports', async ({ page }) => {
    // Create an analysis first
    await page.goto('/new');
    await page.fill('#objectName', 'Report Test');
    await page.fill('#shotDate', '2024-04-06');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('text=Перетащите фото или нажмите для выбора').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, 'assets/test_roof.png'));
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Скачать PDF')).toBeVisible({ timeout: 60000 });

    // Download PDF
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Скачать PDF")'),
    ]);
    expect(pdfDownload.suggestedFilename()).toMatch(/report-.*\.pdf/);

    // Download Excel
    const [excelDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Скачать Excel")'),
    ]);
    expect(excelDownload.suggestedFilename()).toMatch(/report-.*\.xlsx/);
  });
});
