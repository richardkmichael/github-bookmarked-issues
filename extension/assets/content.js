// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Content script to add bookmark button to GitHub issue/PR pages

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

  // Get icon from template
  function getIcon(name) {
    const template = document.getElementById(`icon-${name}`);
    return template.content.cloneNode(true).firstChild;
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

  // Extension button marker
  const BOOKMARK_BUTTON_ATTR = 'data-extension-bookmark';

  // Extract issue/PR data from current page
  function getIssueData() {
    const urlMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/);

    if (!urlMatch) {
      return null;
    }

    const [, owner, repo, type, number] = urlMatch;
    const issueTitle = document.querySelector('.js-issue-title, h1.gh-header-title');
    const title = issueTitle ? issueTitle.textContent.trim() : '';

    return {
      id: `${owner}/${repo}/${type}/${number}`,
      owner,
      repo,
      type,
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

  // Handle bookmark button click
  async function handleBookmarkClick(button) {
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
        updateBookmarkButton(button, false);
      } else {
        // Add bookmark
        await browser.runtime.sendMessage({
          type: 'BOOKMARK_ISSUE',
          data: issueData
        });
        console.log('[GitHub Bookmarked Issues] Added bookmark:', issueData.id);
        updateBookmarkButton(button, true);
      }
    } catch (error) {
      console.error('[GitHub Bookmarked Issues] Failed to toggle bookmark:', error);
      showErrorNotification('Failed to update bookmark. Please try again.');
    }
  }

  // Create and insert bookmark button
  async function insertBookmarkButton() {
    const issueData = getIssueData();
    if (!issueData) {
      console.log('[GitHub Bookmarked Issues] Not on an issue/PR page');
      return;
    }

    const actionsContainer = document.querySelector(HEADER_ACTIONS_SELECTOR);
    if (!actionsContainer) {
      console.log('[GitHub Bookmarked Issues] Header actions not found');
      return;
    }

    // Check if button already exists
    if (document.querySelector(`[${BOOKMARK_BUTTON_ATTR}]`)) {
      console.log('[GitHub Bookmarked Issues] Bookmark button already exists');
      return;
    }

    // Create bookmark button
    const bookmarkButton = document.createElement('button');
    bookmarkButton.setAttribute('data-component', 'IconButton');
    bookmarkButton.setAttribute('type', 'button');
    bookmarkButton.className = 'prc-Button-ButtonBase-c50BI prc-Button-IconButton-szpyj';
    bookmarkButton.setAttribute('data-loading', 'false');
    bookmarkButton.setAttribute('data-no-visuals', 'true');
    bookmarkButton.setAttribute('data-size', 'medium');
    bookmarkButton.setAttribute('data-variant', 'invisible');
    bookmarkButton.setAttribute(BOOKMARK_BUTTON_ATTR, 'true');

    // Add inline styles to match GitHub's native icon buttons
    bookmarkButton.style.cssText = `
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

    // Check if already bookmarked and set initial state
    const bookmarked = await isBookmarked(issueData.id);
    updateBookmarkButton(bookmarkButton, bookmarked);

    // Add click handler
    bookmarkButton.addEventListener('click', () => handleBookmarkClick(bookmarkButton));

    // Insert as last child in header actions
    actionsContainer.appendChild(bookmarkButton);

    console.log('[GitHub Bookmarked Issues] Bookmark button added');
  }

  // Initialize when page loads
  function init() {
    console.log(`[GitHub Bookmarked Issues] init() readyState: ${document.readyState}`);
    setupIconTemplates();
    if (document.readyState === 'loading') {
      // FIXME: Button is not inserted on navigation to a new issue page, but will be added if that
      // page is *reloaded*.  So, SPA application problem?  Use a different event?
      document.addEventListener('DOMContentLoaded', insertBookmarkButton);
    } else {
      insertBookmarkButton();
    }
  }

  // FIXME: This isn't working and no log output, maybe SPA is not `turbo:render`? Investigate refined-github's method.
  // Handle Turbo navigation (GitHub's SPA navigation)
  document.addEventListener('turbo:render', () => {
    console.log('[GitHub Bookmarked Issues] Turbo navigation detected, re-initializing');
    insertBookmarkButton();
  });

  // Start
  init();
})();
