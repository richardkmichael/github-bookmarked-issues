import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'build', 'chrome');

test.describe('GitHub Bookmarked Issues Extension', () => {
  let context;
  let page;
  let extensionId;

  // Helper function to add test bookmarks directly to extension storage
  async function addBookmarks(extContext, bookmarks) {
    // Navigate to extension popup to access chrome.storage API
    const tempPage = await extContext.newPage();
    await tempPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

    await tempPage.evaluate((bookmarks) => {
      return new Promise((resolve) => {
        chrome.storage.sync.set({ bookmarked_issues: bookmarks }, resolve);
      });
    }, bookmarks);

    await tempPage.close();
  }

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

  test.describe('Error Handling - Requires GitHub Authentication', () => {
    // NOTE: These tests require being logged into GitHub to access /issues/created
    // Common test bookmarks for error scenarios
    const singleBookmark = {
      'microsoft/playwright/issues/1': {
        owner: 'microsoft',
        repo: 'playwright',
        number: 1,
        type: 'issues',
        bookmarkedAt: Date.now()
      }
    };

    const multipleBookmarks = {
      'microsoft/playwright/issues/1': {
        owner: 'microsoft',
        repo: 'playwright',
        number: 1,
        type: 'issues',
        bookmarkedAt: Date.now()
      },
      'facebook/react/issues/100': {
        owner: 'facebook',
        repo: 'react',
        number: 100,
        type: 'issues',
        bookmarkedAt: Date.now()
      },
      'nodejs/node/issues/500': {
        owner: 'nodejs',
        repo: 'node',
        number: 500,
        type: 'issues',
        bookmarkedAt: Date.now()
      }
    };

    test.skip('displays error messages with response codes when API fails', async () => {
      // Add test bookmark to storage
      await addBookmarks(context, singleBookmark);

      const testPage = await context.newPage();

      // Intercept GitHub API calls and return errors
      await testPage.route('https://api.github.com/repos/**', (route) => {
        route.fulfill({
          status: 404,
          statusText: 'Not Found',
          body: JSON.stringify({ message: 'Not Found' })
        });
      });

      // Navigate to bookmarks view
      await testPage.goto('https://github.com/issues/created');
      await testPage.waitForLoadState('networkidle');

      // Click on Bookmarks view
      const bookmarksNav = testPage.locator('nav a:has-text("Bookmarks")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      // Wait for and check error message contains status code
      const errorMessage = testPage.locator('#bookmarks-error');
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
      await expect(errorMessage).toContainText('404 Not Found');

      await testPage.close();
    });

    test('displays error messages with rate limit info when rate limited', async () => {
      // Add test bookmark to storage
      await addBookmarks(context, singleBookmark);

      const testPage = await context.newPage();

      // Intercept API calls and return 403 rate limit error
      await testPage.route('https://api.github.com/repos/**', (route) => {
        route.fulfill({
          status: 403,
          statusText: 'rate limit exceeded',
          body: JSON.stringify({ message: 'API rate limit exceeded' })
        });
      });

      await testPage.goto('https://github.com/issues/created');
      await testPage.waitForLoadState('networkidle');

      const bookmarksNav = testPage.locator('nav a:has-text("Bookmarks")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      const errorMessage = testPage.locator('#bookmarks-error');
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
      await expect(errorMessage).toContainText('403 rate limit exceeded');

      await testPage.close();
    });

    test('displays multiple error messages when some issues fail', async () => {
      // Add multiple test bookmarks to storage
      await addBookmarks(context, multipleBookmarks);

      const testPage = await context.newPage();

      let callCount = 0;
      await testPage.route('https://api.github.com/repos/**', (route) => {
        callCount++;
        if (callCount === 1) {
          // First call succeeds
          route.fulfill({
            status: 200,
            body: JSON.stringify({
              number: 1,
              title: 'Test Issue',
              html_url: 'https://github.com/microsoft/playwright/issues/1',
              state: 'open',
              updated_at: new Date().toISOString(),
              comments: 0
            })
          });
        } else if (callCount === 2) {
          // Second call returns 404
          route.fulfill({
            status: 404,
            statusText: 'Not Found'
          });
        } else {
          // Third call returns 403
          route.fulfill({
            status: 403,
            statusText: 'Forbidden'
          });
        }
      });

      await testPage.goto('https://github.com/issues/created');
      await testPage.waitForLoadState('networkidle');

      const bookmarksNav = testPage.locator('nav a:has-text("Bookmarks")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      const errorMessage = testPage.locator('#bookmarks-error');
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
      await expect(errorMessage).toContainText('404 Not Found');
      await expect(errorMessage).toContainText('403 Forbidden');

      await testPage.close();
    });
  });
});
