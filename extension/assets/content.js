// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Content script to capture subscribe/unsubscribe actions on GitHub issues and PRs

(function() {
  'use strict';

  // Selector for GitHub's subscribe/unsubscribe button
  const SUBSCRIBE_BUTTON_SELECTOR = 'button[aria-describedby*="subscription-description"]';

  // Extract issue/PR data from current page
  function getIssueData() {
    const urlMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/);

    if (!urlMatch) {
      return null;
    }

    const [, owner, repo, type, number] = urlMatch;
    const titleElement = document.querySelector('.js-issue-title, h1.gh-header-title');
    const title = titleElement ? titleElement.textContent.trim() : '';

    return {
      id: `${owner}/${repo}/${type}/${number}`,
      owner,
      repo,
      type,
      number: parseInt(number, 10),
      title,
      url: window.location.href,
      subscribedAt: Date.now()
    };
  }

  // Handle subscribe button click
  async function handleSubscribeClick(button) {
    const issueData = getIssueData();
    if (!issueData) {
      return;
    }

    const buttonText = button.textContent.trim();
    const action = buttonText === 'Subscribe' ? 'subscribe' : 'unsubscribe';

    console.log(`[GitHub Subscribed Issues] ${action === 'subscribe' ? 'Subscribing to' : 'Unsubscribing from'}:`, issueData.id);

    // Wait a moment for GitHub to process the action
    setTimeout(async () => {
      try {
        if (action === 'subscribe') {
          await browser.runtime.sendMessage({
            type: 'SUBSCRIBE_ISSUE',
            data: issueData
          });
          console.log('[GitHub Subscribed Issues] Stored subscription');
        } else {
          await browser.runtime.sendMessage({
            type: 'UNSUBSCRIBE_ISSUE',
            data: { id: issueData.id }
          });
          console.log('[GitHub Subscribed Issues] Removed subscription');
        }
      } catch (error) {
        console.error(`[GitHub Subscribed Issues] Failed to ${action}:`, error);
      }
    }, 500);
  }

  // Monitor for subscribe/unsubscribe button clicks
  let clickListenerAdded = false;

  function monitorSubscribeButton() {
    const issueData = getIssueData();
    if (!issueData) {
      console.log('[GitHub Subscribed Issues] Not on an issue/PR page');
      return;
    }

    console.log('[GitHub Subscribed Issues] Monitoring issue:', issueData.id);

    // Only add click listener once
    if (!clickListenerAdded) {
      document.addEventListener('click', (event) => {
        const button = event.target.closest(SUBSCRIBE_BUTTON_SELECTOR);

        if (button) {
          console.log('[GitHub Subscribed Issues] Subscribe button clicked:', button.textContent.trim());
          handleSubscribeClick(button);
        }
      }, true); // Use capture phase

      clickListenerAdded = true;
      console.log('[GitHub Subscribed Issues] Click listener added');
    }
  }

  // Initialize when page loads
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', monitorSubscribeButton);
    } else {
      monitorSubscribeButton();
    }
  }

  // Handle Turbo navigation (GitHub's SPA navigation)
  document.addEventListener('turbo:render', () => {
    console.log('[GitHub Subscribed Issues] Turbo navigation detected, re-initializing');
    monitorSubscribeButton();
  });

  // Start monitoring
  init();
})();
