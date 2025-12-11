// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Background service worker for managing subscribed issues storage

// Storage key for subscribed issues
const STORAGE_KEY = 'subscribed_issues';

// Get all subscribed issues
async function getSubscribedIssues() {
  const result = await browser.storage.sync.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

// Add a subscribed issue
async function addSubscription(issueData) {
  const subscriptions = await getSubscribedIssues();

  // Store minimal data to stay under storage limits
  subscriptions[issueData.id] = {
    owner: issueData.owner,
    repo: issueData.repo,
    number: issueData.number,
    type: issueData.type,
    subscribedAt: issueData.subscribedAt
  };

  await browser.storage.sync.set({ [STORAGE_KEY]: subscriptions });

  console.log('[Background] Added subscription:', issueData.id);
  console.log('[Background] Total subscriptions:', Object.keys(subscriptions).length);

  // Check storage usage
  const bytesInUse = await browser.storage.sync.getBytesInUse(STORAGE_KEY);
  console.log('[Background] Storage usage:', bytesInUse, 'bytes');

  if (bytesInUse > 90000) { // Warn if approaching 100KB limit
    console.warn('[Background] Approaching storage limit!', bytesInUse, '/ 102400 bytes');
  }

  return { success: true, totalSubscriptions: Object.keys(subscriptions).length };
}

// Remove a subscribed issue
async function removeSubscription(issueId) {
  const subscriptions = await getSubscribedIssues();

  if (subscriptions[issueId]) {
    delete subscriptions[issueId];
    await browser.storage.sync.set({ [STORAGE_KEY]: subscriptions });
    console.log('[Background] Removed subscription:', issueId);
  }

  return { success: true, totalSubscriptions: Object.keys(subscriptions).length };
}

// Listen for messages from content script and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type);

  if (message.type === 'SUBSCRIBE_ISSUE') {
    addSubscription(message.data)
      .then(sendResponse)
      .catch(error => {
        console.error('[Background] Error adding subscription:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates async response
  }

  if (message.type === 'UNSUBSCRIBE_ISSUE') {
    removeSubscription(message.data.id)
      .then(sendResponse)
      .catch(error => {
        console.error('[Background] Error removing subscription:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'GET_SUBSCRIPTIONS') {
    getSubscribedIssues()
      .then(subscriptions => sendResponse({ subscriptions }))
      .catch(error => {
        console.error('[Background] Error getting subscriptions:', error);
        sendResponse({ subscriptions: {}, error: error.message });
      });
    return true;
  }

  if (message.type === 'GET_STORAGE_INFO') {
    Promise.all([
      getSubscribedIssues(),
      browser.storage.sync.getBytesInUse(STORAGE_KEY)
    ])
      .then(([subscriptions, bytesInUse]) => {
        sendResponse({
          count: Object.keys(subscriptions).length,
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
