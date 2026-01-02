// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Background service worker for managing bookmarked issues storage

// Storage keys
const STORAGE_KEY = 'bookmarked_issues';
const HASHES_KEY = 'discovered_hashes';

// Runtime cache for discovered GraphQL query hashes (keyed by query name)
// Persisted to storage.sync so they survive service worker restarts
const discoveredHashes = new Map();

// Load persisted hashes on startup
async function loadPersistedHashes() {
  try {
    const result = await browser.storage.sync.get(HASHES_KEY);
    const persisted = result[HASHES_KEY] || {};
    for (const [name, hash] of Object.entries(persisted)) {
      discoveredHashes.set(name, hash);
    }
    if (Object.keys(persisted).length > 0) {
      console.log('[Background] Loaded persisted hashes:', Object.keys(persisted));
    }
  } catch (e) {
    console.error('[Background] Error loading persisted hashes:', e);
  }
}

// Persist hashes to storage
async function persistHashes() {
  try {
    const obj = Object.fromEntries(discoveredHashes);
    await browser.storage.sync.set({ [HASHES_KEY]: obj });
  } catch (e) {
    console.error('[Background] Error persisting hashes:', e);
  }
}

// Load hashes immediately
loadPersistedHashes();

// Listen for responses from GitHub to capture GraphQL query hashes from Link headers
browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    // Only process main frame navigation
    if (details.type !== 'main_frame') return;

    // Look for Link header with GraphQL preload hints
    const linkHeader = details.responseHeaders?.find(h => h.name.toLowerCase() === 'link');
    if (!linkHeader || !linkHeader.value.includes('_graphql')) return;

    // Extract all query hashes from Link header (may contain multiple preloads)
    let hashesUpdated = false;
    const matches = linkHeader.value.matchAll(/body=([^&>\s]+)/g);
    for (const match of matches) {
      try {
        const decoded = decodeURIComponent(match[1]);
        const parsed = JSON.parse(decoded);
        if (parsed.persistedQueryName && parsed.query) {
          const existing = discoveredHashes.get(parsed.persistedQueryName);
          if (existing !== parsed.query) {
            discoveredHashes.set(parsed.persistedQueryName, parsed.query);
            console.log('[Background] Discovered hash for', parsed.persistedQueryName, ':', parsed.query);
            hashesUpdated = true;
          }
        }
      } catch (e) {
        // Skip malformed entries
      }
    }

    // Persist if any hashes were updated
    if (hashesUpdated) {
      persistHashes();
    }
  },
  { urls: ['https://github.com/*'] },
  ['responseHeaders']
);

// Get all bookmarked issues
async function getBookmarkedIssues() {
  const result = await browser.storage.sync.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

// Add a bookmarked issue
async function addBookmark(issueData) {
  const bookmarks = await getBookmarkedIssues();

  // Store minimal data to stay under storage limits
  bookmarks[issueData.id] = {
    owner: issueData.owner,
    repo: issueData.repo,
    number: issueData.number,
    type: issueData.type,
    bookmarkedAt: issueData.bookmarkedAt
  };

  await browser.storage.sync.set({ [STORAGE_KEY]: bookmarks });

  console.log('[Background] Added bookmark:', issueData.id);
  console.log('[Background] Total bookmarks:', Object.keys(bookmarks).length);

  // Check storage usage
  const bytesInUse = await browser.storage.sync.getBytesInUse(STORAGE_KEY);
  console.log('[Background] Storage usage:', bytesInUse, 'bytes');

  if (bytesInUse > 90000) { // Warn if approaching 100KB limit
    console.warn('[Background] Approaching storage limit!', bytesInUse, '/ 102400 bytes');
  }

  return { success: true, totalBookmarks: Object.keys(bookmarks).length };
}

// Remove a bookmarked issue
async function removeBookmark(issueId) {
  const bookmarks = await getBookmarkedIssues();

  if (bookmarks[issueId]) {
    delete bookmarks[issueId];
    await browser.storage.sync.set({ [STORAGE_KEY]: bookmarks });
    console.log('[Background] Removed bookmark:', issueId);
  }

  return { success: true, totalBookmarks: Object.keys(bookmarks).length };
}

// Listen for messages from content script and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type);

  if (message.type === 'BOOKMARK_ISSUE') {
    addBookmark(message.data)
      .then(sendResponse)
      .catch(error => {
        console.error('[Background] Error adding bookmark:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates async response
  }

  if (message.type === 'UNBOOKMARK_ISSUE') {
    removeBookmark(message.data.id)
      .then(sendResponse)
      .catch(error => {
        console.error('[Background] Error removing bookmark:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'GET_BOOKMARKS') {
    getBookmarkedIssues()
      .then(bookmarks => sendResponse({ bookmarks }))
      .catch(error => {
        console.error('[Background] Error getting bookmarks:', error);
        sendResponse({ bookmarks: {}, error: error.message });
      });
    return true;
  }

  if (message.type === 'GET_STORAGE_INFO') {
    Promise.all([
      getBookmarkedIssues(),
      browser.storage.sync.getBytesInUse(STORAGE_KEY)
    ])
      .then(([bookmarks, bytesInUse]) => {
        sendResponse({
          count: Object.keys(bookmarks).length,
          bytesInUse,
          bytesRemaining: 102400 - bytesInUse,
          percentUsed: (bytesInUse / 102400 * 100).toFixed(1)
        });
      })
      .catch(error => {
        console.error('[Background] Error getting storage info:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (message.type === 'GET_DISCOVERED_HASH') {
    const hash = discoveredHashes.get(message.queryName);
    sendResponse({ hash: hash || null });
    return true;
  }

  if (message.type === 'FETCH_ISSUE_DETAILS') {
    const { owner, repo, type, number } = message.data;
    const endpoint = type === 'pull'
      ? `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`
      : `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;

    console.log('[Background] Fetching issue:', endpoint);

    fetch(endpoint, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    })
      .then(async response => {
        if (!response.ok) {
          const statusText = response.statusText || 'Unknown Error';
          throw new Error(`${response.status} ${statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('[Background] Successfully fetched issue:', `${owner}/${repo}#${number}`);
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error('[Background] Error fetching issue:', endpoint, error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

});

// Log when service worker starts
console.log('[Background] Service worker started');
