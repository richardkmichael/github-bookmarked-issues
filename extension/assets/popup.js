// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Popup script to display bookmarked issues

// Fetch issue details from GitHub API
async function fetchIssueDetails(owner, repo, number, type) {
  const endpoint = type === 'pull'
    ? `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`
    : `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Popup] Error fetching issue details:', error);
    return null;
  }
}

// Display storage information
async function displayStorageInfo() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_STORAGE_INFO' });

    const storageInfoEl = document.getElementById('storage-info');
    if (response.error) {
      storageInfoEl.textContent = 'Storage info unavailable';
      return;
    }

    storageInfoEl.textContent = `${response.count} bookmarks • ${response.percentUsed}% of storage used`;

    if (response.percentUsed > 90) {
      storageInfoEl.style.color = '#cf222e';
      storageInfoEl.textContent += ' ⚠️ Approaching limit!';
    }
  } catch (error) {
    console.error('[Popup] Error displaying storage info:', error);
  }
}

// Display issues in the popup
async function displayIssues(bookmarks) {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const containerEl = document.getElementById('issues-container');
  const emptyStateEl = document.getElementById('empty-state');

  const bookmarkIds = Object.keys(bookmarks);
  const copyAllBtn = document.getElementById('copy-all-btn');

  if (bookmarkIds.length === 0) {
    loadingEl.style.display = 'none';
    emptyStateEl.style.display = 'block';
    copyAllBtn.disabled = true;
    return;
  }

  // Fetch details for all bookmarked issues
  const issuePromises = bookmarkIds.map(id => {
    const bookmark = bookmarks[id];
    return fetchIssueDetails(bookmark.owner, bookmark.repo, bookmark.number, bookmark.type);
  });

  const issues = await Promise.all(issuePromises);
  const validIssues = issues.filter(issue => issue !== null);

  loadingEl.style.display = 'none';

  if (validIssues.length === 0) {
    emptyStateEl.style.display = 'block';
    copyAllBtn.disabled = true;
    return;
  }

  // Sort by updated date (most recent first)
  validIssues.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  containerEl.innerHTML = '';

  const openIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" color="var(--fgColor-open)"><path fill="currentColor" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"></path></svg>';
  const closedIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" color="var(--fgColor-done)"><path fill="currentColor" d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"></path><path fill="currentColor" d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"></path></svg>';
  const commentIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>';

  validIssues.forEach(issue => {
    const issueEl = document.createElement('div');
    issueEl.className = 'issue-item';

    const stateIcon = issue.state === 'open' ? openIcon : closedIcon;

    issueEl.innerHTML = `
      <div class="state-icon">
        ${stateIcon}
      </div>
      <div>
        <div class="issue-title">
          <a href="${issue.html_url}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(issue.title)}
          </a>
        </div>
        <div class="issue-meta">
          <span>${escapeHtml(issue.repository?.full_name || `${issue.url.split('/')[4]}/${issue.url.split('/')[5]}`)}</span>
          <span>#${issue.number}</span>
          <span>· Updated ${formatDate(issue.updated_at)}</span>
          ${issue.comments > 0 ? `<div class="comments"><span class="comments-icon">${commentIcon}</span>${issue.comments}</div>` : ''}
        </div>
      </div>
    `;

    // Make whole item clickable
    issueEl.addEventListener('click', (e) => {
      if (e.target.tagName !== 'A') {
        window.open(issue.html_url, '_blank');
      }
    });

    containerEl.appendChild(issueEl);
  });

  // Wire up copy-all button
  copyAllBtn.disabled = false;
  copyAllBtn.onclick = () => copyAllToClipboard(validIssues);
}

// Format date to relative time
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'just now';

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;

  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears}y ago`;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Escape square brackets in Markdown to prevent breaking link syntax
function escapeMarkdownBrackets(text) {
  return text.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

// Copy all bookmarked issues to clipboard as Markdown list
async function copyAllToClipboard(issues) {
  const markdown = issues
    .map(issue => `- [${escapeMarkdownBrackets(issue.title)}](${issue.html_url})`)
    .join('\n');

  try {
    await navigator.clipboard.writeText(markdown);

    // Show success feedback
    const button = document.getElementById('copy-all-btn');
    const clipboardIcon = document.getElementById('clipboard-icon');
    const checkIcon = document.getElementById('check-icon');

    button.classList.add('success');
    clipboardIcon.style.display = 'none';
    checkIcon.style.display = 'block';

    // Reset after 2 seconds
    setTimeout(() => {
      button.classList.remove('success');
      clipboardIcon.style.display = 'block';
      checkIcon.style.display = 'none';
    }, 2000);
  } catch (err) {
    console.error('[Popup] Failed to copy to clipboard:', err);
    showError('Failed to copy to clipboard');
  }
}

// Show error message
function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.className = 'error-message';
  errorEl.textContent = message;
  errorEl.style.display = 'block';

  document.getElementById('loading').style.display = 'none';
}

// Initialize popup
async function init() {
  try {
    // Display storage info
    await displayStorageInfo();

    // Get bookmarks from background script
    const response = await browser.runtime.sendMessage({ type: 'GET_BOOKMARKS' });

    if (response.error) {
      showError(response.error);
      return;
    }

    // Display issues
    await displayIssues(response.bookmarks);

  } catch (error) {
    console.error('[Popup] Error initializing:', error);
    showError('Failed to load bookmarked issues');
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
