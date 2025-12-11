// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Popup script to display subscribed issues

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

    storageInfoEl.textContent = `${response.count} subscriptions • ${response.percentUsed}% of storage used`;

    if (response.percentUsed > 90) {
      storageInfoEl.style.color = '#cf222e';
      storageInfoEl.textContent += ' ⚠️ Approaching limit!';
    }
  } catch (error) {
    console.error('[Popup] Error displaying storage info:', error);
  }
}

// Display issues in the popup
async function displayIssues(subscriptions) {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const containerEl = document.getElementById('issues-container');
  const emptyStateEl = document.getElementById('empty-state');

  const subscriptionIds = Object.keys(subscriptions);

  if (subscriptionIds.length === 0) {
    loadingEl.style.display = 'none';
    emptyStateEl.style.display = 'block';
    return;
  }

  // Fetch details for all subscribed issues
  const issuePromises = subscriptionIds.map(id => {
    const sub = subscriptions[id];
    return fetchIssueDetails(sub.owner, sub.repo, sub.number, sub.type);
  });

  const issues = await Promise.all(issuePromises);
  const validIssues = issues.filter(issue => issue !== null);

  loadingEl.style.display = 'none';

  if (validIssues.length === 0) {
    emptyStateEl.style.display = 'block';
    return;
  }

  // Sort by updated date (most recent first)
  validIssues.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  containerEl.innerHTML = '';

  validIssues.forEach(issue => {
    const issueEl = document.createElement('div');
    issueEl.className = 'issue-item';

    const stateIcon = issue.state === 'open' ? '●' : '✓';
    const stateColor = issue.state === 'open' ? '#1a7f37' : '#8250df';

    issueEl.innerHTML = `
      <div class="issue-title">
        <a href="${issue.html_url}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(issue.title)}
        </a>
      </div>
      <div class="issue-meta">
        <span>${escapeHtml(issue.repository?.full_name || `${issue.url.split('/')[4]}/${issue.url.split('/')[5]}`)}</span>
        <span>#${issue.number}</span>
        <span style="color: ${stateColor}">${stateIcon} ${issue.state}</span>
        <span>Updated ${formatDate(issue.updated_at)}</span>
        ${issue.comments > 0 ? `<span>💬 ${issue.comments}</span>` : ''}
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

    // Get subscriptions from background script
    const response = await browser.runtime.sendMessage({ type: 'GET_SUBSCRIPTIONS' });

    if (response.error) {
      showError(response.error);
      return;
    }

    // Display issues
    await displayIssues(response.subscriptions);

  } catch (error) {
    console.error('[Popup] Error initializing:', error);
    showError('Failed to load subscribed issues');
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
