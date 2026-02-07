/**
 * Firefox Extension Testing Helpers
 *
 * Shared utilities for WDIO-based Firefox extension tests.
 *
 * API Mocking Limitation:
 * WDIO v9's browser.mock().respond() does not work in Firefox. The BiDi
 * protocol's network.provideResponse only supports the 'body' parameter
 * in the beforeRequestSent phase, but WDIO sends it in responseStarted.
 * Firefox rejects with "unsupported operation" and the response never
 * reaches the page.
 *
 * Related issues:
 * - https://github.com/webdriverio/webdriverio/issues/14090
 * - https://github.com/webdriverio/webdriverio/issues/13977
 *
 * Workaround: Popup display tests seed storage.local with cached issue
 * data as fallback. The extension's background script returns cached
 * data when the GitHub API returns 403 (rate-limited). For non-rate-limited
 * environments, the real API response is used instead.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const EXTENSION_UUID = 'b7a1c5d0-8f2e-4a3b-9c6d-1e4f7a8b2c3d';

export function popupUrl() {
  return `moz-extension://${EXTENSION_UUID}/assets/popup.html`;
}

export function optionsUrl() {
  return `moz-extension://${EXTENSION_UUID}/assets/options.html`;
}

// Known-good public GitHub issues (same pool as Playwright tests).
export const TEST_ISSUES = [
  { owner: 'microsoft', repo: 'playwright', number: 38673 },
  { owner: 'microsoft', repo: 'playwright', number: 38674 },
  { owner: 'facebook', repo: 'react', number: 100 },
];

export function makeBookmark(issue, bookmarkedAt = Date.now()) {
  const key = `${issue.owner}/${issue.repo}/issues/${issue.number}`;
  return {
    [key]: {
      owner: issue.owner,
      repo: issue.repo,
      number: issue.number,
      type: 'issues',
      bookmarkedAt,
    },
  };
}

export function makeBookmarks(...issues) {
  return Object.assign({}, ...issues.map(issue => makeBookmark(issue)));
}

export function issueUrl(issue) {
  return `https://github.com/${issue.owner}/${issue.repo}/issues/${issue.number}`;
}

/**
 * Build an issue_cache object for storage.local.
 * Seeded as fallback when the real GitHub API is rate-limited (403).
 *
 * @param {Array<{issue, title, state?, comments?, updatedAt?}>} entries
 * @returns {object} Cache object matching background.js's CACHE_KEY format
 */
export function buildIssueCache(entries) {
  const cache = {};
  for (const entry of entries) {
    const { issue } = entry;
    const key = `${issue.owner}/${issue.repo}/issues/${issue.number}`;
    cache[key] = {
      data: {
        number: issue.number,
        title: entry.title,
        state: entry.state || 'open',
        html_url: issueUrl(issue),
        url: `https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`,
        updated_at: entry.updatedAt || '2024-01-15T10:30:00Z',
        comments: entry.comments || 0,
      },
      fetchedAt: Date.now(),
    };
  }
  return cache;
}

/**
 * Clear all extension storage (sync + local).
 * Navigates to options page to access the WebExtension API — options.html
 * is preferred over popup.html because the popup triggers API calls on load.
 *
 * Inside browser.execute(), `browser` is the WebExtension API, NOT WDIO.
 */
export async function clearAllStorage() {
  await browser.url(optionsUrl());
  await browser.execute(async function () {
    await browser.storage.sync.clear();
    await browser.storage.local.clear();
  });
}

/**
 * Set bookmarks and optionally seed the issue cache.
 * Must be called after clearAllStorage() or while already on an extension page.
 *
 * @param {object} bookmarks - bookmarked_issues object for storage.sync
 * @param {object} [cache] - issue_cache object for storage.local
 */
export async function seedStorage(bookmarks, cache) {
  await browser.execute(async function (bm, c) {
    await browser.storage.sync.set({ bookmarked_issues: bm });
    if (c) {
      await browser.storage.local.set({ issue_cache: c });
    }
  }, bookmarks, cache || null);
}

/**
 * Wait for the popup's loading state to finish.
 * The popup shows #loading while fetching issues, then hides it.
 */
export async function waitForPopupLoaded() {
  await browser.waitUntil(
    async () => {
      const classes = await $('#loading').getAttribute('class');
      return classes && classes.includes('d-none');
    },
    { timeout: 15000, timeoutMsg: 'Popup loading did not complete' }
  );
}

export function loadFixture(name) {
  return readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf-8');
}
