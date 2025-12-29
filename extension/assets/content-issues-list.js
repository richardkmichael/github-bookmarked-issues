// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Content script for GitHub /issues pages
// Phase 1: Test whether React removes custom nav item

// Reference to our injected nav item
let bookmarkNavItem = null;

// Store original page title
let originalTitle = null;

// Setup templates (injected once into page)
function setupTemplates() {
  if (document.getElementById('ext-bookmarks-templates')) return;

  const container = document.createElement('div');
  container.id = 'ext-bookmarks-templates';
  container.style.display = 'none';

  // Create all templates (using template.innerHTML for static content)
  container.appendChild(createBookmarkIconTemplate());
  container.appendChild(createOpenIconTemplate());
  container.appendChild(createClosedIconTemplate());
  container.appendChild(createCommentIconTemplate());
  container.appendChild(createBookmarksViewTemplate());

  document.body.appendChild(container);
}

// Helper to create bookmark icon template
function createBookmarkIconTemplate() {
  const template = document.createElement('template');
  template.id = 'icon-bookmark';
  template.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;" class="octicon octicon-bookmark"><path d="M3 2.75C3 1.784 3.784 1 4.75 1h6.5c.966 0 1.75.784 1.75 1.75v11.5a.75.75 0 0 1-1.227.579L8 11.722l-3.773 3.107A.751.751 0 0 1 3 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.91l3.023-2.489a.75.75 0 0 1 .954 0l3.023 2.49V2.75a.25.25 0 0 0-.25-.25Z"></path></svg>';
  return template;
}

// Helper to create open icon template
function createOpenIconTemplate() {
  const template = document.createElement('template');
  template.id = 'icon-open';
  template.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="vertical-align: text-bottom;" class="octicon octicon-issue-opened"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"></path></svg>';
  return template;
}

// Helper to create closed icon template
function createClosedIconTemplate() {
  const template = document.createElement('template');
  template.id = 'icon-closed';
  template.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="vertical-align: text-bottom;" class="octicon octicon-issue-closed"><path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"></path><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"></path></svg>';
  return template;
}

// Helper to create comment icon template
function createCommentIconTemplate() {
  const template = document.createElement('template');
  template.id = 'icon-comment';
  template.innerHTML = '<svg aria-hidden="true" focusable="false" class="octicon octicon-comment" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="vertical-align: text-bottom;"><path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>';
  return template;
}

// Helper to create the large bookmarks view template
function createBookmarksViewTemplate() {
  const template = document.createElement('template');
  template.id = 'bookmarks-view';
  template.innerHTML = `
    <div data-extension-bookmarks-container="true" style="display: none;">
      <div class="prc-PageLayout-ContentWrapper-b-QRo" data-is-hidden="false">
        <div class="prc-PageLayout-Content--F7-I" data-width="full" style="--spacing: var(--spacing-none);">
          <div class="ThreePanesLayout-module__ThreePanesLayoutMiddleOnlyPane--uNVJC">
            <div class="Box-sc-62in7e-0 pKvlx">
              <div data-testid="list-header">
                <div class="Header-module__HeaderListContainer--KyKxD">
                  <div class="HeaderContent-module__HeaderContentContainer--VW7Bw">
                    <div class="HeaderContent-module__displayModeContainer--cJT14">
                      <span class="HeaderContent-module__titleOptionsRow--hPAtk">
                        <h1 class="HeaderContent-module__Heading--uCBAw prc-Heading-Heading-6CmGO">Bookmarked</h1>
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
                        <label for="bookmarks-filter" class="FormControl-label sr-only">Filter bookmarked issues</label>
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
                              <div data-action-bar-item="sort-by" class="VisibleItem-module__Box_0--BsJkb" style="position: relative;">
                                <button type="button" id="bookmarks-sort-button" aria-haspopup="true" aria-expanded="false" class="prc-Button-ButtonBase-9n-Xk" data-loading="false" data-size="medium" data-variant="invisible">
                                  <span data-component="buttonContent" class="prc-Button-ButtonContent-Iohp5">
                                    <span data-component="leadingVisual" class="prc-Button-Visual-YNt2F prc-Button-VisualWrap-E4cnq">
                                      <svg aria-hidden="true" focusable="false" class="octicon octicon-sort-desc" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                        <path d="M0 4.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Zm0 4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75ZM13.5 10h2.25a.25.25 0 0 1 .177.427l-3 3a.25.25 0 0 1-.354 0l-3-3A.25.25 0 0 1 9.75 10H12V3.75a.75.75 0 0 1 1.5 0V10Z"></path>
                                      </svg>
                                    </span>
                                    <span data-component="text" class="prc-Button-Label-FWkx3">
                                      <span class="sr-only">Sort by </span>
                                      <span id="bookmarks-sort-label">Updated</span>
                                    </span>
                                    <span data-component="trailingAction" class="prc-Button-Visual-YNt2F prc-Button-VisualWrap-E4cnq">
                                      <svg aria-hidden="true" focusable="false" class="octicon octicon-triangle-down" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                        <path d="m4.427 7.427 3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z"></path>
                                      </svg>
                                    </span>
                                  </span>
                                </button>
                                <ul id="bookmarks-sort-menu" class="prc-ActionList-ActionList-rPFF2" role="menu" aria-labelledby="bookmarks-sort-button" data-dividers="false" data-variant="inset" style="display: none; position: absolute; z-index: 100; background: var(--overlay-bgColor); border: 1px solid var(--borderColor-default); border-radius: 12px; box-shadow: var(--shadow-floating-medium); min-width: 240px; margin-top: 4px;">
                                  <li class="prc-ActionList-Group-lMIPQ" role="none">
                                    <h3 class="prc-ActionList-GroupHeading-UEqaz" style="padding: 6px 8px; margin: 0; font-size: 12px; font-weight: 600; color: var(--fgColor-muted);">Sort by</h3>
                                    <ul role="group" class="prc-ActionList-GroupList-V5B3-">
                                      <li role="menuitemradio" class="prc-ActionList-ActionListItem-So4vC" data-sort-criteria="updated" aria-checked="true">
                                        <div class="prc-ActionList-ActionListContent-KBb8-" data-size="medium">
                                          <span class="prc-ActionList-LeadingAction-hbWbh prc-ActionList-VisualWrap-bdCsS">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-check" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
                                            </svg>
                                          </span>
                                          <span class="prc-ActionList-ActionListSubContent-gKsFp">
                                            <span class="prc-ActionList-ItemLabel-81ohH">Last updated</span>
                                          </span>
                                        </div>
                                      </li>
                                      <li role="menuitemradio" class="prc-ActionList-ActionListItem-So4vC" data-sort-criteria="bookmarked" aria-checked="false">
                                        <div class="prc-ActionList-ActionListContent-KBb8-" data-size="medium">
                                          <span class="prc-ActionList-LeadingAction-hbWbh prc-ActionList-VisualWrap-bdCsS">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-check" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
                                            </svg>
                                          </span>
                                          <span class="prc-ActionList-ActionListSubContent-gKsFp">
                                            <span class="prc-ActionList-ItemLabel-81ohH">Bookmarked on</span>
                                          </span>
                                        </div>
                                      </li>
                                      <li role="menuitemradio" class="prc-ActionList-ActionListItem-So4vC" data-sort-criteria="repo" aria-checked="false">
                                        <div class="prc-ActionList-ActionListContent-KBb8-" data-size="medium">
                                          <span class="prc-ActionList-LeadingAction-hbWbh prc-ActionList-VisualWrap-bdCsS">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-check" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
                                            </svg>
                                          </span>
                                          <span class="prc-ActionList-ActionListSubContent-gKsFp">
                                            <span class="prc-ActionList-ItemLabel-81ohH">Repository</span>
                                          </span>
                                        </div>
                                      </li>
                                    </ul>
                                  </li>
                                  <li class="prc-ActionList-Divider-cJAu8" role="separator"></li>
                                  <li class="prc-ActionList-Group-lMIPQ" role="none">
                                    <h3 class="prc-ActionList-GroupHeading-UEqaz" style="padding: 6px 8px; margin: 0; font-size: 12px; font-weight: 600; color: var(--fgColor-muted);">Order</h3>
                                    <ul role="group" class="prc-ActionList-GroupList-V5B3-">
                                      <li role="menuitemradio" class="prc-ActionList-ActionListItem-So4vC" data-sort-order="asc" aria-checked="false">
                                        <div class="prc-ActionList-ActionListContent-KBb8-" data-size="medium">
                                          <span class="prc-ActionList-LeadingAction-hbWbh prc-ActionList-VisualWrap-bdCsS">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-sort-asc" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="m12.927 2.573 3 3A.25.25 0 0 1 15.75 6H13.5v6.75a.75.75 0 0 1-1.5 0V6H9.75a.25.25 0 0 1-.177-.427l3-3a.25.25 0 0 1 .354 0ZM0 12.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Zm0-4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0-4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Z"></path>
                                            </svg>
                                          </span>
                                          <span class="prc-ActionList-ActionListSubContent-gKsFp">
                                            <span class="prc-ActionList-ItemLabel-81ohH" id="order-asc-label">Oldest</span>
                                          </span>
                                        </div>
                                      </li>
                                      <li role="menuitemradio" class="prc-ActionList-ActionListItem-So4vC" data-sort-order="desc" aria-checked="true">
                                        <div class="prc-ActionList-ActionListContent-KBb8-" data-size="medium">
                                          <span class="prc-ActionList-LeadingAction-hbWbh prc-ActionList-VisualWrap-bdCsS">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-sort-desc" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M0 4.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Zm0 4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75ZM13.5 10h2.25a.25.25 0 0 1 .177.427l-3 3a.25.25 0 0 1-.354 0l-3-3A.25.25 0 0 1 9.75 10H12V3.75a.75.75 0 0 1 1.5 0V10Z"></path>
                                            </svg>
                                          </span>
                                          <span class="prc-ActionList-ActionListSubContent-gKsFp">
                                            <span class="prc-ActionList-ItemLabel-81ohH" id="order-desc-label">Newest</span>
                                          </span>
                                        </div>
                                      </li>
                                    </ul>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                        <ul id="bookmarks-list" class="ListView-module__ul--A_8jF" role="list" data-listview-component="items-list" data-density="default" tabindex="-1" aria-labelledby="bookmarks-list-container"></ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div id="bookmarks-loading" style="padding: 40px 20px; text-align: center; color: var(--fgColor-muted); display: none;">Loading bookmarked issues...</div>
              <div id="bookmarks-error" style="padding: 16px; color: #cf222e; background-color: #ffebe9; border: 1px solid #ff8182; border-radius: 6px; margin: 16px; display: none;"></div>
              <div id="bookmarks-empty" style="padding: 40px 20px; text-align: center; color: var(--fgColor-muted); display: none;">
                <div style="font-size: 14px; margin-bottom: 8px;">No bookmarked issues yet</div>
                <div style="font-size: 12px;">Visit any issue page and click the bookmark button to get started</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  return template;
}

// Get template helper
function getTemplate(name) {
  const template = document.getElementById(name);
  return template.content.cloneNode(true);
}

// Get icon helper
function getIcon(name) {
  const template = document.getElementById(`icon-${name}`);
  return template.content.cloneNode(true).firstChild;
}

// Inject the "Bookmarked" navigation item into the sidebar
function injectSidebarNavItem() {
  const navList = document.querySelector('nav[aria-label="Default views"] ul');
  if (!navList) {
    console.warn('[Bookmarked] Sidebar nav list not found');
    return false;
  }

  // Check if already exists
  if (document.querySelector('li[data-extension-bookmarks-nav="true"]')) {
    return true;
  }

  // Copy classes from an existing native nav item (to get current CSS module hashes)
  const nativeNavItem = navList.querySelector('li');
  const nativeLink = nativeNavItem?.querySelector('a');

  if (!nativeNavItem || !nativeLink) {
    console.error('[Bookmarked] Failed to find native nav items to copy classes from');
    return false;
  }

  // Create bookmark nav item with exact structure from native items
  const li = document.createElement('li');
  li.className = nativeNavItem.className;
  li.setAttribute('data-has-description', 'false');
  li.setAttribute('data-extension-bookmarks-nav', 'true');

  const link = document.createElement('a');
  link.className = nativeLink.className;
  link.setAttribute('tabindex', '0');
  link.setAttribute('data-size', 'medium');
  link.href = '/issues/bookmarked';
  link.style.setProperty('--subitem-depth', '0');

  // Navigate to bookmarks view using History API (no React routing)
  link.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    history.pushState(null, null, '/issues/bookmarked');
    showBookmarksView();
    activateBookmarksNavItem();
  });

  // Create inner structure (copy classes from native link's children)
  const nativeSpacer = nativeLink.querySelector('[class*="Spacer"]');
  const nativeSubContent = nativeLink.querySelector('[class*="SubContent"]');
  const nativeLabel = nativeLink.querySelector('[class*="ItemLabel"]');
  const nativeItemText = nativeLink.querySelector('[class*="itemText"]');
  const nativeIcon = nativeLink.querySelector('[class*="icon"]');
  const nativeTruncatedText = nativeLink.querySelector('[class*="truncatedItemText"]');

  if (!nativeSpacer || !nativeSubContent || !nativeLabel || !nativeItemText || !nativeIcon || !nativeTruncatedText) {
    console.error('[Bookmarked] Failed to find all required native nav item child elements');
    return false;
  }

  const spacer = document.createElement('span');
  spacer.className = nativeSpacer.className;

  const subContent = document.createElement('span');
  subContent.className = nativeSubContent.className;
  subContent.setAttribute('data-component', 'ActionList.Item--DividerContainer');

  const label = document.createElement('span');
  label.className = nativeLabel.className;

  const itemText = document.createElement('div');
  itemText.className = nativeItemText.className;

  const icon = document.createElement('div');
  icon.className = nativeIcon.className;
  icon.setAttribute('data-color', 'gray');
  icon.appendChild(getIcon('bookmark'));

  const text = document.createElement('span');
  text.className = nativeTruncatedText.className;
  text.textContent = 'Bookmarked';

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

  console.log('[Bookmarked] Nav item injected with proper structure');
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
    console.warn('[Bookmarked] Stable parent not found');
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

  console.log('[Bookmarked] Stable observer started on', STABLE_PARENT_SELECTOR);

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

// Utility functions from popup.js (escapeHtml removed - using textContent instead)

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
      const statusText = response.statusText || 'Unknown Error';
      throw new Error(`${response.status} ${statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Bookmarked] Error fetching issue details:', error);
    return { _error: error.message };
  }
}

// Create a bookmarks view container with GitHub's native structure
function createBookmarksView() {
  return getTemplate('bookmarks-view').firstElementChild;
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
    console.error('[Bookmarked] Error getting bookmarks:', error);
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

  const outer = document.createElement('div');
  outer.className = 'LeadingVisual-module__outer--qS9Ac';
  outer.setAttribute('data-testid', 'list-row-state-icon');
  outer.style.marginTop = '14px';

  const middle = document.createElement('div');

  const inner = document.createElement('div');
  inner.className = 'LeadingVisual-module__inner--GeEeG';
  inner.style.width = '16px';
  inner.style.height = '16px';

  const statusIcon = getIcon(isOpen ? 'open' : 'closed');
  statusIcon.setAttribute('color', isOpen ? 'var(--fgColor-open)' : 'var(--fgColor-done)');

  const srOnly = document.createElement('span');
  srOnly.className = 'sr-only';
  srOnly.textContent = `Status: ${isOpen ? 'Open' : 'Closed'}.`;

  inner.appendChild(statusIcon);
  inner.appendChild(srOnly);
  middle.appendChild(inner);
  outer.appendChild(middle);
  leadingContent.appendChild(outer);

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
  const repoSpan = document.createElement('span');
  repoSpan.textContent = repoName;
  repoContainer.appendChild(repoSpan);

  const numberDesc = document.createElement('span');
  numberDesc.className = 'IssueItem-module__defaultNumberDescription--_0xgU';
  const numberSpan = document.createElement('span');
  numberSpan.textContent = `#${issue.number}`;
  numberDesc.appendChild(numberSpan);
  numberDesc.appendChild(document.createTextNode('\u00A0')); // &nbsp;

  // Created timestamp
  const createdContainer = document.createElement('div');
  createdContainer.className = 'IssueItem-module__timestampContainer--koCC8';
  createdContainer.setAttribute('data-testid', 'created-at');

  const dot1 = document.createElement('span');
  dot1.textContent = '· ';

  const userLink = document.createElement('a');
  userLink.className = 'IssueItem-module__authorCreatedLink--kzskP prc-Link-Link-85e08';
  userLink.href = issue.user?.html_url || '#';
  userLink.tabIndex = -1;
  userLink.target = '_blank';
  userLink.rel = 'noopener noreferrer';
  userLink.textContent = issue.user?.login || 'unknown';

  const opened = document.createElement('span');
  opened.textContent = ' opened ';

  const createdTime = document.createElement('relative-time');
  createdTime.setAttribute('datetime', issue.created_at);
  createdTime.textContent = formatDate(issue.created_at);

  createdContainer.appendChild(dot1);
  createdContainer.appendChild(userLink);
  createdContainer.appendChild(opened);
  createdContainer.appendChild(createdTime);

  // Updated timestamp
  const updatedContainer = document.createElement('div');
  updatedContainer.className = 'IssueItem-module__timestampContainer--koCC8';
  updatedContainer.setAttribute('data-testid', 'updated-at');

  updatedContainer.appendChild(document.createTextNode('· Updated '));

  const updatedTime = document.createElement('relative-time');
  updatedTime.className = 'IssuePullRequestDescription-module__RelativeTime--lbeGP';
  updatedTime.setAttribute('datetime', issue.updated_at);
  updatedTime.textContent = formatDate(issue.updated_at);

  updatedContainer.appendChild(updatedTime);

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

  const commentCountContainer = document.createElement('div');
  commentCountContainer.className = 'IssueItem-module__commentCountContainer--YUcKU';

  commentCountContainer.appendChild(getIcon('comment'));

  const countSpan = document.createElement('span');
  countSpan.className = 'ml-1';
  countSpan.textContent = issue.comments;

  const srOnlySpan = document.createElement('span');
  srOnlySpan.className = 'sr-only';
  srOnlySpan.textContent = ' comments';

  commentCountContainer.appendChild(countSpan);
  commentCountContainer.appendChild(srOnlySpan);
  commentMetadata.appendChild(commentCountContainer);

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

// Sort issues based on selected order
function sortIssues(issues, bookmarks, sortOrder) {
  const sorted = [...issues];

  switch (sortOrder) {
    case 'updated-desc':
      sorted.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      break;

    case 'updated-asc':
      sorted.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
      break;

    case 'bookmarked-desc':
      sorted.sort((a, b) => {
        const bookmarkIdA = getBookmarkIdFromUrl(a.html_url);
        const bookmarkIdB = getBookmarkIdFromUrl(b.html_url);
        const bookmarkA = bookmarkIdA ? bookmarks[bookmarkIdA] : null;
        const bookmarkB = bookmarkIdB ? bookmarks[bookmarkIdB] : null;
        const timeA = bookmarkA?.bookmarkedAt || 0;
        const timeB = bookmarkB?.bookmarkedAt || 0;
        return timeB - timeA;
      });
      break;

    case 'bookmarked-asc':
      sorted.sort((a, b) => {
        const bookmarkIdA = getBookmarkIdFromUrl(a.html_url);
        const bookmarkIdB = getBookmarkIdFromUrl(b.html_url);
        const bookmarkA = bookmarkIdA ? bookmarks[bookmarkIdA] : null;
        const bookmarkB = bookmarkIdB ? bookmarks[bookmarkIdB] : null;
        const timeA = bookmarkA?.bookmarkedAt || 0;
        const timeB = bookmarkB?.bookmarkedAt || 0;
        return timeA - timeB;
      });
      break;

    case 'repo-asc':
      sorted.sort((a, b) => {
        const repoA = getRepoFromUrl(a.html_url).toLowerCase();
        const repoB = getRepoFromUrl(b.html_url).toLowerCase();
        const repoCompare = repoA.localeCompare(repoB);
        return repoCompare !== 0 ? repoCompare : a.number - b.number;
      });
      break;

    case 'repo-desc':
      sorted.sort((a, b) => {
        const repoA = getRepoFromUrl(a.html_url).toLowerCase();
        const repoB = getRepoFromUrl(b.html_url).toLowerCase();
        const repoCompare = repoB.localeCompare(repoA);
        return repoCompare !== 0 ? repoCompare : b.number - a.number;
      });
      break;

    default:
      sorted.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  return sorted;
}

// Load and render all bookmarked issues
async function loadAndRenderBookmarks() {
  const container = document.querySelector('[data-extension-bookmarks-container]');
  if (!container) return;

  const loading = container.querySelector('#bookmarks-loading');
  const error = container.querySelector('#bookmarks-error');
  const empty = container.querySelector('#bookmarks-empty');
  const list = container.querySelector('#bookmarks-list');

  loading.style.display = 'block';
  error.style.display = 'none';
  empty.style.display = 'none';
  list.replaceChildren();

  try {
    const bookmarks = await getBookmarks();
    const bookmarkIds = Object.keys(bookmarks);

    if (bookmarkIds.length === 0) {
      loading.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    // Load sort preference
    const sortResult = await browser.storage.sync.get(['bookmarks_sort_order']);
    const sortOrder = sortResult.bookmarks_sort_order || 'updated-desc';

    // Fetch all issue details in parallel
    const issuePromises = bookmarkIds.map(id => {
      const bookmark = bookmarks[id];
      return fetchIssueDetails(bookmark.owner, bookmark.repo, bookmark.number, bookmark.type);
    });

    const issues = await Promise.all(issuePromises);
    const validIssues = issues.filter(issue => issue && !issue._error);
    const failedIssues = issues.filter(issue => issue && issue._error);
    const failedCount = failedIssues.length;

    if (validIssues.length === 0) {
      loading.style.display = 'none';
      if (failedCount > 0) {
        // All fetches failed - show error
        error.style.display = 'block';
        const errors = failedIssues.map(issue => issue._error).join(', ');
        error.textContent = `Failed to load issue details from GitHub API: ${errors}`;
      } else {
        // Genuinely no bookmarks
        empty.style.display = 'block';
      }
      return;
    }

    // Show warning if some (but not all) issues failed to load
    if (failedCount > 0) {
      error.style.display = 'block';
      const errors = failedIssues.map(issue => issue._error).join(', ');
      error.textContent = `Warning: ${failedCount} of ${issues.length} issues failed to load: ${errors}`;
    }

    // Sort issues based on preference
    const sortedIssues = sortIssues(validIssues, bookmarks, sortOrder);

    // Update result count and show results section
    const resultsSection = container.querySelector('#bookmarks-results-section');
    const countHeading = container.querySelector('#bookmarks-count');
    if (resultsSection && countHeading) {
      const count = sortedIssues.length;
      countHeading.textContent = `${count} result${count !== 1 ? 's' : ''}`;
      resultsSection.style.display = 'flex';
    }

    // Render all issues
    sortedIssues.forEach(issue => {
      const item = renderIssueItem(issue);
      list.appendChild(item);
    });

    loading.style.display = 'none';
    setupFilterInput();
    setupSortDropdown();

  } catch (e) {
    console.error('[Bookmarked] Error loading bookmarks:', e);
    loading.style.display = 'none';
    error.style.display = 'block';
    error.textContent = `Failed to load bookmarked issues: ${e.message}`;
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

      let visibleCount = 0;
      items.forEach(item => {
        // Use stable data-testid attributes instead of hashed class names
        const titleLink = item.querySelector('[data-testid="issue-pr-title-link"]');
        const repoAndNumber = item.querySelector('[data-testid="list-row-repo-name-and-number"]');

        // First div inside repo-and-number contains the repo name
        const repoSpan = repoAndNumber?.querySelector('div:first-child span');

        const title = titleLink?.textContent.toLowerCase() || '';
        const repo = repoSpan?.textContent.toLowerCase() || '';

        const matches = title.includes(searchText) || repo.includes(searchText);

        // Hide/show the wrapper div (two levels up from li with data-issue-id)
        const wrapper = item.parentElement?.parentElement;
        if (wrapper) {
          wrapper.style.display = matches ? '' : 'none';
          if (matches) visibleCount++;
        }
      });

      // Update results count
      const countHeading = document.querySelector('#bookmarks-count');
      if (countHeading) {
        countHeading.textContent = `${visibleCount} result${visibleCount !== 1 ? 's' : ''}`;
      }
    }, 300);
  });
}

// Setup sort dropdown with persistence
async function setupSortDropdown() {
  const sortButton = document.querySelector('#bookmarks-sort-button');
  const sortMenu = document.querySelector('#bookmarks-sort-menu');
  const sortLabel = document.querySelector('#bookmarks-sort-label');

  if (!sortButton || !sortMenu) {
    console.error('[Bookmarked] Sort button or menu not found');
    return;
  }

  // Check if already initialized (prevent duplicate event listeners)
  if (sortButton.hasAttribute('data-sort-initialized')) {
    console.log('[Bookmarked] Sort dropdown already initialized, skipping setup');
    return;
  }

  // Mark as initialized
  sortButton.setAttribute('data-sort-initialized', 'true');

  // Get menu items by section
  const criteriaItems = sortMenu.querySelectorAll('[data-sort-criteria]');
  const orderItems = sortMenu.querySelectorAll('[data-sort-order]');

  // Load saved sort preference
  const result = await browser.storage.sync.get(['bookmarks_sort_order']);
  const savedSort = result.bookmarks_sort_order || 'updated-desc';

  // Parse saved sort into criteria and order
  let currentCriteria = 'updated';
  let currentOrder = 'desc';

  if (savedSort.endsWith('-desc') || savedSort.endsWith('-asc')) {
    const parts = savedSort.split('-');
    currentOrder = parts.pop();
    currentCriteria = parts.join('-');
  }

  // Helper functions
  function openMenu() {
    sortButton.setAttribute('aria-expanded', 'true');
    sortMenu.style.display = 'block';

    // Position menu below button and ensure it stays within viewport
    const buttonRect = sortButton.getBoundingClientRect();
    const menuRect = sortMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // Position menu below the button
    const gap = 4; // 4px gap between button and menu
    sortMenu.style.top = `${buttonRect.height + gap}px`;

    // Check if menu would overflow right edge of viewport
    const menuRightEdge = buttonRect.right + menuRect.width;
    if (menuRightEdge > viewportWidth) {
      // Menu overflows, so align menu's right edge with button's right edge
      sortMenu.style.right = '0';
      sortMenu.style.left = 'auto';
    } else {
      // No overflow, use default left alignment
      sortMenu.style.left = '0';
      sortMenu.style.right = 'auto';
    }
  }

  function closeMenu() {
    sortButton.setAttribute('aria-expanded', 'false');
    sortMenu.style.display = 'none';
  }

  function updateSortUI() {
    // Define label logic based on criteria and order
    let buttonLabel;

    switch (currentCriteria) {
      case 'updated':
        // Always show "Updated" regardless of order
        buttonLabel = 'Updated';
        break;

      case 'bookmarked':
        // Show order in label: "Newest" or "Oldest"
        buttonLabel = currentOrder === 'desc' ? 'Newest' : 'Oldest';
        break;

      case 'repo':
        // Always show "Repo" (shortened) regardless of order
        buttonLabel = 'Repo';
        break;

      default:
        buttonLabel = 'Updated';
    }

    sortLabel.textContent = buttonLabel;

    // Update button icon based on order
    const buttonIcon = sortButton.querySelector('.octicon-sort-desc, .octicon-sort-asc');
    if (buttonIcon) {
      if (currentOrder === 'desc') {
        buttonIcon.classList.remove('octicon-sort-asc');
        buttonIcon.classList.add('octicon-sort-desc');
        buttonIcon.innerHTML = '<path d="M0 4.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Zm0 4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75ZM13.5 10h2.25a.25.25 0 0 1 .177.427l-3 3a.25.25 0 0 1-.354 0l-3-3A.25.25 0 0 1 9.75 10H12V3.75a.75.75 0 0 1 1.5 0V10Z"></path>';
      } else {
        buttonIcon.classList.remove('octicon-sort-desc');
        buttonIcon.classList.add('octicon-sort-asc');
        buttonIcon.innerHTML = '<path d="m12.927 2.573 3 3A.25.25 0 0 1 15.75 6H13.5v6.75a.75.75 0 0 1-1.5 0V6H9.75a.25.25 0 0 1-.177-.427l3-3a.25.25 0 0 1 .354 0ZM0 12.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Zm0-4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0-4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Z"></path>';
      }
    }

    // Update aria-checked and visibility on criteria items
    criteriaItems.forEach(item => {
      const criteria = item.getAttribute('data-sort-criteria');
      const isChecked = criteria === currentCriteria;
      item.setAttribute('aria-checked', isChecked ? 'true' : 'false');

      // Hide/show checkmark icon
      const checkmark = item.querySelector('.octicon-check');
      if (checkmark) {
        checkmark.style.visibility = isChecked ? 'visible' : 'hidden';
      }
    });

    // Update order items checkmarks and LABELS
    const orderAscLabel = document.querySelector('#order-asc-label');
    const orderDescLabel = document.querySelector('#order-desc-label');

    // Set order labels based on criteria
    if (currentCriteria === 'repo') {
      // Repository uses "Ascending" / "Descending"
      if (orderAscLabel) orderAscLabel.textContent = 'Ascending';
      if (orderDescLabel) orderDescLabel.textContent = 'Descending';
    } else {
      // Updated and Bookmarked use "Oldest" / "Newest"
      if (orderAscLabel) orderAscLabel.textContent = 'Oldest';
      if (orderDescLabel) orderDescLabel.textContent = 'Newest';
    }

    // Update aria-checked and visibility on order items
    orderItems.forEach(item => {
      const order = item.getAttribute('data-sort-order');
      const isChecked = order === currentOrder;
      item.setAttribute('aria-checked', isChecked ? 'true' : 'false');

      // Hide/show checkmark icon (order items show their own sort icons, not checkmarks)
      const sortIcon = item.querySelector('.octicon-sort-asc, .octicon-sort-desc');
      if (sortIcon) {
        sortIcon.style.visibility = isChecked ? 'visible' : 'hidden';
      }
    });
  }

  async function saveAndReload() {
    const sortOrder = `${currentCriteria}-${currentOrder}`;
    await browser.storage.sync.set({ bookmarks_sort_order: sortOrder });
    closeMenu();
    await loadAndRenderBookmarks();
  }

  // Update UI to reflect saved sort
  updateSortUI();

  // Toggle menu on button click
  sortButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const isExpanded = sortButton.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Handle criteria item clicks
  criteriaItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const newCriteria = item.getAttribute('data-sort-criteria');

      if (newCriteria !== currentCriteria) {
        currentCriteria = newCriteria;
        updateSortUI();
        await saveAndReload();
      }
    });
  });

  // Handle order item clicks
  orderItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const newOrder = item.getAttribute('data-sort-order');

      if (newOrder !== currentOrder) {
        currentOrder = newOrder;
        updateSortUI();
        await saveAndReload();
      }
    });
  });

  // Close menu on outside click
  const closeOnOutsideClick = (e) => {
    if (!sortButton.contains(e.target) && !sortMenu.contains(e.target)) {
      closeMenu();
    }
  };
  document.addEventListener('click', closeOnOutsideClick);

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
  // Use History API if not already at /issues/bookmarked
  if (window.location.pathname !== '/issues/bookmarked') {
    history.pushState(null, null, '/issues/bookmarked');
  }

  // Save original title and set to "Bookmarked"
  if (originalTitle === null) {
    originalTitle = document.title;
  }
  document.title = 'Bookmarked';

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
  // Restore original page title
  if (originalTitle !== null) {
    document.title = originalTitle;
    originalTitle = null;
  }

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
  return window.location.pathname === '/issues/bookmarked';
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

  if (pathname === '/issues/bookmarked') {
    // User navigated to bookmarks (via back/forward or direct URL)
    showBookmarksView();
  } else if (pathname.startsWith('/issues/')) {
    // User navigated to a React view (assigned, created, mentioned, recent)
    hideBookmarksView();
  }
}

// Initialize the script
function init() {
  console.log('[Bookmarked] Initializing content script for /issues page');

  // Setup templates
  setupTemplates();

  // Handle direct navigation to /issues/bookmarked (which results in 404) via redirect to /issues
  // and a flag to auto-show Bookmarked view
  if (window.location.pathname === '/issues/bookmarked' && is404Page()) {
    console.log('[Bookmarked] 404 detected at /issues/bookmarked, redirecting to /issues');
    sessionStorage.setItem('github-bookmarks-show', 'true');
    window.location.replace('/issues');
    return;
  }

  // Check if we should auto-show bookmarks (after redirect from 404)
  const shouldShowBookmarks = sessionStorage.getItem('github-bookmarks-show') === 'true';
  if (shouldShowBookmarks) {
    sessionStorage.removeItem('github-bookmarks-show');
    console.log('[Bookmarked] Auto-showing bookmarks after redirect from 404');
  }

  // Start stable observer that watches a permanent parent element and handles:
  // - Nav item injection (with automatic recovery from React re-renders)
  // - Bookmarked view container injection (with recovery)
  // - Active state management
  setupStableObserver();

  // Set up event listener for back/forward button navigation
  window.addEventListener('popstate', handleNavigation);

  // Check initial pathname on page load OR if we should auto-show after redirect
  if (window.location.pathname === '/issues/bookmarked' || shouldShowBookmarks) {
    if (shouldShowBookmarks) {
      // Need to wait for DOM to be ready and update URL
      setTimeout(() => {
        history.pushState(null, null, '/issues/bookmarked');
        showBookmarksView();
      }, 200);
    } else {
      showBookmarksView();
    }
  }

  console.log('[Bookmarked] Content script initialization complete');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
