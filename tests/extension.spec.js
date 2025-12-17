import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'build', 'chrome');

test.describe('GitHub Bookmarked Issues Extension', () => {
  let context;
  let page;
  let extensionId;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    extensionId = background.url().split('/')[2];

    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('extension loads successfully', async () => {
    expect(extensionId).toBeTruthy();
    console.log('Extension ID:', extensionId);
  });

  test('popup opens and displays UI', async () => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

    await expect(popupPage.locator('#storage-info')).toBeVisible();
  });

  test('bookmark button appears on GitHub issue page', async () => {
    await page.goto('https://github.com/microsoft/playwright/issues/1');
    await page.waitForLoadState('networkidle');

    // Wait for bookmark button injection
    const bookmarkButton = page.locator('[data-bookmark-btn]');
    await expect(bookmarkButton).toBeVisible({ timeout: 10000 });
  });

  test('bookmarks view appears in /issues navigation', async () => {
    await page.goto('https://github.com/issues/created');
    await page.waitForLoadState('networkidle');

    const bookmarksNav = page.locator('nav a:has-text("Bookmarks")');
    await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
  });
});
