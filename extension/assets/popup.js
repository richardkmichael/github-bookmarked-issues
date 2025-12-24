// Import relative-time-element to register the custom element
import './vendor/relative-time-element.js';

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

// Get icon from template
function getIcon(name) {
  const template = document.getElementById(`icon-${name}`);
  return template.content.cloneNode(true).firstChild;
}

// Display storage information
async function displayStorageInfo() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_STORAGE_INFO' });

    const storageInfo = document.getElementById('storage-info');
    if (response.error) {
      storageInfo.textContent = 'Storage info unavailable';
      return;
    }

    storageInfo.textContent = `${response.count} bookmarks • ${response.percentUsed}% of storage used`;

    if (response.percentUsed > 90) {
      storageInfo.style.color = '#cf222e';
      storageInfo.textContent += ' ⚠️ Approaching limit!';
    }
  } catch (error) {
    console.error('[Popup] Error displaying storage info:', error);
  }
}

// Display issues in the popup
async function displayIssues(bookmarks) {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const container = document.getElementById('issues-container');
  const emptyState = document.getElementById('empty-state');

  const bookmarkIds = Object.keys(bookmarks);
  const copyAllBtn = document.getElementById('copy-all-btn');

  if (bookmarkIds.length === 0) {
    loading.style.display = 'none';
    emptyState.style.display = 'block';
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

  loading.style.display = 'none';

  if (validIssues.length === 0) {
    emptyState.style.display = 'block';
    copyAllBtn.disabled = true;
    return;
  }

  // Sort by updated date (most recent first)
  validIssues.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  container.replaceChildren();

  validIssues.forEach(issue => {
    const template = document.getElementById('issue-item');
    const item = template.content.cloneNode(true);

    // Populate state icon
    const stateIcon = item.querySelector('.state-icon');
    stateIcon.appendChild(getIcon(issue.state === 'open' ? 'open' : 'closed'));

    // Populate link
    const link = item.querySelector('a');
    link.href = issue.html_url;
    link.textContent = issue.title;

    // Populate metadata
    const repoName = issue.repository?.full_name || `${issue.url.split('/')[4]}/${issue.url.split('/')[5]}`;
    item.querySelector('.repo-name').textContent = repoName;
    item.querySelector('.issue-number').textContent = `#${issue.number}`;

    const relTime = item.querySelector('relative-time');
    relTime.setAttribute('datetime', issue.updated_at);
    relTime.textContent = formatDate(issue.updated_at);

    // Handle comments
    if (issue.comments > 0) {
      const comments = item.querySelector('.comments');
      comments.style.display = '';
      comments.querySelector('.comments-icon').appendChild(getIcon('comment'));
      comments.querySelector('.comments-count').textContent = issue.comments;
    }

    // Make whole item clickable
    const issueItem = item.querySelector('.issue-item');
    issueItem.addEventListener('click', (e) => {
      if (e.target.tagName !== 'A') {
        window.open(issue.html_url, '_blank');
      }
    });

    container.appendChild(item);
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
  const error = document.getElementById('error');
  error.className = 'error-message';
  error.textContent = message;
  error.style.display = 'block';

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
