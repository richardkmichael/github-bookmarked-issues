// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Content script for GitHub /issues pages
// Phase 1: Test whether React removes custom nav item

// Reference to our injected nav item
let bookmarkNavItem = null;
let bookmarksPlaceholder = null;

// Inject the "Bookmarks" navigation item into the sidebar
function injectSidebarNavItem() {
  // Find the sidebar nav list
  const navList = document.querySelector('nav[aria-label="Default views"] ul');
  if (!navList) {
    console.warn('[Bookmarks] Sidebar nav list not found');
    return false;
  }

  // Get the first existing nav item to copy its classes
  const existingItem = navList.querySelector('li');
  if (!existingItem) {
    console.warn('[Bookmarks] No existing nav items to copy classes from');
    return false;
  }

  // Dynamically copy classes from existing nav item
  const liClasses = Array.from(existingItem.classList).join(' ');
  const linkElement = existingItem.querySelector('a');
  const linkClasses = linkElement ? Array.from(linkElement.classList).join(' ') : '';

  // Create the custom nav item
  const bookmarkLi = document.createElement('li');
  bookmarkLi.className = liClasses;
  bookmarkLi.setAttribute('data-extension-bookmarks-nav', 'true');
  bookmarkLi.setAttribute('aria-label', 'Bookmarks');

  // Create the link with same styling as other nav items
  const bookmarkLink = document.createElement('a');
  bookmarkLink.className = linkClasses;
  bookmarkLink.href = '/issues#bookmarks';
  bookmarkLink.setAttribute('tabindex', '0');

  // Simple text content (no icon for now, just emoji)
  const span = document.createElement('span');
  span.textContent = '📚 Bookmarks';
  bookmarkLink.appendChild(span);

  bookmarkLi.appendChild(bookmarkLink);

  // Handle click to prevent React router from adding query params
  bookmarkLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = 'bookmarks';
  });

  // Append to the list
  navList.appendChild(bookmarkLi);
  bookmarkNavItem = bookmarkLi;

  console.log('[Bookmarks] Nav item injected successfully');
  return true;
}

// Create a placeholder bookmarks view
function createPlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.setAttribute('data-extension-bookmarks-placeholder', 'true');
  placeholder.style.cssText = `
    display: none;
    padding: 24px;
    text-align: center;
    color: var(--fgColor-muted);
  `;
  placeholder.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">📚</div>
    <div style="font-size: 14px; line-height: 1.5;">
      <strong>Bookmarks view</strong><br>
      Phase 1: Testing nav item persistence<br>
      <span style="font-size: 12px;">(Click other views to test if this nav item stays visible)</span>
    </div>
  `;
  return placeholder;
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
  const main = getMainContent();
  if (!main) return;

  if (!bookmarksPlaceholder) {
    bookmarksPlaceholder = createPlaceholder();
    // Insert the placeholder as the first child inside main (so it shows in the right content area)
    main.insertBefore(bookmarksPlaceholder, main.firstChild);
  }

  // Hide the React content, show our placeholder
  // Hide all children except our placeholder
  for (let child of main.children) {
    if (child !== bookmarksPlaceholder) {
      child.style.display = 'none';
    }
  }
  bookmarksPlaceholder.style.display = 'block';

  // Update nav item active state
  updateNavItemActiveState(true);
}

// Hide the bookmarks view
function hideBookmarksView() {
  const main = getMainContent();
  if (!main) return;

  // Show all children except our placeholder
  for (let child of main.children) {
    if (child !== bookmarksPlaceholder) {
      child.style.display = '';
    }
  }
  if (bookmarksPlaceholder) {
    bookmarksPlaceholder.style.display = 'none';
  }

  // Update nav item active state
  updateNavItemActiveState(false);
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
  return window.location.hash === '#bookmarks';
}

// Handle hash changes
function handleHashChange() {
  if (isBookmarksViewActive()) {
    showBookmarksView();
  } else {
    hideBookmarksView();
  }
}

// Initialize the script
function init() {
  console.log('[Bookmarks] Initializing content script for /issues page');

  // Inject the nav item
  if (!injectSidebarNavItem()) {
    // Retry after a brief delay if sidebar not ready
    setTimeout(() => {
      console.log('[Bookmarks] Retrying sidebar nav item injection');
      injectSidebarNavItem();
    }, 1000);
    return;
  }

  // Set up event listeners
  window.addEventListener('hashchange', handleHashChange);

  // Check initial hash state
  if (isBookmarksViewActive()) {
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
