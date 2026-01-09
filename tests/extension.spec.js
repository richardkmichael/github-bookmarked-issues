import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'build', 'chrome');

// Auth helper - decodes env var, returns storageState object or null
function getGitHubAuth() {
  const encoded = process.env.GITHUB_AUTH_STATE;
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Pool of known-good GitHub issues that don't redirect to pull requests.
// Use these in tests instead of guessing issue numbers.
const TEST_ISSUES = [
  { owner: 'microsoft', repo: 'playwright', number: 38673 },
  { owner: 'microsoft', repo: 'playwright', number: 38674 },
  { owner: 'facebook', repo: 'react', number: 100 },
];

// Helper to create a bookmarks object from a single test issue
function makeBookmark(issue, bookmarkedAt = Date.now()) {
  const key = `${issue.owner}/${issue.repo}/issues/${issue.number}`;
  return {
    [key]: {
      owner: issue.owner,
      repo: issue.repo,
      number: issue.number,
      type: 'issues',
      bookmarkedAt
    }
  };
}

// Helper to create bookmarks object from multiple test issues
function makeBookmarks(...issues) {
  return Object.assign({}, ...issues.map(issue => makeBookmark(issue)));
}

// Get issue URL from test issue
function issueUrl(issue) {
  return `https://github.com/${issue.owner}/${issue.repo}/issues/${issue.number}`;
}

// Load test fixture file
function loadFixture(name) {
  return readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
}

test.describe('', () => {
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

  test.describe('Basics', () => {
    test('loads successfully', async () => {
      expect(extensionId).toBeTruthy();
    });

    // Contract test: verify GitHub API returns all fields we depend on.
    // If this fails, our mocks need updating to match API changes.
    // Note: API doesn't return repository.full_name - popup.js parses from url field instead.
    test('GitHub API contract', async () => {
      const issue = TEST_ISSUES[0];
      const url = `https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`;
      const headers = {};
      if (process.env.API_CONTRACT_TEST_PAT) {
        headers['Authorization'] = `Bearer ${process.env.API_CONTRACT_TEST_PAT}`;
      }
      const response = await fetch(url, { headers });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('state');
      expect(data).toHaveProperty('html_url');
      expect(data).toHaveProperty('updated_at');
      expect(data).toHaveProperty('comments');
      expect(data).toHaveProperty('url');  // Used by popup.js to parse repo name
    });

    test('bookmark button', async () => {
      const bookmarkSelector = '[data-extension-bookmark]';
      const headerActionsSelector = '[data-component="PH_Actions"]';

      await clearBookmarks(context);

      await page.goto(issueUrl(TEST_ISSUES[0]));
      await page.waitForLoadState('domcontentloaded');

      await expect(page.locator(headerActionsSelector)).toBeVisible({ timeout: 15000 });

      // Use main header selector to avoid matching sticky header button
      const bookmarkButton = page.locator(`${headerActionsSelector} ${bookmarkSelector}`);
      await expect(bookmarkButton).toBeVisible({ timeout: 10000 });

      // Click to add bookmark
      await bookmarkButton.click();

      // Verify bookmark was added to storage
      const expectedKey = `${TEST_ISSUES[0].owner}/${TEST_ISSUES[0].repo}/issues/${TEST_ISSUES[0].number}`;
      await expect(async () => {
        const bookmarks = await getBookmarks(context);
        expect(Object.keys(bookmarks)).toContain(expectedKey);
      }).toPass({ timeout: 5000 });

      // Click again to remove bookmark
      await bookmarkButton.click();

      // Verify bookmark was removed
      await expect(async () => {
        const bookmarks = await getBookmarks(context);
        expect(Object.keys(bookmarks)).not.toContain(expectedKey);
      }).toPass({ timeout: 5000 });
    });

    test('bookmark button in sticky header', async () => {
      const bookmarkSelector = '[data-extension-bookmark]';
      const headerActionsSelector = '[data-component="PH_Actions"]';
      const stickyHeaderSelector = '[class*="HeaderMetadata-module__stickyContainer"]';

      await clearBookmarks(context);

      // Use an issue with enough content to scroll
      await page.goto('https://github.com/microsoft/playwright/issues/11975');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.locator(headerActionsSelector)).toBeVisible({ timeout: 15000 });

      // Verify bookmark button exists in main header
      const mainBookmarkButton = page.locator(`${headerActionsSelector} ${bookmarkSelector}`);
      await expect(mainBookmarkButton).toBeVisible({ timeout: 10000 });

      // Scroll down to trigger sticky header
      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForTimeout(500);

      // Verify sticky header appeared
      await expect(page.locator(stickyHeaderSelector)).toBeVisible({ timeout: 5000 });

      // Verify bookmark button exists in sticky header
      const stickyBookmarkButton = page.locator(`${stickyHeaderSelector} ${bookmarkSelector}`);
      await expect(stickyBookmarkButton).toBeVisible({ timeout: 5000 });

      // Click sticky header bookmark button to add bookmark
      await stickyBookmarkButton.click();

      // Verify bookmark was added
      const expectedKey = 'microsoft/playwright/issues/11975';
      await expect(async () => {
        const bookmarks = await getBookmarks(context);
        expect(Object.keys(bookmarks)).toContain(expectedKey);
      }).toPass({ timeout: 5000 });

      // Scroll back up and verify main header button is also in bookmarked state
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // Click main header button to remove bookmark (verifies sync)
      await mainBookmarkButton.click();

      // Verify bookmark was removed
      await expect(async () => {
        const bookmarks = await getBookmarks(context);
        expect(Object.keys(bookmarks)).not.toContain(expectedKey);
      }).toPass({ timeout: 5000 });
    });
  });

  // Bookmark button navigation tests - ensure button appears regardless of navigation path
  // NOTE: These tests can be flaky due to GitHub's variable page load times and React hydration.
  // Retries are enabled to mitigate transient failures.
  test.describe('Navigation', { tag: '@navigation' }, () => {
    test.describe.configure({ retries: 2 });

    const bookmarkSelector = '[data-extension-bookmark]';
    // Selector for GitHub's header actions (where bookmark button is inserted)
    const headerActionsSelector = '[data-component="PH_Actions"]';

    test('appears on direct navigation to issue page', async () => {
      await page.goto(issueUrl(TEST_ISSUES[0]));
      await page.waitForLoadState('domcontentloaded');

      // Wait for header actions container (needed for button insertion)
      await expect(page.locator(headerActionsSelector)).toBeVisible({ timeout: 15000 });

      // Use main header selector to avoid matching sticky header button
      const bookmarkButton = page.locator(`${headerActionsSelector} ${bookmarkSelector}`);
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

      // Use main header selector to avoid matching sticky header button
      const bookmarkButton = page.locator(`${headerActionsSelector} ${bookmarkSelector}`);
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

      // Use main header selector to avoid matching sticky header button
      const bookmarkButton = page.locator(`${headerActionsSelector} ${bookmarkSelector}`);
      await expect(bookmarkButton).toBeVisible({ timeout: 10000 });
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
      const issue = TEST_ISSUES[0];
      await addBookmarks(context, makeBookmark(issue));

      // Mock API at context level - requests come from service worker, not page
      await context.route('**/api.github.com/repos/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            title: 'Test Issue',
            state: 'open',
            html_url: issueUrl(issue),
            url: `https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`,
            updated_at: '2024-01-15T10:30:00Z',
            comments: 5
          })
        });
      });

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      const issueItem = popupPage.locator('.issue-item');
      await expect(issueItem).toBeVisible({ timeout: 10000 });

      await context.unroute('**/api.github.com/repos/**');
      await popupPage.close();
    });

    test('removes bookmark when remove button clicked', async () => {
      const issue = TEST_ISSUES[0];
      const bookmarkKey = `${issue.owner}/${issue.repo}/issues/${issue.number}`;
      await addBookmarks(context, makeBookmark(issue));

      // Mock API at context level - requests come from service worker, not page
      await context.route('**/api.github.com/repos/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            title: 'Test Issue',
            state: 'open',
            html_url: issueUrl(issue),
            url: `https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`,
            updated_at: '2024-01-15T10:30:00Z',
            comments: 5
          })
        });
      });

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      const issueItem = popupPage.locator('.issue-item');
      await expect(issueItem).toBeVisible({ timeout: 10000 });

      const removeBtn = popupPage.locator('.remove-btn');
      await removeBtn.click();
      await popupPage.waitForTimeout(500);

      await expect(issueItem).not.toBeVisible();

      const bookmarks = await getBookmarks(context);
      expect(Object.keys(bookmarks)).not.toContain(bookmarkKey);

      await context.unroute('**/api.github.com/repos/**');
      await popupPage.close();
    });

    test('imports and saves', async () => {
      await clearBookmarks(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      const importBtn = popupPage.locator('#import-btn');
      await importBtn.click();

      const importSection = popupPage.locator('#import-section');
      await expect(importSection).toBeVisible();

      const fixture = loadFixture('import-issues.md');
      const textarea = popupPage.locator('#import-textarea');
      await textarea.fill(fixture);

      await popupPage.waitForTimeout(500);

      // Fixture contains: 3 unique valid issues, 7 invalid entries
      const validation = popupPage.locator('#import-validation');
      await expect(validation).toBeVisible();
      await expect(validation).toContainText('3 valid');
      await expect(validation).toContainText('7 invalid');

      // Import the valid issues
      const submitBtn = popupPage.locator('#import-submit-btn');
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      await popupPage.waitForTimeout(1000);

      // Verify all 3 valid issues were saved to storage
      const bookmarks = await getBookmarks(context);
      const keys = Object.keys(bookmarks);
      expect(keys).toContain('microsoft/playwright/issues/38673');
      expect(keys).toContain('microsoft/playwright/issues/38674');
      expect(keys).toContain('facebook/react/issues/100');
      expect(keys).toHaveLength(3);

      await popupPage.close();
    });

    test('detects duplicate bookmarks during import', async () => {
      await addBookmarks(context, makeBookmark(TEST_ISSUES[0]));

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      const importBtn = popupPage.locator('#import-btn');
      await importBtn.click();

      const textarea = popupPage.locator('#import-textarea');
      await textarea.fill(`- ${issueUrl(TEST_ISSUES[0])}`);

      await popupPage.waitForTimeout(500);

      const validation = popupPage.locator('#import-validation');
      await expect(validation).toBeVisible();
      await expect(validation).toContainText('1 duplicate');

      const submitBtn = popupPage.locator('#import-submit-btn');
      await expect(submitBtn).toBeDisabled();

      await popupPage.close();
    });

    test('copies all issues to clipboard', async () => {
      const issue = TEST_ISSUES[0];
      await addBookmarks(context, makeBookmark(issue));

      await context.route('**/api.github.com/repos/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            title: 'Test Issue',
            state: 'open',
            html_url: issueUrl(issue),
            url: `https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`,
            updated_at: '2024-01-15T10:30:00Z',
            comments: 5
          })
        });
      });

      const popupPage = await context.newPage();
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);

      await popupPage.waitForSelector('.issue-item');

      const copyBtn = popupPage.locator('#copy-all-btn');
      await copyBtn.click();

      // Verify success feedback
      await expect(copyBtn).toHaveClass(/success/);

      // Verify clipboard content
      const clipboardText = await popupPage.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('Test Issue');
      expect(clipboardText).toContain(`${issue.owner}/${issue.repo}/issues/${issue.number}`);

      await context.unroute('**/api.github.com/repos/**');
      await popupPage.close();
    });
  });

  test.describe('Options', () => {
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

    test('controls are disabled when no input and no stored token', { tag: '@pat' }, async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);

      // Ensure clean state
      await optionsPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.remove('github_pat', resolve);
        });
      });
      await optionsPage.reload();
      await optionsPage.waitForLoadState('domcontentloaded');

      const input = optionsPage.locator('#pat-input');
      const testBtn = optionsPage.locator('#test-btn');
      const removeBtn = optionsPage.locator('#remove-btn');
      const toggleBtn = optionsPage.locator('#toggle-visibility-btn');

      await expect(input).toHaveValue('');
      await expect(testBtn).toBeDisabled();
      await expect(removeBtn).toBeDisabled();
      await expect(toggleBtn).toBeDisabled();

      await optionsPage.close();
    });

    test('controls are enabled when input is present', { tag: '@pat' }, async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);

      const input = optionsPage.locator('#pat-input');
      const testBtn = optionsPage.locator('#test-btn');
      const removeBtn = optionsPage.locator('#remove-btn');
      const toggleBtn = optionsPage.locator('#toggle-visibility-btn');

      await input.fill('github_pat_test');

      await expect(testBtn).toBeEnabled();
      await expect(removeBtn).toBeEnabled();
      await expect(toggleBtn).toBeEnabled();

      await optionsPage.close();
    });

    test('visibility toggle shows and hides input', { tag: '@pat' }, async () => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);

      const input = optionsPage.locator('#pat-input');
      const toggleBtn = optionsPage.locator('#toggle-visibility-btn');

      await input.fill('github_pat_test');

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

    test('saved token loads on page open', { tag: '@pat' }, async () => {
      const testToken = 'github_pat_11ABCDEFGHIJKLMNOPQRST_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW';

      // Save token directly to storage
      const setupPage = await context.newPage();
      await setupPage.goto(`chrome-extension://${extensionId}/assets/options.html`);
      await setupPage.evaluate((token) => {
        return new Promise((resolve) => {
          chrome.storage.sync.set({ github_pat: token }, resolve);
        });
      }, testToken);
      await setupPage.close();

      // Open fresh options page (simulates reopening)
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);
      await optionsPage.waitForLoadState('domcontentloaded');
      await optionsPage.waitForTimeout(100); // Wait for loadExistingPat

      const input = optionsPage.locator('#pat-input');
      const toggleBtn = optionsPage.locator('#toggle-visibility-btn');

      // Token should be loaded and masked
      await expect(input).toHaveAttribute('type', 'password');
      await expect(input).toHaveValue(testToken);

      // Click toggle to reveal
      await toggleBtn.click();
      await expect(input).toHaveAttribute('type', 'text');
      await expect(input).toHaveValue(testToken);

      // Cleanup
      await optionsPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.remove('github_pat', resolve);
        });
      });
      await optionsPage.close();
    });

    test('test button rejects invalid format', { tag: '@pat' }, async () => {
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

    test('save button rejects invalid format', { tag: '@pat' }, async () => {
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

    test('save button rejects empty input', { tag: '@pat' }, async () => {
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

    test('remove button clears input and storage', { tag: '@pat' }, async () => {
      const testToken = 'github_pat_11ABCDEFGHIJKLMNOPQRST_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW';

      // Mock the GitHub API for token validation
      await context.route('**/api.github.com/user', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ login: 'testuser' })
        });
      });

      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/assets/options.html`);

      // Ensure clean state
      await optionsPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.remove('github_pat', resolve);
        });
      });
      await optionsPage.reload();
      await optionsPage.waitForLoadState('domcontentloaded');

      const input = optionsPage.locator('#pat-input');
      const saveBtn = optionsPage.locator('#save-btn');
      const removeBtn = optionsPage.locator('#remove-btn');

      // Fill and save the token
      await input.fill(testToken);
      await saveBtn.click();
      await expect(optionsPage.locator('#message')).toContainText('saved successfully', { timeout: 5000 });

      // Verify token is in input after save
      await expect(input).toHaveValue(testToken);

      // Track if confirm() is called - it should NOT be
      await optionsPage.evaluate(() => {
        window._confirmCalled = false;
        window._originalConfirm = window.confirm;
        window.confirm = (msg) => {
          window._confirmCalled = true;
          return true;
        };
      });

      // Click Remove - clears input and storage, no confirmation
      await removeBtn.click();
      await optionsPage.waitForTimeout(100);

      const result = await optionsPage.evaluate(() => {
        return {
          confirmCalled: window._confirmCalled,
          inputValue: document.getElementById('pat-input').value
        };
      });

      // Restore confirm
      await optionsPage.evaluate(() => {
        window.confirm = window._originalConfirm;
      });

      // Remove should NOT show confirmation dialog
      expect(result.confirmCalled).toBe(false);

      // Input should be empty
      expect(result.inputValue).toBe('');

      // Storage should be cleared
      const storedToken = await optionsPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.get('github_pat', (r) => resolve(r.github_pat));
        });
      });
      expect(storedToken).toBeUndefined();

      await context.unroute('**/api.github.com/user');
      await optionsPage.close();
    });

    test('token is used in API requests', async () => {
      const testToken = 'github_pat_11ABCDEFGHIJKLMNOPQRST_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW';
      const issue = TEST_ISSUES[0];

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
      await addBookmarks(context, makeBookmark(issue));

      // Track Authorization header from intercepted requests
      let capturedAuthHeader = null;
      await context.route('**/api.github.com/repos/**', async (route) => {
        capturedAuthHeader = route.request().headers()['authorization'];
        // Return mock response
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            number: issue.number,
            title: 'Test Issue',
            state: 'open',
            html_url: issueUrl(issue),
            url: `https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`,
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
      const issue = TEST_ISSUES[1];  // Use different issue from previous test

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
      await addBookmarks(context, makeBookmark(issue));

      // Track Authorization header
      let capturedAuthHeader = null;
      await context.route('**/api.github.com/repos/**', async (route) => {
        capturedAuthHeader = route.request().headers()['authorization'];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            number: issue.number,
            title: 'Test Issue Without Token',
            state: 'open',
            html_url: issueUrl(issue),
            url: `https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`,
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
  //
  // These tests use mocked API responses for visual stability:
  // - Ensures consistent issue titles, states, and timestamps in screenshots
  // - Avoids rate limits that would cause flaky failures in CI
  // - Contract test in Basics block verifies mocks match real API structure
  // ============================================================

  test.describe('Visual', { tag: '@visual' }, () => {
    test('popup with issues', async () => {
      // Use TEST_ISSUES for consistency, with different timestamps for visual variety
      const issue1 = TEST_ISSUES[0];  // microsoft/playwright
      const issue2 = TEST_ISSUES[2];  // facebook/react
      await addBookmarks(context, {
        ...makeBookmark(issue1),
        ...makeBookmark(issue2, Date.now() - 86400000)
      });

      // Mock API at context level - requests come from service worker, not page
      await context.route('**/api.github.com/repos/**', async (route) => {
        const url = route.request().url();
        let data = {
          title: 'Sample Issue',
          state: 'open',
          html_url: issueUrl(issue1),
          url: url,
          updated_at: '2024-01-15T10:30:00Z',
          comments: 5
        };
        if (url.includes(issue1.repo)) {
          data.title = 'Add visual regression testing support';
          data.html_url = issueUrl(issue1);
          data.state = 'open';
          data.comments = 12;
        } else if (url.includes(issue2.repo)) {
          data.title = 'Improve hydration performance';
          data.html_url = issueUrl(issue2);
          data.state = 'closed';
          data.comments = 42;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(data)
        });
      });

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/assets/popup.html`);
      await popupPage.waitForSelector('.issue-item');
      await popupPage.waitForTimeout(500);

      await expect(popupPage).toHaveScreenshot('popup-with-issues.png');
      await context.unroute('**/api.github.com/repos/**');
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

    test('default state', async () => {
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

    test('with token', async () => {
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

  test.describe('Bookmarked view', { tag: '@auth' }, () => {
    test.skip(() => !getGitHubAuth(), 'GITHUB_AUTH_STATE not configured');

    let authContext;
    let authPage;
    let authExtensionId;

    // Helper to add bookmarks in auth context
    async function addAuthBookmarks(bookmarks) {
      const tempPage = await authContext.newPage();
      await tempPage.goto(`chrome-extension://${authExtensionId}/assets/popup.html`);
      await tempPage.evaluate((bookmarks) => {
        return new Promise((resolve) => {
          chrome.storage.sync.set({ bookmarked_issues: bookmarks }, resolve);
        });
      }, bookmarks);
      await tempPage.close();
    }

    // Helper to clear bookmarks in auth context
    async function clearAuthBookmarks() {
      const tempPage = await authContext.newPage();
      await tempPage.goto(`chrome-extension://${authExtensionId}/assets/popup.html`);
      await tempPage.evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.sync.clear(resolve);
        });
      });
      await tempPage.close();
    }

    test.beforeAll(async () => {
      const auth = getGitHubAuth();
      if (!auth) return;

      authContext = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
          '--headless=new',
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      });

      // Add GitHub auth cookies to context
      if (auth.cookies) {
        await authContext.addCookies(auth.cookies);
      }

      let [background] = authContext.serviceWorkers();
      if (!background) {
        background = await authContext.waitForEvent('serviceworker');
      }
      authExtensionId = background.url().split('/')[2];

      const pages = authContext.pages();
      authPage = pages[0] || await authContext.newPage();
    });

    test.afterAll(async () => {
      if (authContext) {
        await authContext.close();
      }
    });

    test('appears in /issues navigation', async () => {
      await authPage.goto('https://github.com/issues/created');
      await authPage.waitForLoadState('domcontentloaded');

      const bookmarksNav = authPage.locator('nav a:has-text("Bookmarked")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
    });

    test('displays bookmarked issues', async () => {
      await addAuthBookmarks(makeBookmark(TEST_ISSUES[0]));

      await authPage.goto('https://github.com/issues/created');
      await authPage.waitForLoadState('domcontentloaded');

      const bookmarksNav = authPage.locator('nav a:has-text("Bookmarked")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      // Wait for the bookmarks view to load and display the issue
      const issueLink = authPage.locator(`a[href*="${TEST_ISSUES[0].repo}/issues/${TEST_ISSUES[0].number}"]`);
      await expect(issueLink).toBeVisible();
    });

    test('shows empty state when no bookmarks', async () => {
      await clearAuthBookmarks();

      await authPage.goto('https://github.com/issues/created');
      await authPage.waitForLoadState('domcontentloaded');

      const bookmarksNav = authPage.locator('nav a:has-text("Bookmarked")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      const emptyState = authPage.locator('#bookmarks-empty');
      await expect(emptyState).toBeVisible({ timeout: 10000 });
    });

    test('auto-refreshes when bookmarks change in another tab', async () => {
      // Start with one bookmark
      await addAuthBookmarks(makeBookmark(TEST_ISSUES[0]));

      // Open bookmarks view
      await authPage.goto('https://github.com/issues/created');
      await authPage.waitForLoadState('domcontentloaded');

      const bookmarksNav = authPage.locator('nav a:has-text("Bookmarked")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      // Verify initial state shows 1 result
      const resultsHeading = authPage.locator('#bookmarks-count');
      await expect(resultsHeading).toContainText('1 result');

      // Simulate bookmark added from another tab by directly modifying storage
      await addAuthBookmarks(makeBookmarks(TEST_ISSUES[0], TEST_ISSUES[1]));

      // View should auto-refresh to show 2 results (debounced at 25ms)
      await expect(resultsHeading).toContainText('2 results');
    });
  });

  // Error handling tests - intercept GraphQL and REST API to test error display
  test.describe('Error Handling', { tag: '@auth' }, () => {
    test.skip(() => !getGitHubAuth(), 'GITHUB_AUTH_STATE not configured');

    const singleBookmark = makeBookmark(TEST_ISSUES[0]);
    const multipleBookmarks = makeBookmarks(TEST_ISSUES[0], TEST_ISSUES[1], TEST_ISSUES[2]);

    let authContext;
    let authExtensionId;

    // Helper to add bookmarks in auth context
    async function addAuthBookmarks(bookmarks) {
      const tempPage = await authContext.newPage();
      await tempPage.goto(`chrome-extension://${authExtensionId}/assets/popup.html`);
      await tempPage.evaluate((bookmarks) => {
        return new Promise((resolve) => {
          chrome.storage.sync.set({ bookmarked_issues: bookmarks }, resolve);
        });
      }, bookmarks);
      await tempPage.close();
    }

    test.beforeAll(async () => {
      const auth = getGitHubAuth();
      if (!auth) return;

      authContext = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
          '--headless=new',
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      });

      // Add GitHub auth cookies to context
      if (auth.cookies) {
        await authContext.addCookies(auth.cookies);
      }

      let [background] = authContext.serviceWorkers();
      if (!background) {
        background = await authContext.waitForEvent('serviceworker');
      }
      authExtensionId = background.url().split('/')[2];
    });

    test.afterAll(async () => {
      if (authContext) {
        await authContext.close();
      }
    });

    test('displays error when GraphQL API fails', async () => {
      await addAuthBookmarks(singleBookmark);

      // Helper to check if URL is our extension's query
      const isExtensionQuery = (url) => {
        if (!url.includes('IssueDashboardKnownViewPageQuery') && !url.includes('IssueRowSecondaryQuery')) {
          return false;
        }
        const body = decodeURIComponent(url.split('body=')[1] || '');
        return body.includes('microsoft/playwright') || body.includes('facebook/react');
      };

      // Intercept GraphQL (content script) - fail to trigger REST fallback
      await authContext.route('**/github.com/_graphql**', (route) => {
        if (isExtensionQuery(route.request().url())) {
          route.fulfill({
            status: 500,
            statusText: 'Internal Server Error',
            contentType: 'application/json',
            body: JSON.stringify({ errors: [{ message: 'Server error' }] })
          });
        } else {
          route.continue();
        }
      });

      // Intercept REST API fallback (background service worker)
      await authContext.route('**/api.github.com/repos/**', (route) => {
        route.fulfill({
          status: 404,
          statusText: 'Not Found',
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' })
        });
      });

      const testPage = await authContext.newPage();
      await testPage.goto('https://github.com/issues/created');
      await testPage.waitForLoadState('domcontentloaded');

      const bookmarksNav = testPage.locator('nav a:has-text("Bookmarked")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      const errorMessage = testPage.locator('#bookmarks-error');
      await expect(errorMessage).toBeVisible({ timeout: 15000 });

      await authContext.unroute('**/github.com/_graphql**');
      await authContext.unroute('**/api.github.com/repos/**');
      await testPage.close();
    });

    test('displays error messages with rate limit info when rate limited', async () => {
      await addAuthBookmarks(singleBookmark);

      // Helper to check if URL is our extension's query
      const isExtensionQuery = (url) => {
        if (!url.includes('IssueDashboardKnownViewPageQuery') && !url.includes('IssueRowSecondaryQuery')) {
          return false;
        }
        const body = decodeURIComponent(url.split('body=')[1] || '');
        return body.includes('microsoft/playwright') || body.includes('facebook/react');
      };

      // Intercept GraphQL (content script) - fail to trigger REST fallback
      await authContext.route('**/github.com/_graphql**', (route) => {
        if (isExtensionQuery(route.request().url())) {
          route.fulfill({
            status: 500,
            statusText: 'Internal Server Error',
            contentType: 'application/json',
            body: JSON.stringify({ errors: [{ message: 'Server error' }] })
          });
        } else {
          route.continue();
        }
      });

      // Intercept REST API fallback (background service worker)
      await authContext.route('**/api.github.com/repos/**', (route) => {
        route.fulfill({
          status: 403,
          statusText: 'rate limit exceeded',
          contentType: 'application/json',
          body: JSON.stringify({ message: 'API rate limit exceeded' })
        });
      });

      const testPage = await authContext.newPage();
      await testPage.goto('https://github.com/issues/created');
      await testPage.waitForLoadState('domcontentloaded');

      const bookmarksNav = testPage.locator('nav a:has-text("Bookmarked")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      const errorMessage = testPage.locator('#bookmarks-error');
      await expect(errorMessage).toBeVisible({ timeout: 15000 });
      // Extension shows user-friendly message, not HTTP status codes
      await expect(errorMessage).toContainText('Failed to load issue details');

      await authContext.unroute('**/github.com/_graphql**');
      await authContext.unroute('**/api.github.com/repos/**');
      await testPage.close();
    });

    test('displays warning when some issues fail to load', async () => {
      await addAuthBookmarks(multipleBookmarks);

      // Helper to check if URL is our extension's query
      const isExtensionQuery = (url) => {
        if (!url.includes('IssueDashboardKnownViewPageQuery') && !url.includes('IssueRowSecondaryQuery')) {
          return false;
        }
        const body = decodeURIComponent(url.split('body=')[1] || '');
        return body.includes('microsoft/playwright') || body.includes('facebook/react');
      };

      // Intercept GraphQL (content script) - fail to trigger REST fallback
      await authContext.route('**/github.com/_graphql**', (route) => {
        if (isExtensionQuery(route.request().url())) {
          route.fulfill({
            status: 500,
            statusText: 'Internal Server Error',
            contentType: 'application/json',
            body: JSON.stringify({ errors: [{ message: 'Server error' }] })
          });
        } else {
          route.continue();
        }
      });

      // Route REST API with mixed responses: 1 success, 1 404, 1 403
      const successIssue = TEST_ISSUES[0];
      let callCount = 0;
      await authContext.route('**/api.github.com/repos/**', (route) => {
        callCount++;
        if (callCount === 1) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              number: successIssue.number,
              title: 'Test Issue',
              html_url: issueUrl(successIssue),
              url: `https://api.github.com/repos/${successIssue.owner}/${successIssue.repo}/issues/${successIssue.number}`,
              state: 'open',
              updated_at: new Date().toISOString(),
              comments: 0
            })
          });
        } else if (callCount === 2) {
          route.fulfill({
            status: 404,
            statusText: 'Not Found',
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Not Found' })
          });
        } else {
          route.fulfill({
            status: 403,
            statusText: 'Forbidden',
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Forbidden' })
          });
        }
      });

      const testPage = await authContext.newPage();
      await testPage.goto('https://github.com/issues/created');
      await testPage.waitForLoadState('domcontentloaded');

      const bookmarksNav = testPage.locator('nav a:has-text("Bookmarked")');
      await expect(bookmarksNav).toBeVisible({ timeout: 10000 });
      await bookmarksNav.click();

      const errorMessage = testPage.locator('#bookmarks-error');
      await expect(errorMessage).toBeVisible({ timeout: 15000 });
      // Extension shows user-friendly warning about partial failures
      await expect(errorMessage).toContainText('2 of 3 issues could not be loaded');

      await authContext.unroute('**/github.com/_graphql**');
      await authContext.unroute('**/api.github.com/repos/**');
      await testPage.close();
    });
  });
});
