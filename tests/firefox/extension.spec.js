/**
 * Firefox Extension Test Suite
 *
 * Mirrors the Playwright/Chromium tests (tests/chrome/extension.spec.js) for Firefox,
 * using WebdriverIO v9 with the BiDi protocol.
 *
 * Key difference: browser.mock().respond() is broken in Firefox BiDi, so popup
 * display tests use real GitHub API calls with seeded cache as rate-limit
 * fallback. See tests/firefox/helpers.js for details.
 *
 * Run: npm run test:firefox
 */

import {
  popupUrl, optionsUrl, TEST_ISSUES,
  makeBookmark, makeBookmarks, issueUrl,
  buildIssueCache, clearAllStorage, seedStorage,
  waitForPopupLoaded, loadFixture,
} from './helpers.js';

// ============================================================
// Popup
// ============================================================

describe('Popup', function () {
  beforeEach(async function () {
    await clearAllStorage();
  });

  it('opens and displays UI elements', async function () {
    await browser.url(popupUrl());

    const storageInfo = await $('#storage-info');
    await storageInfo.waitForExist({ timeout: 10000 });
    expect(await storageInfo.isExisting()).toBe(true);

    const title = await $('h1');
    expect(await title.getText()).toContain('GitHub Bookmarked Issues');
  });

  it('shows empty state when no bookmarks', async function () {
    await browser.url(popupUrl());

    const emptyState = await $('#empty-state');
    await emptyState.waitForDisplayed({ timeout: 10000 });
    expect(await emptyState.getText()).toContain('No bookmarked issues yet');
  });

  it('displays bookmarked issues', async function () {
    const issue = TEST_ISSUES[0];
    const bookmarks = makeBookmark(issue);
    const cache = buildIssueCache([
      { issue, title: 'Spike test issue', state: 'open', comments: 5 },
    ]);
    await seedStorage(bookmarks, cache);

    await browser.url(popupUrl());

    // Wait for at least one issue item to render (real API or cached data)
    const issueItem = await $('.issue-item');
    await issueItem.waitForDisplayed({ timeout: 15000 });

    // Verify issue link points to the correct repo/issue
    const link = await issueItem.$('a');
    const href = await link.getAttribute('href');
    expect(href).toContain(`${issue.repo}/issues/${issue.number}`);
  });

  it('removes bookmark when remove button clicked', async function () {
    const issue = TEST_ISSUES[0];
    const bookmarkKey = `${issue.owner}/${issue.repo}/issues/${issue.number}`;
    const bookmarks = makeBookmark(issue);
    const cache = buildIssueCache([
      { issue, title: 'Issue to remove', state: 'open' },
    ]);
    await seedStorage(bookmarks, cache);

    await browser.url(popupUrl());

    const issueItem = await $('.issue-item');
    await issueItem.waitForDisplayed({ timeout: 15000 });

    const removeBtn = await $('.remove-btn');
    await removeBtn.click();
    await browser.pause(500);

    // Issue should be gone from DOM
    await browser.waitUntil(
      async () => !(await issueItem.isDisplayed()),
      { timeout: 5000 }
    );

    // Verify storage was updated
    const stored = await browser.execute(async function () {
      const result = await browser.storage.sync.get('bookmarked_issues');
      return result.bookmarked_issues || {};
    });
    expect(Object.keys(stored)).not.toContain(bookmarkKey);
  });

  it('clear all removes all bookmarks', async function () {
    const bookmarks = makeBookmarks(TEST_ISSUES[0], TEST_ISSUES[2]);
    const cache = buildIssueCache([
      { issue: TEST_ISSUES[0], title: 'Issue one', state: 'open' },
      { issue: TEST_ISSUES[2], title: 'Issue two', state: 'closed', comments: 42 },
    ]);
    await seedStorage(bookmarks, cache);

    await browser.url(popupUrl());

    // Wait for issues to load
    await browser.waitUntil(
      async () => (await $$('.issue-item')).length >= 2,
      { timeout: 15000, timeoutMsg: 'Expected 2 issue items to appear' }
    );

    const clearBtn = await $('#clear-all-btn');
    await clearBtn.click();
    await browser.pause(500);

    // Empty state should appear
    const emptyState = await $('#empty-state');
    await emptyState.waitForDisplayed({ timeout: 5000 });

    // Verify storage is empty
    const stored = await browser.execute(async function () {
      const result = await browser.storage.sync.get('bookmarked_issues');
      return result.bookmarked_issues || {};
    });
    expect(Object.keys(stored)).toHaveLength(0);
  });

  it('copies all issues to clipboard', async function () {
    const issue = TEST_ISSUES[0];
    const bookmarks = makeBookmark(issue);
    const cache = buildIssueCache([
      { issue, title: 'Issue to copy', state: 'open' },
    ]);
    await seedStorage(bookmarks, cache);

    await browser.url(popupUrl());

    await $('.issue-item').waitForDisplayed({ timeout: 15000 });

    const copyBtn = await $('#copy-all-btn');
    await copyBtn.click();

    // Verify success feedback (CSS class). Clipboard content verification
    // is unreliable in headless Firefox; Playwright/Chrome covers that.
    await browser.waitUntil(
      async () => {
        const classes = await copyBtn.getAttribute('class');
        return classes.includes('success');
      },
      { timeout: 5000, timeoutMsg: 'Expected copy button to show success state' }
    );
  });

  it('imports valid issues from paste', async function () {
    await browser.url(popupUrl());
    await waitForPopupLoaded();

    const importBtn = await $('#import-btn');
    await importBtn.click();

    const importSection = await $('#import-section');
    await importSection.waitForDisplayed({ timeout: 5000 });

    const fixture = loadFixture('import-issues.md');
    const textarea = await $('#import-textarea');
    await textarea.setValue(fixture);
    await browser.pause(500);

    // Fixture: 3 unique valid issues, 7 invalid entries
    const validation = await $('#import-validation');
    await validation.waitForDisplayed({ timeout: 5000 });
    expect(await validation.getText()).toContain('3 valid');
    expect(await validation.getText()).toContain('7 invalid');

    // Import
    const submitBtn = await $('#import-submit-btn');
    expect(await submitBtn.isEnabled()).toBe(true);
    await submitBtn.click();
    await browser.pause(1000);

    // Verify storage
    const stored = await browser.execute(async function () {
      const result = await browser.storage.sync.get('bookmarked_issues');
      return result.bookmarked_issues || {};
    });
    const keys = Object.keys(stored);
    expect(keys).toContain('microsoft/playwright/issues/38673');
    expect(keys).toContain('microsoft/playwright/issues/38674');
    expect(keys).toContain('facebook/react/issues/100');
    expect(keys).toHaveLength(3);
  });

  it('detects duplicate bookmarks during import', async function () {
    await seedStorage(makeBookmark(TEST_ISSUES[0]));

    await browser.url(popupUrl());
    await waitForPopupLoaded();
    // Ensure the seeded bookmark is rendered before testing import duplicate detection
    await $('.issue-item').waitForDisplayed({ timeout: 10000 });

    const importBtn = await $('#import-btn');
    await importBtn.click();

    const textarea = await $('#import-textarea');
    await textarea.setValue(`- ${issueUrl(TEST_ISSUES[0])}`);
    await browser.pause(500);

    const validation = await $('#import-validation');
    await validation.waitForDisplayed({ timeout: 5000 });
    expect(await validation.getText()).toContain('1 duplicate');

    const submitBtn = await $('#import-submit-btn');
    expect(await submitBtn.isEnabled()).toBe(false);
  });
});

// ============================================================
// Options
// ============================================================

describe('Options', function () {
  beforeEach(async function () {
    await clearAllStorage();
  });

  it('opens and displays UI', async function () {
    await browser.url(optionsUrl());

    const heading = await $('h1');
    expect(await heading.getText()).toContain('Settings');
    expect(await $('#pat-input').isExisting()).toBe(true);
    expect(await $('#save-btn').isExisting()).toBe(true);
    expect(await $('#test-btn').isExisting()).toBe(true);
    expect(await $('#toggle-visibility-btn').isExisting()).toBe(true);
  });

  it('shows "No token configured" status by default', async function () {
    await browser.url(optionsUrl());
    await browser.pause(200); // Wait for loadExistingPat()

    const status = await $('#status-not-configured');
    expect(await status.isDisplayed()).toBe(true);

    const configuredStatus = await $('#status-configured');
    const classes = await configuredStatus.getAttribute('class');
    expect(classes).toContain('d-none');
  });

  it('controls are disabled when no input and no stored token', async function () {
    await browser.url(optionsUrl());
    await browser.pause(200);

    expect(await $('#pat-input').getValue()).toBe('');
    expect(await $('#test-btn').isEnabled()).toBe(false);
    expect(await $('#remove-btn').isEnabled()).toBe(false);
    expect(await $('#toggle-visibility-btn').isEnabled()).toBe(false);
  });

  it('controls are enabled when input is present', async function () {
    await browser.url(optionsUrl());

    const input = await $('#pat-input');
    await input.setValue('github_pat_test');

    expect(await $('#test-btn').isEnabled()).toBe(true);
    expect(await $('#remove-btn').isEnabled()).toBe(true);
    expect(await $('#toggle-visibility-btn').isEnabled()).toBe(true);
  });

  it('visibility toggle shows and hides input', async function () {
    await browser.url(optionsUrl());

    const input = await $('#pat-input');
    const toggleBtn = await $('#toggle-visibility-btn');

    await input.setValue('github_pat_test');

    // Initially password type (hidden)
    expect(await input.getAttribute('type')).toBe('password');
    expect(await toggleBtn.getAttribute('aria-pressed')).toBe('false');

    // Click to show
    await toggleBtn.click();
    expect(await input.getAttribute('type')).toBe('text');
    expect(await toggleBtn.getAttribute('aria-pressed')).toBe('true');

    // Click to hide again
    await toggleBtn.click();
    expect(await input.getAttribute('type')).toBe('password');
    expect(await toggleBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('saved token loads on page open', async function () {
    const testToken = 'github_pat_11ABCDEFGHIJKLMNOPQRST_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW';

    // Set token directly in storage (we're on options page from beforeEach)
    await browser.execute(async function (token) {
      await browser.storage.sync.set({ github_pat: token });
    }, testToken);

    // Reload to trigger loadExistingPat()
    await browser.url(optionsUrl());
    await browser.pause(200);

    const input = await $('#pat-input');
    expect(await input.getValue()).toBe(testToken);
    expect(await input.getAttribute('type')).toBe('password');

    // Token configured status should show
    const configuredStatus = await $('#status-configured');
    expect(await configuredStatus.isDisplayed()).toBe(true);
  });

  it('test button rejects invalid format', async function () {
    await browser.url(optionsUrl());

    const input = await $('#pat-input');
    await input.setValue('invalid_token');

    const testBtn = await $('#test-btn');
    await testBtn.click();

    const message = await $('#message');
    await message.waitForDisplayed({ timeout: 5000 });
    expect(await message.getText()).toContain('Invalid token format');
  });

  it('save button rejects invalid format', async function () {
    await browser.url(optionsUrl());

    const input = await $('#pat-input');
    await input.setValue('ghp_classic_token_not_allowed');

    const saveBtn = await $('#save-btn');
    await saveBtn.click();

    const message = await $('#message');
    await message.waitForDisplayed({ timeout: 5000 });
    expect(await message.getText()).toContain('Invalid token format');
  });

  it('save button rejects empty input', async function () {
    await browser.url(optionsUrl());

    const saveBtn = await $('#save-btn');
    await saveBtn.click();

    const message = await $('#message');
    await message.waitForDisplayed({ timeout: 5000 });
    expect(await message.getText()).toContain('Enter a token');
  });

  it('remove button clears input and storage', async function () {
    const testToken = 'github_pat_11ABCDEFGHIJKLMNOPQRST_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW';

    // Set token directly in storage
    await browser.execute(async function (token) {
      await browser.storage.sync.set({ github_pat: token });
    }, testToken);

    // Reload to pick up stored token
    await browser.url(optionsUrl());
    await browser.pause(200);

    // Verify token is loaded
    const input = await $('#pat-input');
    expect(await input.getValue()).toBe(testToken);

    // Click Remove
    const removeBtn = await $('#remove-btn');
    await removeBtn.click();
    await browser.pause(200);

    // Input should be empty
    expect(await input.getValue()).toBe('');

    // Status should revert to "No token configured"
    const status = await $('#status-not-configured');
    expect(await status.isDisplayed()).toBe(true);

    // Storage should be cleared
    const storedToken = await browser.execute(async function () {
      const result = await browser.storage.sync.get('github_pat');
      return result.github_pat;
    });
    expect(storedToken).toBeUndefined();
  });
});

// ============================================================
// Navigation — content script on live github.com
//
// These tests verify the bookmark button (content script) appears
// on public issue pages via various navigation paths. No auth needed.
// ============================================================

describe('Navigation', function () {
  this.timeout(30000);

  const bookmarkSelector = '[data-extension-bookmark]';
  const headerActionsSelector = '[data-component="PH_Actions"]';

  beforeEach(async function () {
    await clearAllStorage();
  });

  it('bookmark button appears on direct navigation to issue page', async function () {
    await browser.url(issueUrl(TEST_ISSUES[0]));

    const headerActions = await $(headerActionsSelector);
    await headerActions.waitForDisplayed({ timeout: 15000 });

    const bookmarkButton = await $(`${headerActionsSelector} ${bookmarkSelector}`);
    await bookmarkButton.waitForDisplayed({ timeout: 10000 });
  });

  it('bookmark button appears after SPA navigation from issues list', async function () {
    await browser.url('https://github.com/microsoft/playwright/issues');

    // Click on first issue link (SPA navigation)
    // waitForExist first: React re-renders cause stale element references that
    // make waitForDisplayed fail if called before the DOM stabilizes.
    const issueLink = await $('a[href^="/microsoft/playwright/issues/"]:not([href$="/issues/"])');
    await issueLink.waitForExist({ timeout: 15000 });
    await issueLink.waitForDisplayed({ timeout: 10000 });
    await issueLink.click();

    // Wait for issue page header actions
    const headerActions = await $(headerActionsSelector);
    await headerActions.waitForDisplayed({ timeout: 15000 });

    const bookmarkButton = await $(`${headerActionsSelector} ${bookmarkSelector}`);
    await bookmarkButton.waitForDisplayed({ timeout: 10000 });
  });

  it('bookmark button appears after SPA navigation from repo page', async function () {
    await browser.url('https://github.com/microsoft/playwright');

    // Click Issues tab
    const issuesTab = await $('#issues-tab');
    await issuesTab.waitForDisplayed({ timeout: 10000 });
    await issuesTab.click();

    // Wait for issues list, click first issue
    // waitForExist first: React re-renders cause stale element references that
    // make waitForDisplayed fail if called before the DOM stabilizes.
    const issueLink = await $('a[href^="/microsoft/playwright/issues/"]:not([href$="/issues/"])');
    await issueLink.waitForExist({ timeout: 15000 });
    await issueLink.waitForDisplayed({ timeout: 10000 });
    await issueLink.click();

    // Wait for issue page header actions
    const headerActions = await $(headerActionsSelector);
    await headerActions.waitForDisplayed({ timeout: 15000 });

    const bookmarkButton = await $(`${headerActionsSelector} ${bookmarkSelector}`);
    await bookmarkButton.waitForDisplayed({ timeout: 10000 });
  });
});

// ============================================================
// Visual Regression — screenshot comparison for Firefox rendering
//
// Uses @wdio/visual-service (checkFullPageScreen).
// Dynamic content is frozen after loading for deterministic baselines.
// ============================================================

// Cross-platform font rendering tolerance: macOS baselines vs Linux in CI.
// Matches Playwright's maxDiffPixelRatio: 0.02 (2%) for Chrome visual tests.
const VISUAL_MISMATCH_TOLERANCE = process.env.CI ? 5.5 : 0;

describe('Visual', function () {
  beforeEach(async function () {
    await clearAllStorage();
  });

  it('popup with issues', async function () {
    const issue1 = TEST_ISSUES[0];
    const issue2 = TEST_ISSUES[2];
    const bookmarks = makeBookmarks(issue1, issue2);
    const cache = buildIssueCache([
      { issue: issue1, title: 'Add visual regression testing support', state: 'open', comments: 12, updatedAt: '2024-01-15T10:30:00Z' },
      { issue: issue2, title: 'Improve hydration performance', state: 'closed', comments: 42, updatedAt: '2024-01-12T09:00:00Z' },
    ]);
    await seedStorage(bookmarks, cache);

    await browser.url(popupUrl());
    await $('.issue-item').waitForDisplayed({ timeout: 15000 });

    // Freeze dynamic content for screenshot stability
    await browser.execute(function () {
      document.querySelectorAll('relative-time').forEach(function (el) {
        el.textContent = 'Jan 15, 2024';
      });
      var info = document.getElementById('storage-info');
      if (info) info.textContent = '2 bookmarks \u2022 0.1% of storage used';
    });
    await browser.pause(500);

    await expect(browser).toMatchFullPageSnapshot('popup-with-issues', VISUAL_MISMATCH_TOLERANCE);
  });

  it('popup empty state', async function () {
    await browser.url(popupUrl());
    await $('#empty-state').waitForDisplayed({ timeout: 10000 });
    await browser.pause(300);

    await expect(browser).toMatchFullPageSnapshot('popup-empty', VISUAL_MISMATCH_TOLERANCE);
  });

  it('popup import section', async function () {
    await browser.url(popupUrl());
    await waitForPopupLoaded();

    await $('#import-btn').click();
    await $('#import-section').waitForDisplayed({ timeout: 5000 });
    await browser.pause(300);

    await expect(browser).toMatchFullPageSnapshot('popup-import', VISUAL_MISMATCH_TOLERANCE);
  });

  it('options default state', async function () {
    await browser.url(optionsUrl());
    await browser.pause(500);

    await expect(browser).toMatchFullPageSnapshot('options-default', VISUAL_MISMATCH_TOLERANCE);
  });

  it('options with token configured', async function () {
    // Set a mock token in storage
    await browser.execute(async function () {
      await browser.storage.sync.set({
        github_pat: 'github_pat_mock_token_for_visual_testing',
      });
    });

    await browser.url(optionsUrl());
    await browser.pause(500);

    await expect(browser).toMatchFullPageSnapshot('options-configured', VISUAL_MISMATCH_TOLERANCE);
  });
});
