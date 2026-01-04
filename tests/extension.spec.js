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
    const tempPage = await extContext.newPage();
    await tempPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);
    await tempPage.evaluate((bookmarks) => {
      return new Promise((resolve) => {
        chrome.storage.sync.set({ bookmarked_issues: bookmarks }, resolve);
      });
    }, bookmarks);
    await tempPage.close();
  }

  // Helper function to clear all bookmarks
  async function clearBookmarks(extContext) {
    const tempPage = await extContext.newPage();
    await tempPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);
    await tempPage.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.clear(resolve);
      });
    });
    await tempPage.close();
  }

  // Helper function to get current bookmarks
  async function getBookmarks(extContext) {
    const tempPage = await extContext.newPage();
    await tempPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);
    const bookmarks = await tempPage.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.get('bookmarked_issues', (result) => {
          resolve(result.bookmarked_issues || {});
        });
      });
    });
    await tempPage.close();
    return bookmarks;
  }

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    extensionId = background.url().split('/')[2];

    // Reuse the blank page created by launchPersistentContext.
    // Navigation tests use this page; extension page tests create their own.
    const pages = context.pages();
    page = pages[0] || await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ============================================================
  // NO LOGIN REQUIRED - Extension basics and public pages
  // ============================================================

  test.describe('Extension Basics', () => {
    test('loads successfully', async () => {
      expect(extensionId).toBeTruthy();
      console.log('Extension ID:', extensionId);
    });
  });

  // Bookmark button navigation tests - ensure button appears regardless of navigation path
  test.describe('Bookmark Button Navigation', { tag: '@navigation' }, () => {
    const bookmarkSelector = '[data-extension-bookmark]';
    // Selector for GitHub's header actions (where bookmark button is inserted)
    const headerActionsSelector = '[data-component="PH_Actions"]';

    test('appears on direct navigation to issue page', async () => {
      await page.goto('https://github.com/microsoft/playwright/issues/38673');
      await page.waitForLoadState('domcontentloaded');

      // Wait for header actions container (needed for button insertion)
      await expect(page.locator(headerActionsSelector)).toBeVisible({ timeout: 15000 });

      const bookmarkButton = page.locator(bookmarkSelector);
      await expect(bookmarkButton).toBeVisible({ timeout: 10000 });
    });

    test('appears after SPA navigation from issues list', async () => {
      // Navigate to issues list
      await page.goto('https://github.com/microsoft/playwright/issues');
      await page.waitForLoadState('domcontentloaded');

      // Click on first issue link (SPA navigation)
      const issueLink = page.locator('a[href^="/microsoft/playwright/issues/"]:not([href$="/issues/"])').first();
      await expect(issueLink).toBeVisible({ timeout: 10000 });
      await issueLink.click();

      // Wait for issue page to load
      await expect(page.locator(headerActionsSelector)).toBeVisible({ timeout: 15000 });

      const bookmarkButton = page.locator(bookmarkSelector);
      await expect(bookmarkButton).toBeVisible({ timeout: 10000 });
    });

    test('appears after SPA navigation from repo page', async () => {
      // Start at repo page
      await page.goto('https://github.com/microsoft/playwright');
      await page.waitForLoadState('domcontentloaded');

      // Click Issues tab (SPA navigation)
      const issuesTab = page.locator('#issues-tab');
      await expect(issuesTab).toBeVisible({ timeout: 10000 });
      await issuesTab.click();

      // Wait for issues list, then click first issue
      const issueLink = page.locator('a[href^="/microsoft/playwright/issues/"]:not([href$="/issues/"])').first();
      await expect(issueLink).toBeVisible({ timeout: 15000 });
      await issueLink.click();

      // Wait for issue page to load
      await expect(page.locator(headerActionsSelector)).toBeVisible({ timeout: 15000 });

      const bookmarkButton = page.locator(bookmarkSelector);
      await expect(bookmarkButton).toBeVisible({ timeout: 10000 });
    });
  });

  // TODO: Investigate why bookmark button isn't appearing on public issue pages
  // The button uses class 'prc-Button-ButtonBase-c50BI' - may need different locator
  test.describe('Bookmark Button (Public Issue Pages)', () => {
    test.skip('appears on GitHub issue page', async () => {
      await page.goto('https://github.com/microsoft/playwright/issues/1');
      await page.waitForLoadState('networkidle');

      // Button uses GitHub's Primer React classes, not a data attribute
      const bookmarkButton = page.locator('button:has-text("Bookmark")');
      await expect(bookmarkButton).toBeVisible({ timeout: 10000 });
    });

    test.skip('toggles bookmark on click', async () => {
      await clearBookmarks(context);

      await page.goto('https://github.com/microsoft/playwright/issues/1');
      await page.waitForLoadState('networkidle');

      const bookmarkButton = page.locator('button:has-text("Bookmark")');
      await expect(bookmarkButton).toBeVisible({ timeout: 10000 });

      // Click to add bookmark
      await bookmarkButton.click();
      await page.waitForTimeout(500);

      // Verify bookmark was added to storage
      let bookmarks = await getBookmarks(context);
      expect(Object.keys(bookmarks)).toContain('microsoft/playwright/issues/1');

      // Click again to remove bookmark
      await bookmarkButton.click();
      await page.waitForTimeout(500);

      // Verify bookmark was removed
      bookmarks = await getBookmarks(context);
      expect(Object.keys(bookmarks)).not.toContain('microsoft/playwright/issues/1');
    });
  });

  test.describe('Popup', () => {
    test('opens and displays UI', async () => {
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      await expect(popupPage.locator('#storage-info')).toBeVisible();
      await popupPage.close();
    });

    test('displays bookmarked issues', async () => {
      const testBookmarks = {
        'microsoft/playwright/issues/1': {
          owner: 'microsoft',
          repo: 'playwright',
          number: 1,
          type: 'issues',
          bookmarkedAt: Date.now()
        }
      };
      await addBookmarks(context, testBookmarks);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      await popupPage.waitForTimeout(2000);

      const issueItem = popupPage.locator('.issue-item');
      await expect(issueItem).toBeVisible({ timeout: 10000 });

      await popupPage.close();
    });

    test('removes bookmark when remove button clicked', async () => {
      const testBookmarks = {
        'microsoft/playwright/issues/1': {
          owner: 'microsoft',
          repo: 'playwright',
          number: 1,
          type: 'issues',
          bookmarkedAt: Date.now()
        }
      };
      await addBookmarks(context, testBookmarks);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      const issueItem = popupPage.locator('.issue-item');
      await expect(issueItem).toBeVisible({ timeout: 10000 });

      const removeBtn = popupPage.locator('.remove-btn');
      await removeBtn.click();
      await popupPage.waitForTimeout(500);

      await expect(issueItem).not.toBeVisible();

      const bookmarks = await getBookmarks(context);
      expect(Object.keys(bookmarks)).not.toContain('microsoft/playwright/issues/1');

      await popupPage.close();
    });

    test('import validates pasted URLs', async () => {
      await clearBookmarks(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      const importBtn = popupPage.locator('#import-btn');
      await importBtn.click();

      const importSection = popupPage.locator('#import-section');
      await expect(importSection).toBeVisible();

      const textarea = popupPage.locator('#import-textarea');
      await textarea.fill(`- [Valid Issue](https://github.com/microsoft/playwright/issues/1)
- [Invalid - not GitHub](https://example.com/issue/123)`);

      await popupPage.waitForTimeout(500);

      const validation = popupPage.locator('#import-validation');
      await expect(validation).toBeVisible();
      await expect(validation).toContainText('1 valid');
      await expect(validation).toContainText('1 invalid');

      await popupPage.close();
    });

    test('imports valid URLs and updates storage', async () => {
      await clearBookmarks(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      const importBtn = popupPage.locator('#import-btn');
      await importBtn.click();

      const textarea = popupPage.locator('#import-textarea');
      await textarea.fill('- https://github.com/microsoft/playwright/issues/1');

      await popupPage.waitForTimeout(500);

      const submitBtn = popupPage.locator('#import-submit-btn');
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      await popupPage.waitForTimeout(1000);

      const bookmarks = await getBookmarks(context);
      expect(Object.keys(bookmarks)).toContain('microsoft/playwright/issues/1');

      await popupPage.close();
    });

    test('detects duplicate bookmarks during import', async () => {
      const existingBookmarks = {
        'microsoft/playwright/issues/1': {
          owner: 'microsoft',
          repo: 'playwright',
          number: 1,
          type: 'issues',
          bookmarkedAt: Date.now()
        }
      };
      await addBookmarks(context, existingBookmarks);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      const importBtn = popupPage.locator('#import-btn');
      await importBtn.click();

      const textarea = popupPage.locator('#import-textarea');
      await textarea.fill('- https://github.com/microsoft/playwright/issues/1');

      await popupPage.waitForTimeout(500);

      const validation = popupPage.locator('#import-validation');
      await expect(validation).toBeVisible();
      await expect(validation).toContainText('1 duplicate');

      const submitBtn = popupPage.locator('#import-submit-btn');
      await expect(submitBtn).toBeDisabled();

      await popupPage.close();
    });
  });

  test.describe('Options Page', () => {
    test('opens and displays UI', async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);

      await expect(optionsPage.locator('h1')).toContainText('Settings');
      await expect(optionsPage.locator('#pat-input')).toBeVisible();
      await expect(optionsPage.locator('#save-btn')).toBeVisible();
      await expect(optionsPage.locator('#test-btn')).toBeVisible();
      await expect(optionsPage.locator('#toggle-visibility-btn')).toBeVisible();

      await optionsPage.close();
    });

    test('eyeball toggle shows and hides token', async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);

      const input = optionsPage.locator('#pat-input');
      const toggleBtn = optionsPage.locator('#toggle-visibility-btn');

      // Initially password type (hidden)
      await expect(input).toHaveAttribute('type', 'password');
      await expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');

      // Click to show
      await toggleBtn.click();
      await expect(input).toHaveAttribute('type', 'text');
      await expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');

      // Click to hide again
      await toggleBtn.click();
      await expect(input).toHaveAttribute('type', 'password');
      await expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');

      await optionsPage.close();
    });

    test('test button validates format before testing', async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);

      const input = optionsPage.locator('#pat-input');
      const testBtn = optionsPage.locator('#test-btn');
      const message = optionsPage.locator('#message');

      // Enter invalid token format
      await input.fill('invalid_token');
      await testBtn.click();

      await expect(message).toBeVisible();
      await expect(message).toContainText('Invalid token format');

      await optionsPage.close();
    });

    test('save button validates format', async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);

      const input = optionsPage.locator('#pat-input');
      const saveBtn = optionsPage.locator('#save-btn');
      const message = optionsPage.locator('#message');

      // Enter invalid token format
      await input.fill('ghp_classic_token_not_allowed');
      await saveBtn.click();

      await expect(message).toBeVisible();
      await expect(message).toContainText('Invalid token format');

      await optionsPage.close();
    });

    test('shows error for empty token', async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);

      const saveBtn = optionsPage.locator('#save-btn');
      const message = optionsPage.locator('#message');

      // Click save with empty input
      await saveBtn.click();

      await expect(message).toBeVisible();
      await expect(message).toContainText('Enter a token');

      await optionsPage.close();
    });

    test('token is used in API requests', async () => {
      const testToken = 'github_pat_11ABCDEFGHIJKLMNOPQRST_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW';

      // Store the token
      const setupPage = await context.newPage();
      await setupPage.goto(`chrome-extension://${extensionId}/assets/options.html`);
      await setupPage.evaluate((token) => {
        return new Promise((resolve) => {
          chrome.storage.sync.set({ github_pat: token }, resolve);
        });
      }, testToken);
      await setupPage.close();

      // Add a bookmark
      const testBookmarks = {
        'microsoft/playwright/issues/999': {
          owner: 'microsoft',
          repo: 'playwright',
          number: 999,
          type: 'issues',
          bookmarkedAt: Date.now()
        }
      };
      await addBookmarks(context, testBookmarks);

      // Track Authorization header from intercepted requests
      let capturedAuthHeader = null;
      await context.route('**/api.github.com/repos/**', async (route) => {
        capturedAuthHeader = route.request().headers()['authorization'];
        // Return mock response
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 999,
            number: 999,
            title: 'Test Issue',
            state: 'open',
            html_url: 'https://github.com/microsoft/playwright/issues/999',
            updated_at: new Date().toISOString(),
            comments: 0
          })
        });
      });

      // Open popup to trigger API request
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);
      await popupPage.waitForTimeout(2000);

      // Verify token was used
      expect(capturedAuthHeader).toBe(`Bearer ${testToken}`);

      // Cleanup
      await context.unroute('**/api.github.com/repos/**');
      await popupPage.close();

      // Clear the token
      const cleanupPage = await context.newPage();
      await cleanupPage.goto(`chrome-extension://${extensionId}/assets/options.html`);
      await cleanupPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.remove('github_pat', resolve);
        });
      });
      await cleanupPage.close();
    });

    test('requests work without token', async () => {
      // Ensure no token is set
      const setupPage = await context.newPage();
      await setupPage.goto(`chrome-extension://${extensionId}/assets/options.html`);
      await setupPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.remove('github_pat', resolve);
        });
      });
      await setupPage.close();

      // Add a bookmark
      const testBookmarks = {
        'microsoft/playwright/issues/888': {
          owner: 'microsoft',
          repo: 'playwright',
          number: 888,
          type: 'issues',
          bookmarkedAt: Date.now()
        }
      };
      await addBookmarks(context, testBookmarks);

      // Track Authorization header
      let capturedAuthHeader = null;
      await context.route('**/api.github.com/repos/**', async (route) => {
        capturedAuthHeader = route.request().headers()['authorization'];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 888,
            number: 888,
            title: 'Test Issue Without Token',
            state: 'open',
            html_url: 'https://github.com/microsoft/playwright/issues/888',
            updated_at: new Date().toISOString(),
            comments: 0
          })
        });
      });

      // Open popup
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);
      await popupPage.waitForTimeout(2000);

      // Verify no Authorization header
      expect(capturedAuthHeader).toBeUndefined();

      await context.unroute('**/api.github.com/repos/**');
      await popupPage.close();
    });
  });

  // ============================================================
  // VISUAL REGRESSION - Screenshot comparison for CSS development
  // ============================================================

  test.describe('Visual Regression', { tag: '@visual' }, () => {
    test('popup with issues', async () => {
      // Setup mock bookmarks
      const testBookmarks = {
        'microsoft/playwright/issues/123': {
          owner: 'microsoft',
          repo: 'playwright',
          number: 123,
          type: 'issues',
          bookmarkedAt: Date.now()
        },
        'facebook/react/issues/456': {
          owner: 'facebook',
          repo: 'react',
          number: 456,
          type: 'issues',
          bookmarkedAt: Date.now() - 86400000
        }
      };
      await addBookmarks(context, testBookmarks);

      const popupPage = await context.newPage();

      // Mock API responses
      await popupPage.route('**/api.github.com/repos/**', async (route) => {
        const url = route.request().url();
        let data = {
          title: 'Sample Issue',
          state: 'open',
          html_url: url,
          updated_at: '2024-01-15T10:30:00Z',
          comments: 5,
          repository: { full_name: 'org/repo' }
        };
        if (url.includes('playwright')) {
          data.title = 'Add visual regression testing support';
          data.repository.full_name = 'microsoft/playwright';
          data.state = 'open';
          data.comments = 12;
        } else if (url.includes('react')) {
          data.title = 'Improve hydration performance';
          data.repository.full_name = 'facebook/react';
          data.state = 'closed';
          data.comments = 42;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(data)
        });
      });

      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);
      await popupPage.waitForSelector('.issue-item');
      await popupPage.waitForTimeout(500);

      await expect(popupPage).toHaveScreenshot('popup-with-issues.png');
      await popupPage.close();
    });

    test('popup empty state', async () => {
      await clearBookmarks(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);
      await popupPage.waitForSelector('#empty-state');
      await popupPage.waitForTimeout(300);

      await expect(popupPage).toHaveScreenshot('popup-empty.png');
      await popupPage.close();
    });

    test('popup import section', async () => {
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);
      await popupPage.waitForLoadState('domcontentloaded');

      await popupPage.click('#import-btn');
      await popupPage.waitForSelector('#import-section:not([style*="display: none"])');
      await popupPage.waitForTimeout(300);

      await expect(popupPage).toHaveScreenshot('popup-import.png');
      await popupPage.close();
    });

    test('options page default', async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);
      await optionsPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.remove('github_pat', resolve);
        });
      });
      await optionsPage.reload();
      await optionsPage.waitForLoadState('domcontentloaded');
      await optionsPage.waitForTimeout(300);

      await expect(optionsPage).toHaveScreenshot('options-default.png');
      await optionsPage.close();
    });

    test('options page with token configured', async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);
      await optionsPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.set({
            github_pat: 'github_pat_mock_token_for_visual_testing'
          }, resolve);
        });
      });
      await optionsPage.reload();
      await optionsPage.waitForLoadState('domcontentloaded');
      await optionsPage.waitForTimeout(300);

      await expect(optionsPage).toHaveScreenshot('options-configured.png');

      // Cleanup
      await optionsPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.remove('github_pat', resolve);
        });
      });
      await optionsPage.close();
    });
  });

  // ============================================================
  // LOGIN REQUIRED - github.com/issues requires authentication
  // ============================================================

  test.describe('Bookmarks View (Requires GitHub Login)', () => {
    test.skip('appears in /issues navigation', async () => {
      await page.goto('https://github.com/issues/created');
      await page.waitForLoadState('networkidle');

      const bookmarksNav = page.locator('nav a:has-text("Bookmarks")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
    });

    test.skip('displays bookmarked issues', async () => {
      const testBookmarks = {
        'microsoft/playwright/issues/1': {
          owner: 'microsoft',
          repo: 'playwright',
          number: 1,
          type: 'issues',
          bookmarkedAt: Date.now()
        }
      };
      await addBookmarks(context, testBookmarks);

      await page.goto('https://github.com/issues/created');
      await page.waitForLoadState('networkidle');

      const bookmarksNav = page.locator('nav a:has-text("Bookmarks")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      await page.waitForTimeout(3000);

      const issueLink = page.locator('a[href*="playwright/issues/1"]');
      await expect(issueLink).toBeVisible({ timeout: 10000 });
    });

    test.skip('shows empty state when no bookmarks', async () => {
      await clearBookmarks(context);

      await page.goto('https://github.com/issues/created');
      await page.waitForLoadState('networkidle');

      const bookmarksNav = page.locator('nav a:has-text("Bookmarks")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      const emptyState = page.locator('#bookmarks-empty');
      await expect(emptyState).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Error Handling (Requires GitHub Login)', () => {
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
      await addBookmarks(context, singleBookmark);

      const testPage = await context.newPage();

      await testPage.route('https://api.github.com/repos/**', (route) => {
        route.fulfill({
          status: 404,
          statusText: 'Not Found',
          body: JSON.stringify({ message: 'Not Found' })
        });
      });

      await testPage.goto('https://github.com/issues/created');
      await testPage.waitForLoadState('networkidle');

      const bookmarksNav = testPage.locator('nav a:has-text("Bookmarks")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      const errorMessage = testPage.locator('#bookmarks-error');
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
      await expect(errorMessage).toContainText('404 Not Found');

      await testPage.close();
    });

    test.skip('displays error messages with rate limit info when rate limited', async () => {
      await addBookmarks(context, singleBookmark);

      const testPage = await context.newPage();

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

    test.skip('displays multiple error messages when some issues fail', async () => {
      await addBookmarks(context, multipleBookmarks);

      const testPage = await context.newPage();

      let callCount = 0;
      await testPage.route('https://api.github.com/repos/**', (route) => {
        callCount++;
        if (callCount === 1) {
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
          route.fulfill({
            status: 404,
            statusText: 'Not Found'
          });
        } else {
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
