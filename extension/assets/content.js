// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Content script to add bookmark button to GitHub issue pages

(function() {
  'use strict';

  // Setup icon templates (injected once into page)
  function setupIconTemplates() {
    if (document.getElementById('ext-bookmark-icons')) return;

    const container = document.createElement('div');
    container.id = 'ext-bookmark-icons';
    container.style.display = 'none';

    const bookmarkTemplate = document.createElement('template');
    bookmarkTemplate.id = 'icon-bookmark';
    bookmarkTemplate.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;" class="octicon octicon-bookmark"><path d="M3 2.75C3 1.784 3.784 1 4.75 1h6.5c.966 0 1.75.784 1.75 1.75v11.5a.75.75 0 0 1-1.227.579L8 11.722l-3.773 3.107A.751.751 0 0 1 3 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.91l3.023-2.489a.75.75 0 0 1 .954 0l3.023 2.49V2.75a.25.25 0 0 0-.25-.25Z"></path></svg>';

    const bookmarkFilledTemplate = document.createElement('template');
    bookmarkFilledTemplate.id = 'icon-bookmark-filled';
    bookmarkFilledTemplate.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;" class="octicon octicon-bookmark-filled"><path d="M3 2.75C3 1.784 3.784 1 4.75 1h6.5c.966 0 1.75.784 1.75 1.75v11.5a.75.75 0 0 1-1.227.579L8 11.722l-3.773 3.107A.75.75 0 0 1 3 14.25V2.75Z"></path></svg>';

    container.appendChild(bookmarkTemplate);
    container.appendChild(bookmarkFilledTemplate);
    document.body.appendChild(container);
  }

  // Show error notification to user
  function showErrorNotification(message) {
    // Remove any existing notification
    const existing = document.querySelector('[data-extension-notification]');
    if (existing) {
      existing.remove();
    }

    // Create notification using GitHub Primer styles
    const notification = document.createElement('div');
    notification.setAttribute('data-extension-notification', 'true');
    notification.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      max-width: 450px;
      padding: 16px;
      background-color: #ffebe9;
      border: 1px solid #ff8182;
      border-radius: 6px;
      color: #82071e;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
      display: flex;
      align-items: center;
      gap: 12px;
    `;

    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  // Selector for page header actions (using prefix to avoid CSS module hash)
  const HEADER_ACTIONS_SELECTOR = '[data-component="PH_Actions"] [class*="HeaderMenu-module__menuActionsContainer"]';

  // Selector for sticky header actions (appears when scrolling)
  const STICKY_HEADER_ACTIONS_SELECTOR = '[class*="HeaderMetadata-module__stickyContainer"] [class*="HeaderMenu-module__menuActionsContainer"]';

  // Extension button marker
  const BOOKMARK_BUTTON_ATTR = 'data-extension-bookmark';

  // Extract issue data from current page
  function getIssueData() {
    const urlMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)/);

    if (!urlMatch) {
      return null;
    }

    const [, owner, repo, number] = urlMatch;
    const issueTitle = document.querySelector('.js-issue-title, h1.gh-header-title');
    const title = issueTitle ? issueTitle.textContent.trim() : '';

    return {
      id: makeBookmarkId(owner, repo, 'issues', number),
      owner,
      repo,
      type: 'issues',
      number: parseInt(number, 10),
      title,
      url: window.location.href,
      bookmarkedAt: Date.now()
    };
  }

  // Check if current issue is bookmarked
  async function isBookmarked(issueId) {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'GET_BOOKMARKS'
      });
      return !!response.bookmarks[issueId];
    } catch (error) {
      console.error('[GitHub Bookmarked Issues] Failed to check bookmark status:', error);
      return false;
    }
  }

  // Update bookmark button icon
  function updateBookmarkButton(button, bookmarked) {
    const icon = getIcon(bookmarked ? 'bookmark-filled' : 'bookmark');
    button.replaceChildren(icon);
    button.setAttribute('aria-label', bookmarked ? 'Remove bookmark' : 'Bookmark issue');
  }

  // Update all bookmark buttons on the page (main header and sticky header)
  function updateAllBookmarkButtons(bookmarked) {
    const buttons = document.querySelectorAll(`[${BOOKMARK_BUTTON_ATTR}]`);
    buttons.forEach(button => updateBookmarkButton(button, bookmarked));
  }

  // Handle bookmark button click
  async function handleBookmarkClick() {
    const issueData = getIssueData();
    if (!issueData) {
      return;
    }

    const bookmarked = await isBookmarked(issueData.id);

    try {
      if (bookmarked) {
        // Remove bookmark
        await browser.runtime.sendMessage({
          type: 'UNBOOKMARK_ISSUE',
          data: { id: issueData.id }
        });
        console.log('[GitHub Bookmarked Issues] Removed bookmark:', issueData.id);
        updateAllBookmarkButtons(false);
      } else {
        // Add bookmark
        await browser.runtime.sendMessage({
          type: 'BOOKMARK_ISSUE',
          data: issueData
        });
        console.log('[GitHub Bookmarked Issues] Added bookmark:', issueData.id);
        updateAllBookmarkButtons(true);
      }
    } catch (error) {
      console.error('[GitHub Bookmarked Issues] Failed to toggle bookmark:', error);
      showErrorNotification('Failed to update bookmark. Please try again.');
    }
  }

  // Create a bookmark button element
  function createBookmarkButton(bookmarked) {
    const button = document.createElement('button');
    button.setAttribute('data-component', 'IconButton');
    button.setAttribute('type', 'button');
    button.className = 'prc-Button-ButtonBase-c50BI prc-Button-IconButton-szpyj';
    button.setAttribute('data-loading', 'false');
    button.setAttribute('data-no-visuals', 'true');
    button.setAttribute('data-size', 'medium');
    button.setAttribute('data-variant', 'invisible');
    button.setAttribute(BOOKMARK_BUTTON_ATTR, 'true');

    // Add inline styles to match GitHub's native icon buttons
    button.style.cssText = `
      border: none;
      background: transparent;
      padding: 0;
      margin: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: inherit;
    `;

    updateBookmarkButton(button, bookmarked);
    button.addEventListener('click', () => handleBookmarkClick());

    return button;
  }

  // Insert bookmark button into a container if not already present
  function insertButtonIntoContainer(container, bookmarked, containerName) {
    // Check if this container already has a bookmark button
    if (container.querySelector(`[${BOOKMARK_BUTTON_ATTR}]`)) {
      return false;
    }

    const button = createBookmarkButton(bookmarked);
    container.appendChild(button);

    const timestamp = performance.now().toFixed(1);
    console.log(`[GitHub Bookmarked Issues] [${timestamp}ms] Bookmark button added to ${containerName}`);
    return true;
  }

  // Create and insert bookmark buttons into all available headers
  async function insertBookmarkButton() {
    const timestamp = performance.now().toFixed(1);
    const issueData = getIssueData();
    if (!issueData) {
      console.log(`[GitHub Bookmarked Issues] [${timestamp}ms] Not on an issue page`);
      return;
    }

    // Find both header containers
    const mainHeader = document.querySelector(HEADER_ACTIONS_SELECTOR);
    const stickyHeader = document.querySelector(STICKY_HEADER_ACTIONS_SELECTOR);

    if (!mainHeader && !stickyHeader) {
      console.log(`[GitHub Bookmarked Issues] [${timestamp}ms] No header actions found`);
      return;
    }

    // Check if already bookmarked (only once for both buttons)
    const bookmarked = await isBookmarked(issueData.id);

    // Insert into main header if available
    if (mainHeader) {
      insertButtonIntoContainer(mainHeader, bookmarked, 'main header');
    }

    // Insert into sticky header if available
    if (stickyHeader) {
      insertButtonIntoContainer(stickyHeader, bookmarked, 'sticky header');
    }
  }

  // Track current URL to detect navigation
  let currentUrl = location.href;
  let navigationTimeout = null;

  // Setup observer to handle SPA navigation by watching DOM changes
  function setupNavigationObserver() {
    // Watch for DOM changes - observe body to catch all navigation
    // (observing <main> fails when <main> itself is replaced during navigation)
    const observer = new MutationObserver(() => {
      const newUrl = location.href;
      if (newUrl !== currentUrl) {
        currentUrl = newUrl;
        console.log('[GitHub Bookmarked Issues] Navigation detected:', currentUrl);

        // Debounce: clear any pending timeout and set a new one
        if (navigationTimeout) {
          clearTimeout(navigationTimeout);
        }

        // Wait for React to finish rendering
        navigationTimeout = setTimeout(() => {
          insertBookmarkButton();
          navigationTimeout = null;
        }, 50);
      }
    });

    // Observe body to catch navigation even when <main> is replaced
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    console.log('[GitHub Bookmarked Issues] Navigation observer started on body');

    // Also handle popstate (back/forward buttons)
    window.addEventListener('popstate', () => {
      if (navigationTimeout) {
        clearTimeout(navigationTimeout);
      }
      navigationTimeout = setTimeout(() => {
        insertBookmarkButton();
        navigationTimeout = null;
      }, 50);
    });
  }

  // Initialize when page loads
  function init() {
    const timestamp = performance.now().toFixed(1);
    console.log(`[GitHub Bookmarked Issues] [${timestamp}ms] init() readyState: ${document.readyState}, URL: ${location.pathname}`);
    setupIconTemplates();

    // Initial button insertion
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        insertBookmarkButton();
        setupNavigationObserver();
      });
    } else {
      insertBookmarkButton();
      setupNavigationObserver();
    }
  }

  // Start
  init();
})();
