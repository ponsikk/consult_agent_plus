import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  const randomEmail = `test-${Math.floor(Math.random() * 1000000)}@example.com`;
  const password = 'Password123!';
  const fullName = 'Test User';

  test('should register a new user and auto-login', async ({ page }) => {
    await page.goto('/register');
    await page.fill('#fullName', fullName);
    await page.fill('#email', randomEmail);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Панель управления')).toBeVisible();
    await expect(page.locator('text=' + fullName)).toBeVisible();
  });

  test('should login with existing user', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', randomEmail);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Панель управления')).toBeVisible();
  });

  test('should show error on wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', randomEmail);
    await page.fill('#password', 'WrongPassword123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Неверный email или пароль')).toBeVisible();
  });
});
