// Import relative-time-element to register the custom element
import './vendor/relative-time-element.js';

// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Popup script to display bookmarked issues

// Fetch issue details via background script (uses PAT and caching)
async function fetchIssueDetails(owner, repo, number, type) {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'FETCH_ISSUE_DETAILS',
      data: { owner, repo, number, type }
    });

    if (!response.success) {
      if (response.error === 'RATE_LIMITED') {
        return { _rateLimited: true };
      }
      throw new Error(response.error);
    }

    // Attach metadata for UI handling
    const issue = response.data;
    issue._fromCache = response.fromCache;
    issue._fetchedAt = response.fetchedAt;
    return issue;
  } catch (error) {
    console.error('[Popup] Error fetching issue details:', error);
    return null;
  }
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
  const clearAllBtn = document.getElementById('clear-all-btn');

  if (bookmarkIds.length === 0) {
    loading.classList.add('d-none');
    emptyState.classList.remove('d-none');
    copyAllBtn.disabled = true;
    clearAllBtn.disabled = true;
    return;
  }

  // Fetch details for all bookmarked issues, preserving bookmark ID
  const issuePromises = bookmarkIds.map(async id => {
    const bookmark = bookmarks[id];
    const issue = await fetchIssueDetails(bookmark.owner, bookmark.repo, bookmark.number, bookmark.type);
    if (issue) {
      issue._bookmarkId = id;  // Attach bookmark ID for removal
    }
    return issue;
  });

  const issues = await Promise.all(issuePromises);

  // Check for rate limiting (any issue with _rateLimited flag)
  const rateLimitedCount = issues.filter(issue => issue && issue._rateLimited).length;
  const validIssues = issues.filter(issue => issue !== null && !issue._rateLimited);

  loading.classList.add('d-none');

  // Show rate limit warning if any issues couldn't be fetched
  if (rateLimitedCount > 0) {
    showRateLimitWarning(rateLimitedCount, validIssues.length);
  }

  if (validIssues.length === 0 && rateLimitedCount === 0) {
    emptyState.classList.remove('d-none');
    copyAllBtn.disabled = true;
    clearAllBtn.disabled = true;
    return;
  }

  if (validIssues.length === 0 && rateLimitedCount > 0) {
    // All issues rate limited with no cache - show error
    showRateLimitError(rateLimitedCount);
    copyAllBtn.disabled = true;
    clearAllBtn.disabled = true;
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
      comments.classList.remove('d-none');
      comments.querySelector('.comments-icon').appendChild(getIcon('comment'));
      comments.querySelector('.comments-count').textContent = issue.comments;
    }

    // Make whole item clickable
    const issueItem = item.querySelector('.issue-item');
    issueItem.addEventListener('click', (e) => {
      if (e.target.tagName !== 'A' && !e.target.closest('.remove-btn')) {
        window.open(issue.html_url, '_blank');
      }
    });

    // Add remove button functionality
    const removeBtn = item.querySelector('.remove-btn');
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      const issueId = issue._bookmarkId;

      try {
        await browser.runtime.sendMessage({
          type: 'UNBOOKMARK_ISSUE',
          data: { id: issueId }
        });

        // Remove from DOM
        issueItem.remove();

        // Update storage info
        await displayStorageInfo();

        // Check if list is now empty
        if (container.children.length === 0) {
          emptyState.classList.remove('d-none');
          copyAllBtn.disabled = true;
          clearAllBtn.disabled = true;
        }
      } catch (error) {
        console.error('[Popup] Error removing bookmark:', error);
      }
    });

    container.appendChild(item);
  });

  // Wire up copy-all button
  copyAllBtn.disabled = false;
  copyAllBtn.onclick = () => copyAllToClipboard(validIssues);

  // Enable clear-all button
  clearAllBtn.disabled = false;
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
    clipboardIcon.classList.add('d-none');
    checkIcon.classList.remove('d-none');

    // Reset after 2 seconds
    setTimeout(() => {
      button.classList.remove('success');
      clipboardIcon.classList.remove('d-none');
      checkIcon.classList.add('d-none');
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
  error.classList.remove('d-none');

  document.getElementById('loading').classList.add('d-none');
}

// Show rate limit warning (some issues loaded from cache, some couldn't be fetched)
function showRateLimitWarning(rateLimitedCount, cachedCount) {
  const warning = document.getElementById('rate-limit-warning');
  if (!warning) return;

  const message = warning.querySelector('.rate-limit-message');
  if (cachedCount > 0) {
    message.textContent = `${rateLimitedCount} issue(s) couldn't be loaded (rate limit). Showing ${cachedCount} from cache.`;
  } else {
    message.textContent = `${rateLimitedCount} issue(s) couldn't be loaded due to API rate limit.`;
  }

  warning.classList.remove('d-none');
}

// Show rate limit error (no issues could be loaded)
function showRateLimitError(count) {
  const error = document.getElementById('error');
  error.className = 'error-message rate-limit-error';
  error.innerHTML = '';

  const message = document.createElement('div');
  message.textContent = `Rate limit exceeded. ${count} bookmarked issue(s) couldn't be loaded.`;
  error.appendChild(message);

  const hint = document.createElement('div');
  hint.className = 'rate-limit-hint';
  hint.textContent = 'Add a GitHub token in Settings for higher rate limits (5,000/hour vs 60/hour).';
  error.appendChild(hint);

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'btn btn-small';
  settingsBtn.textContent = 'Open Settings';
  settingsBtn.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });
  error.appendChild(settingsBtn);

  error.classList.remove('d-none');
  document.getElementById('loading').classList.add('d-none');
}

// Store validated import data between paste and import
let pendingImport = null;


// Parse list items and extract GitHub issue URLs
// Returns { valid: [...bookmarkIds], invalid: number }
function parseImportText(text) {
  const valid = [];
  const seen = new Set();  // Track duplicates within paste
  let invalid = 0;

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Only process list items (- or *)
    if (!trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      continue;
    }

    // Extract any URL from this list item
    const urlMatch = trimmed.match(/https?:\/\/[^\s)]+/);
    if (!urlMatch) {
      invalid++;
      continue;
    }

    // Check if it's a valid GitHub issue URL
    const bookmarkId = getBookmarkIdFromUrl(urlMatch[0]);
    if (!bookmarkId) {
      invalid++;
      continue;
    }

    // Skip duplicates within paste
    if (seen.has(bookmarkId)) {
      continue;
    }
    seen.add(bookmarkId);
    valid.push(bookmarkId);
  }

  return { valid, invalid };
}

// Validate pasted text and categorize items
async function validateImportText(text) {
  const parsed = parseImportText(text);

  // Get existing bookmarks to identify duplicates
  const response = await browser.runtime.sendMessage({ type: 'GET_BOOKMARKS' });
  const existingIds = new Set(Object.keys(response.bookmarks || {}));

  const newItems = [];
  let duplicates = 0;

  for (const bookmarkId of parsed.valid) {
    if (existingIds.has(bookmarkId)) {
      duplicates++;
    } else {
      newItems.push(bookmarkId);
    }
  }

  return {
    valid: newItems,
    invalid: parsed.invalid,
    duplicates
  };
}

// Update the validation display below textarea
function updateValidationDisplay(validation) {
  const container = document.getElementById('import-validation');
  const submitBtn = document.getElementById('import-submit-btn');

  container.replaceChildren();

  // Only show if there's something to display
  if (validation.valid.length === 0 && validation.invalid === 0 && validation.duplicates === 0) {
    container.classList.add('d-none');
    submitBtn.disabled = true;
    return;
  }

  // Valid items (success - green)
  if (validation.valid.length > 0) {
    const item = document.createElement('span');
    item.className = 'import-validation-item color-fg-success d-inline-flex flex-items-center ml-3';
    const icon = getIcon('check-circle');
    icon.classList.add('mr-1');
    item.appendChild(icon);
    item.appendChild(document.createTextNode(`${validation.valid.length} valid`));
    container.appendChild(item);
  }

  // Duplicate items (info - blue)
  if (validation.duplicates > 0) {
    const item = document.createElement('span');
    item.className = 'import-validation-item color-fg-attention d-inline-flex flex-items-center ml-3';
    const icon = getIcon('info');
    icon.classList.add('mr-1');
    item.appendChild(icon);
    item.appendChild(document.createTextNode(`${validation.duplicates} duplicate (ignored)`));
    container.appendChild(item);
  }

  // Invalid items (danger - red)
  if (validation.invalid > 0) {
    const item = document.createElement('span');
    item.className = 'import-validation-item color-fg-danger d-inline-flex flex-items-center ml-3';
    const icon = getIcon('x-circle');
    icon.classList.add('mr-1');
    item.appendChild(icon);
    item.appendChild(document.createTextNode(`${validation.invalid} invalid`));
    container.appendChild(item);
  }

  container.classList.remove('d-none');
  submitBtn.disabled = validation.valid.length === 0;
}

// Import the pre-validated bookmarks
async function importValidatedBookmarks() {
  if (!pendingImport || pendingImport.valid.length === 0) {
    return { added: 0 };
  }

  let added = 0;
  for (const bookmarkId of pendingImport.valid) {
    const data = parseBookmarkId(bookmarkId);
    data.id = bookmarkId;
    data.bookmarkedAt = Date.now();

    await browser.runtime.sendMessage({
      type: 'BOOKMARK_ISSUE',
      data
    });
    added++;
  }

  return { added };
}

// Show import section, hide issue list
function showImportSection() {
  document.getElementById('import-section').classList.remove('d-none');
  document.getElementById('issues-container').classList.add('d-none');
  document.getElementById('empty-state').classList.add('d-none');
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-validation').classList.add('d-none');
  const submitBtn = document.getElementById('import-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Import';
  pendingImport = null;
  document.getElementById('import-textarea').focus();
}

// Hide import section, show issue list
function hideImportSection() {
  document.getElementById('import-section').classList.add('d-none');
  document.getElementById('issues-container').classList.remove('d-none');
}

// Wire up clear-all button
function setupClearAllUI() {
  const clearAllBtn = document.getElementById('clear-all-btn');

  clearAllBtn.addEventListener('click', async () => {
    await browser.runtime.sendMessage({ type: 'CLEAR_ALL_BOOKMARKS' });

    // Clear the list and show empty state
    document.getElementById('issues-container').replaceChildren();
    document.getElementById('empty-state').classList.remove('d-none');
    document.getElementById('copy-all-btn').disabled = true;
    clearAllBtn.disabled = true;

    // Update storage info
    await displayStorageInfo();
  });
}

// Wire up import UI
function setupImportUI() {
  const importBtn = document.getElementById('import-btn');
  const importSubmitBtn = document.getElementById('import-submit-btn');
  const importCancelBtn = document.getElementById('import-cancel-btn');
  const importTextarea = document.getElementById('import-textarea');

  importBtn.addEventListener('click', showImportSection);

  // Validate on paste
  importTextarea.addEventListener('paste', async (e) => {
    // Wait for paste to complete
    setTimeout(async () => {
      const text = importTextarea.value.trim();
      if (!text) {
        pendingImport = null;
        updateValidationDisplay({ valid: [], invalid: 0, duplicates: 0 });
        return;
      }

      pendingImport = await validateImportText(text);
      updateValidationDisplay(pendingImport);
    }, 0);
  });

  // Also validate on input (for manual typing or edits)
  importTextarea.addEventListener('input', async () => {
    const text = importTextarea.value.trim();
    if (!text) {
      pendingImport = null;
      updateValidationDisplay({ valid: [], invalid: 0, duplicates: 0 });
      return;
    }

    pendingImport = await validateImportText(text);
    updateValidationDisplay(pendingImport);
  });

  importCancelBtn.addEventListener('click', async () => {
    hideImportSection();
    document.getElementById('loading').classList.remove('d-none');
    const response = await browser.runtime.sendMessage({ type: 'GET_BOOKMARKS' });
    await displayIssues(response.bookmarks);
  });

  importSubmitBtn.addEventListener('click', async () => {
    if (!pendingImport || pendingImport.valid.length === 0) {
      return;
    }

    importSubmitBtn.disabled = true;
    importSubmitBtn.textContent = 'Importing...';

    try {
      const results = await importValidatedBookmarks();

      if (results.added > 0) {
        importSubmitBtn.textContent = `${results.added} imported`;

        // Brief delay to show success, then refresh
        setTimeout(async () => {
          hideImportSection();
          document.getElementById('loading').classList.remove('d-none');
          await displayStorageInfo();
          const response = await browser.runtime.sendMessage({ type: 'GET_BOOKMARKS' });
          await displayIssues(response.bookmarks);
        }, 500);
      }
    } catch {
      // Reset button on error
      importSubmitBtn.disabled = false;
      importSubmitBtn.textContent = 'Import';
    }
  });
}

// Initialize popup
async function init() {
  try {
    // Wire up clear-all UI
    setupClearAllUI();

    // Wire up import UI
    setupImportUI();

    // Wire up settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
      browser.runtime.openOptionsPage();
    });

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
