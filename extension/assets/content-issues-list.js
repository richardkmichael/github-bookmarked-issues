// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Content script for GitHub /issues pages
// Phase 1: Test whether React removes custom nav item

// Reference to our injected nav item
let bookmarkNavItem = null;

// Inject the "Bookmarks" navigation item into the sidebar
function injectSidebarNavItem() {
  const navList = document.querySelector('nav[aria-label="Default views"] ul');
  if (!navList) {
    console.warn('[Bookmarks] Sidebar nav list not found');
    return false;
  }

  // Check if already exists
  if (document.querySelector('li[data-extension-bookmarks-nav="true"]')) {
    return true;
  }

  // Create bookmark nav item with exact structure from application-main.html
  const li = document.createElement('li');
  li.className = 'prc-ActionList-ActionListItem-uq6I7 SavedViewItem-module__navItem--_X9cB';
  li.setAttribute('data-has-description', 'false');
  li.setAttribute('data-extension-bookmarks-nav', 'true');

  const link = document.createElement('a');
  link.className = 'prc-ActionList-ActionListContent-sg9-x prc-Link-Link-85e08';
  link.setAttribute('tabindex', '0');
  link.setAttribute('data-size', 'medium');
  link.href = '/issues/bookmarks';
  link.style.setProperty('--subitem-depth', '0');

  // Navigate to bookmarks view using History API (no React routing)
  link.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    history.pushState(null, null, '/issues/bookmarks');
    showBookmarksView();
    activateBookmarksNavItem();
  });

  // Create inner structure
  const spacer = document.createElement('span');
  spacer.className = 'prc-ActionList-Spacer-dydlX';

  const subContent = document.createElement('span');
  subContent.className = 'prc-ActionList-ActionListSubContent-lP9xj';
  subContent.setAttribute('data-component', 'ActionList.Item--DividerContainer');

  const label = document.createElement('span');
  label.className = 'prc-ActionList-ItemLabel-TmBhn';

  const itemText = document.createElement('div');
  itemText.className = 'SavedViewItem-module__itemText--MKHIQ';

  const icon = document.createElement('div');
  icon.className = 'SavedViewItem-module__icon--XK10s';
  icon.setAttribute('data-color', 'gray');
  // Bookmark SVG from content.js
  icon.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" display="inline-block" overflow="visible" style="vertical-align: text-bottom;" class="octicon octicon-bookmark"><path d="M3 2.75C3 1.784 3.784 1 4.75 1h6.5c.966 0 1.75.784 1.75 1.75v11.5a.75.75 0 0 1-1.227.579L8 11.722l-3.773 3.107A.751.751 0 0 1 3 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.91l3.023-2.489a.75.75 0 0 1 .954 0l3.023 2.49V2.75a.25.25 0 0 0-.25-.25Z"></path></svg>';

  const text = document.createElement('span');
  text.className = 'SavedViewItem-module__truncatedItemText--Pkqut';
  text.textContent = 'Bookmarks';

  // Assemble structure
  itemText.appendChild(icon);
  itemText.appendChild(text);
  label.appendChild(itemText);
  subContent.appendChild(label);
  link.appendChild(spacer);
  link.appendChild(subContent);
  li.appendChild(link);

  // Append to nav list
  navList.appendChild(li);
  bookmarkNavItem = li;

  console.log('[Bookmarks] Nav item injected with proper structure');
  return true;
}

// Activate the bookmarks nav item and deactivate React's currently active item
function activateBookmarksNavItem() {
  // Deactivate React's currently active nav item
  const activeNavItem = document.querySelector('nav[aria-label="Default views"] li[data-active="true"]');
  if (activeNavItem) {
    activeNavItem.removeAttribute('data-active');
    const activeLink = activeNavItem.querySelector('a[aria-current="page"]');
    if (activeLink) {
      activeLink.removeAttribute('aria-current');
    }
  }

  // Activate our Bookmarks nav item
  const bookmarksNavItem = document.querySelector('li[data-extension-bookmarks-nav="true"]');
  if (bookmarksNavItem) {
    bookmarksNavItem.setAttribute('data-active', 'true');
    const bookmarksLink = bookmarksNavItem.querySelector('a');
    if (bookmarksLink) {
      bookmarksLink.setAttribute('aria-current', 'page');
    }
  }
}

// Deactivate the bookmarks nav item (React will re-establish its own active state)
function deactivateBookmarksNavItem() {
  const bookmarksNavItem = document.querySelector('li[data-extension-bookmarks-nav="true"]');
  if (bookmarksNavItem) {
    bookmarksNavItem.removeAttribute('data-active');
    const bookmarksLink = bookmarksNavItem.querySelector('a');
    if (bookmarksLink) {
      bookmarksLink.removeAttribute('aria-current');
    }
  }
}

// Setup stable observer on permanent DOM element
function setupStableObserver() {
  const STABLE_PARENT_SELECTOR = 'div.application-main';
  const TARGET_NAV_SELECTOR = 'nav[aria-labelledby="sidebar-title"]';

  const stableParent = document.querySelector(STABLE_PARENT_SELECTOR);
  if (!stableParent) {
    console.warn('[Bookmarks] Stable parent not found');
    return;
  }

  const observer = new MutationObserver(() => {
    requestAnimationFrame(() => {
      // Simple check: Is the bookmarks nav item present?
      const bookmarkNavItem = document.querySelector('li[data-extension-bookmarks-nav="true"]');
      if (!bookmarkNavItem) {
        // If bookmarks nav item is missing, re-inject it
        const navList = document.querySelector('nav[aria-label="Default views"] ul');
        if (navList) {
          injectSidebarNavItem();
        }
      }
    });
  });

  // Watch for all types of mutations
  observer.observe(stableParent, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });

  console.log('[Bookmarks] Stable observer started on', STABLE_PARENT_SELECTOR);

  // Initial setup with requestAnimationFrame
  requestAnimationFrame(() => {
    const navList = document.querySelector('nav[aria-label="Default views"] ul');
    if (navList && !document.querySelector('li[data-extension-bookmarks-nav="true"]')) {
      injectSidebarNavItem();
    }
    if (isBookmarksViewActive()) {
      showBookmarksView();
    }
  });
}

// Utility functions from popup.js
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
    console.error('[Bookmarks] Error fetching issue details:', error);
    return null;
  }
}

// Create a bookmarks view container with GitHub's native structure
function createBookmarksView() {
  const container = document.createElement('div');
  container.setAttribute('data-extension-bookmarks-container', 'true');
  container.style.cssText = 'display: none;';

  // Main content wrapper matching GitHub's structure
  container.innerHTML = `
    <div class="prc-PageLayout-ContentWrapper-b-QRo" data-is-hidden="false">
      <div class="prc-PageLayout-Content--F7-I" data-width="full" style="--spacing: var(--spacing-none);">
        <div class="ThreePanesLayout-module__ThreePanesLayoutMiddleOnlyPane--uNVJC">
          <div class="Box-sc-62in7e-0 pKvlx">
            <div data-testid="list-header">
              <div class="Header-module__HeaderListContainer--KyKxD">
                <div class="HeaderContent-module__HeaderContentContainer--VW7Bw">
                  <div class="HeaderContent-module__displayModeContainer--cJT14">
                    <span class="HeaderContent-module__titleOptionsRow--hPAtk">
                      <h1 class="HeaderContent-module__Heading--uCBAw prc-Heading-Heading-6CmGO">Bookmarks</h1>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="Search-module__SearchContainer--CkrWX">
              <div class="SearchBar-module__gap8--tZi0W px-0 d-block flex-row flex-justify-between">
                <div class="SearchBar-module__filterContainer--XzLet SearchBar-module__gap8--tZi0W d-flex flex-row flex-1 flexWrap min-width-0">
                  <div class="SearchBar-module__filter--uooUm d-flex flex-1 flex-column">
                    <div class="FormControl FormControl--fullWidth">
                      <label for="bookmarks-filter" class="FormControl-label sr-only">Filter bookmarks</label>
                      <input type="text" id="bookmarks-filter" class="FormControl-input Input-module__Box_4--DZrl_" placeholder="Filter by issue title..." autocomplete="off">
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div class="ListItems-module__listContainer--sgptj">
                  <div class="ListItems-module__listScopedCommand--GGPXX">
                    <div id="bookmarks-list-container" class="ListView-module__container--rxCWy">
                      <h2 class="sr-only prc-Heading-Heading-6CmGO">Bookmarked issues</h2>
                      <div id="bookmarks-results-section" class="Metadata-module__container--ydeM8 ListItemsHeaderWithoutBulkActions-module__ListViewMetadata_0--oA0Cm" style="display: none;">
                        <h3 id="bookmarks-count" class="Metadata-module__heading--vvkcl"></h3>
                        <div role="toolbar" aria-label="Actions" class="VisibleAndOverflowContainer-module__Box_0--KyT2b" style="gap: var(--base-size-4);">
                          <div class="VisibleItems-module__Box_1--LOtDr" style="gap: var(--base-size-4);">
                            <div data-action-bar-item="spinner" class="VisibleItem-module__Box_0--BsJkb"></div>
                          </div>
                        </div>
                      </div>
                      <ul id="bookmarks-list" class="ListView-module__ul--A_8jF" role="list" data-listview-component="items-list" data-density="default" tabindex="-1" aria-labelledby="bookmarks-list-container"></ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div id="bookmarks-loading" style="padding: 40px 20px; text-align: center; color: var(--fgColor-muted); display: none;">
              Loading bookmarks...
            </div>
            <div id="bookmarks-error" style="padding: 16px; color: #cf222e; background-color: #ffebe9; border: 1px solid #ff8182; border-radius: 6px; margin: 16px; display: none;"></div>
            <div id="bookmarks-empty" style="padding: 40px 20px; text-align: center; color: var(--fgColor-muted); display: none;">
              <div style="font-size: 14px; margin-bottom: 8px;">No bookmarked issues yet</div>
              <div style="font-size: 12px;">Visit any issue page and click the bookmark button to get started</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  return container;
}

// Get bookmarks from storage
async function getBookmarks() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_BOOKMARKS' });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.bookmarks || {};
  } catch (error) {
    console.error('[Bookmarks] Error getting bookmarks:', error);
    throw error;
  }
}

// Render a single issue item with GitHub styling matching application-main.html structure
function renderIssueItem(issue) {
  // Extract repo name
  let repoName = issue.repository?.full_name;
  if (!repoName && issue.html_url) {
    const match = issue.html_url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)/);
    if (match) repoName = `${match[1]}/${match[2]}`;
  }
  repoName = repoName || 'unknown/repository';

  const isOpen = issue.state === 'open';

  // Create wrapper structure matching application-main.html
  const wrapper = document.createElement('div');
  wrapper.className = 'ListItems-module__listItem--KRcR0';

  const row = document.createElement('div');
  row.className = 'IssueRow-module__row--pHXv5';

  const li = document.createElement('li');
  li.className = 'ListItem-module__listItem--k4eMk';
  li.setAttribute('role', 'listitem');
  li.setAttribute('tabindex', '0');
  li.setAttribute('data-issue-id', `${repoName}#${issue.number}`);

  // Title section
  const titleContainer = document.createElement('div');
  titleContainer.className = 'Title-module__container--XD9YG';
  titleContainer.setAttribute('data-listview-item-title-container', 'true');

  const heading = document.createElement('h4');
  heading.className = 'Title-module__heading--s7YnL IssuePullRequestTitle-module__ListItemTitle_0--ORbH2';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'Text__StyledText-sc-1klmep6-0 prc-Text-Text-0ima0';

  const titleLink = document.createElement('a');
  titleLink.href = issue.html_url;
  titleLink.className = 'IssuePullRequestTitle-module__ListItemTitle_1--FWLq8';
  titleLink.setAttribute('data-testid', 'issue-pr-title-link');
  titleLink.setAttribute('tabindex', '-1');
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = issue.title;

  titleSpan.appendChild(titleLink);
  heading.appendChild(titleSpan);
  titleContainer.appendChild(heading);

  // Leading content (status icon)
  const leadingContent = document.createElement('div');
  leadingContent.className = 'LeadingContent-module__container--cui6v IssueItem-module__leadingContent--s16iU';
  leadingContent.innerHTML = `
    <div class="LeadingVisual-module__outer--qS9Ac" data-testid="list-row-state-icon" style="margin-top: 14px;">
      <div>
        <div class="LeadingVisual-module__inner--GeEeG" style="width: 16px; height: 16px;">
          <svg color="${isOpen ? 'var(--fgColor-open)' : 'var(--fgColor-done)'}"
               aria-hidden="true" focusable="false"
               class="octicon octicon-issue-${isOpen ? 'opened' : 'closed'}"
               viewBox="0 0 16 16" width="16" height="16" fill="currentColor"
               style="vertical-align: text-bottom;">
            ${isOpen
              ? '<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"></path>'
              : '<path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"></path><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"></path>'
            }
          </svg>
          <span class="sr-only">Status: ${isOpen ? 'Open' : 'Closed'}.</span>
        </div>
      </div>
    </div>
  `;

  // Main content section
  const mainContent = document.createElement('div');
  mainContent.className = 'MainContent-module__container--NyRpm';

  const mainInner = document.createElement('div');
  mainInner.className = 'MainContent-module__inner--qD0Pb';

  const description = document.createElement('div');
  description.className = 'Description-module__container--Zwqe8';

  const descItem = document.createElement('div');
  descItem.className = 'DescriptionItem-module__default--rAYpS IssuePullRequestDescription-module__descriptionItem--ndXf0';
  descItem.setAttribute('data-testid', 'list-row-repo-name-and-number');

  // Repo and number
  const repoContainer = document.createElement('div');
  repoContainer.className = 'IssueItem-module__defaultRepoContainer--oNwmq';
  repoContainer.innerHTML = `<span>${escapeHtml(repoName)}</span>`;

  const numberDesc = document.createElement('span');
  numberDesc.className = 'IssueItem-module__defaultNumberDescription--_0xgU';
  numberDesc.innerHTML = `<span>#${issue.number}</span>&nbsp;`;

  // Created timestamp
  const createdContainer = document.createElement('div');
  createdContainer.className = 'IssueItem-module__timestampContainer--koCC8';
  createdContainer.setAttribute('data-testid', 'created-at');
  createdContainer.innerHTML = `
    <span>· </span>
    <a class="IssueItem-module__authorCreatedLink--kzskP prc-Link-Link-85e08"
       href="${issue.user?.html_url || '#'}" tabindex="-1" target="_blank" rel="noopener noreferrer">
      ${escapeHtml(issue.user?.login || 'unknown')}
    </a>
    <span> opened </span>
    <relative-time datetime="${issue.created_at}">${formatDate(issue.created_at)}</relative-time>
  `;

  // Updated timestamp
  const updatedContainer = document.createElement('div');
  updatedContainer.className = 'IssueItem-module__timestampContainer--koCC8';
  updatedContainer.setAttribute('data-testid', 'updated-at');
  updatedContainer.innerHTML = `
    · Updated
    <relative-time class="IssuePullRequestDescription-module__RelativeTime--lbeGP"
                   datetime="${issue.updated_at}">${formatDate(issue.updated_at)}</relative-time>
  `;

  descItem.appendChild(repoContainer);
  descItem.appendChild(numberDesc);
  descItem.appendChild(createdContainer);
  descItem.appendChild(updatedContainer);
  description.appendChild(descItem);
  mainInner.appendChild(description);
  mainContent.appendChild(mainInner);

  // Metadata section (comments)
  const metadataContainer = document.createElement('div');
  metadataContainer.className = 'MetadataContainer-module__container--nU0s9 IssueItem-module__ListItem_0--ni8FY';

  const commentMetadata = document.createElement('div');
  commentMetadata.className = 'Metadata-module__metadata--ODMG0 Metadata-module__secondary--1te4w IssueItemMetadata-module__ListItemMetadata_0--iaEA1';
  commentMetadata.setAttribute('data-testid', 'list-row-comments');
  commentMetadata.innerHTML = `
    <div class="IssueItem-module__commentCountContainer--YUcKU">
      <svg aria-hidden="true" focusable="false" class="octicon octicon-comment"
           viewBox="0 0 16 16" width="16" height="16" fill="currentColor"
           style="vertical-align: text-bottom;">
        <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
      </svg>
      <span class="ml-1">${issue.comments}</span>
      <span class="sr-only"> comments</span>
    </div>
  `;

  metadataContainer.appendChild(commentMetadata);

  // Assemble all parts
  li.appendChild(titleContainer);
  li.appendChild(leadingContent);
  li.appendChild(mainContent);
  li.appendChild(metadataContainer);
  row.appendChild(li);
  wrapper.appendChild(row);

  return wrapper;
}

// Load and render all bookmarked issues
async function loadAndRenderBookmarks() {
  const container = document.querySelector('[data-extension-bookmarks-container]');
  if (!container) return;

  const loadingEl = container.querySelector('#bookmarks-loading');
  const errorEl = container.querySelector('#bookmarks-error');
  const emptyEl = container.querySelector('#bookmarks-empty');
  const listEl = container.querySelector('#bookmarks-list');

  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  emptyEl.style.display = 'none';
  listEl.innerHTML = '';

  try {
    const bookmarks = await getBookmarks();
    const bookmarkIds = Object.keys(bookmarks);

    if (bookmarkIds.length === 0) {
      loadingEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    // Fetch all issue details in parallel
    const issuePromises = bookmarkIds.map(id => {
      const bookmark = bookmarks[id];
      return fetchIssueDetails(bookmark.owner, bookmark.repo, bookmark.number, bookmark.type);
    });

    const issues = await Promise.all(issuePromises);
    const validIssues = issues.filter(issue => issue !== null);

    if (validIssues.length === 0) {
      loadingEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    // Sort by updated date
    validIssues.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    // Update result count and show results section
    const resultsSection = container.querySelector('#bookmarks-results-section');
    const countHeading = container.querySelector('#bookmarks-count');
    if (resultsSection && countHeading) {
      const count = validIssues.length;
      countHeading.textContent = `${count} result${count !== 1 ? 's' : ''}`;
      resultsSection.style.display = 'flex';
    }

    // Render all issues
    validIssues.forEach(issue => {
      const liEl = renderIssueItem(issue);
      listEl.appendChild(liEl);
    });

    loadingEl.style.display = 'none';
    setupFilterInput();

  } catch (error) {
    console.error('[Bookmarks] Error loading bookmarks:', error);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = `Failed to load bookmarks: ${error.message}`;
  }
}

// Setup filter input with debouncing
function setupFilterInput() {
  const filterInput = document.querySelector('#bookmarks-filter');
  if (!filterInput) return;

  let filterTimeout;
  filterInput.addEventListener('input', (e) => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      const searchText = e.target.value.toLowerCase();
      const items = document.querySelectorAll('[data-extension-bookmarks-container] [data-issue-id]');

      items.forEach(item => {
        const title = item.querySelector('a').textContent.toLowerCase();
        const repo = item.querySelector('.DescriptionItem-module__default--rAYpS span')?.textContent.toLowerCase() || '';

        const matches = title.includes(searchText) || repo.includes(searchText);
        item.style.display = matches ? '' : 'none';
      });
    }, 300);
  });
}

// Find the main content area (the right-side issues list, not the whole page)
function getMainContent() {
  // The page structure is: <main> -> <nav sidebar> + <main> inner
  // We want to hide only the inner main (right side), not the whole page
  const mainElements = document.querySelectorAll('main');
  // Return the last/innermost main element (the content area, not the page container)
  return mainElements.length > 1 ? mainElements[mainElements.length - 1] : mainElements[0];
}

// Show the bookmarks view
function showBookmarksView() {
  // Use History API if not already at /issues/bookmarks
  if (window.location.pathname !== '/issues/bookmarks') {
    history.pushState(null, null, '/issues/bookmarks');
  }

  // Activate bookmarks nav item
  activateBookmarksNavItem();

  const main = getMainContent();
  if (!main) return;

  // Find or create the bookmarks view container
  let bookmarksContainer = document.querySelector('[data-extension-bookmarks-container]');
  if (!bookmarksContainer) {
    bookmarksContainer = createBookmarksView();
    // Insert the container as the first child inside main
    main.insertBefore(bookmarksContainer, main.firstChild);
  }

  // Hide the React content, show our bookmarks view
  for (let child of main.children) {
    if (child !== bookmarksContainer) {
      child.style.display = 'none';
    }
  }
  bookmarksContainer.style.display = 'block';

  // Load and render bookmarks
  loadAndRenderBookmarks();
}

// Hide the bookmarks view
function hideBookmarksView() {
  // Deactivate bookmarks nav item
  deactivateBookmarksNavItem();

  const main = getMainContent();
  if (!main) return;

  // Find the bookmarks container
  const bookmarksContainer = document.querySelector('[data-extension-bookmarks-container]');

  // Show all children except our bookmarks container
  for (let child of main.children) {
    if (child !== bookmarksContainer) {
      child.style.display = '';
    }
  }
  if (bookmarksContainer) {
    bookmarksContainer.style.display = 'none';
  }
}

// Update the active state on the nav item
function updateNavItemActiveState(isActive) {
  if (!bookmarkNavItem) return;

  const link = bookmarkNavItem.querySelector('a');
  if (isActive) {
    bookmarkNavItem.setAttribute('data-active', 'true');
    if (link) link.setAttribute('aria-current', 'page');
  } else {
    bookmarkNavItem.removeAttribute('data-active');
    if (link) link.removeAttribute('aria-current');
  }
}

// Check if bookmarks view is currently active
function isBookmarksViewActive() {
  return window.location.pathname === '/issues/bookmarks';
}

// Check if we're on a GitHub 404 page
function is404Page() {
  // Check page title (most reliable)
  if (document.title.includes('Page not found')) {
    return true;
  }

  // Check for 404 image
  const img404 = document.querySelector('main img[alt*="404"]');
  if (img404) {
    return true;
  }

  // Check if application-main exists (404 pages don't have the React app container)
  if (!document.querySelector('div.application-main')) {
    return true;
  }

  return false;
}

// Handle navigation via back/forward buttons (popstate)
function handleNavigation() {
  const pathname = window.location.pathname;

  if (pathname === '/issues/bookmarks') {
    // User navigated to bookmarks (via back/forward or direct URL)
    showBookmarksView();
  } else if (pathname.startsWith('/issues/')) {
    // User navigated to a React view (assigned, created, mentioned, recent)
    hideBookmarksView();
  }
}

// Initialize the script
function init() {
  console.log('[Bookmarks] Initializing content script for /issues page');

  // Don't inject custom markup on 404 pages
  if (is404Page()) {
    console.log('[Bookmarks] 404 page detected, skipping initialization');
    return;
  }

  // Start stable observer that watches a permanent parent element and handles:
  // - Nav item injection (with automatic recovery from React re-renders)
  // - Bookmarks view container injection (with recovery)
  // - Active state management
  setupStableObserver();

  // Set up event listener for back/forward button navigation
  window.addEventListener('popstate', handleNavigation);

  // Check initial pathname on page load
  if (window.location.pathname === '/issues/bookmarks') {
    showBookmarksView();
  }

  console.log('[Bookmarks] Content script initialization complete');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
