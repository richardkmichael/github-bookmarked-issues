// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Background service worker for managing bookmarked issues storage

// Storage key for bookmarked issues
const STORAGE_KEY = 'bookmarked_issues';

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
});

// Log when service worker starts
console.log('[Background] Service worker started');
