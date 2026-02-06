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

// GitHub GraphQL endpoint and query definitions
// Hashes may change when GitHub updates - uses discovery fallback if hardcoded hashes expire
const GRAPHQL_ENDPOINT = 'https://github.com/_graphql';

const GITHUB_QUERIES = {
  // Main query - returns title, author, dates, state, repository
  issueDashboard: {
    name: 'IssueDashboardKnownViewPageQuery',
    hash: 'e02318ebeb8613553613ac1ebdbb7a4b',
    buildVariables: (searchQuery, skip = 0) => ({ query: searchQuery, skip }),
    extractResults: (data) => data?.search?.edges?.map(e => e.node) || []
  },

  // Supplementary query - returns comment counts (takes node IDs)
  issueRowSecondary: {
    name: 'IssueRowSecondaryQuery',
    hash: 'c5aa81956ee8f848ea72a183fef833c9',
    buildVariables: (nodeIds) => ({ includeReactions: false, nodes: nodeIds }),
    extractResults: (data) => data?.nodes || []
  }
};

// CSS module/PRC class prefixes used by the bookmarks view.
// discoverCssClasses() resolves these to full class names (with hash suffix) from stylesheets.
// Entries with [prefix, property, value] disambiguate prefixes shared by multiple components.
registerCssClasses([
  // --- CSS Module classes (template) ---
  'ThreePanesLayout-module__ThreePanesLayoutMiddleOnlyPane',
  'ThreePanesLayout-module__ThreePanesLayout',
  'Header-module__HeaderListContainer',
  'HeaderContent-module__HeaderContentContainer',
  'HeaderContent-module__displayModeContainer',
  'HeaderContent-module__titleOptionsRow',
  'HeaderContent-module__Heading',
  'Search-module__SearchContainer',
  'SearchBar-module__gap8',
  'SearchBar-module__filterContainer',
  'SearchBar-module__filter',
  'Input-module__Box_',
  'ListItems-module__listContainer',
  'ListItems-module__listScopedCommand',
  'ListView-module__container',
  ['Metadata-module__container', 'height', '48px'],
  'ListItemsHeaderWithoutBulkActions-module__ListViewMetadata_0',
  'Metadata-module__heading',
  'VisibleAndOverflowContainer-module__Box_0',
  'VisibleItems-module__Box_1',
  'VisibleItem-module__Box_0',
  'ListView-module__ul',

  // --- CSS Module classes (skeleton + render) ---
  'ListItems-module__listItem',
  'IssueRow-module__row',
  'ListItem-module__listItem',
  ['Title-module__container', 'display', 'block'],
  'Title-module__heading',
  'IssuePullRequestTitle-module__ListItemTitle_0',
  'IssuePullRequestTitle-module__ListItemTitle_1',
  ['LeadingContent-module__container', 'height', ''],
  'IssueItem-module__leadingContent',
  'LeadingVisual-module__outer',
  'LeadingVisual-module__inner',
  'MainContent-module__container',
  'MainContent-module__inner',
  'Description-module__container',
  'DescriptionItem-module__default',
  'IssuePullRequestDescription-module__descriptionItem',
  'IssueItem-module__defaultRepoContainer',
  'IssueItem-module__defaultNumberDescription',
  'IssueItem-module__timestampContainer',
  'IssueItem-module__authorCreatedLink',
  'IssuePullRequestDescription-module__RelativeTime',
  'MetadataContainer-module__container',
  'IssueItem-module__ListItem_0',
  'Metadata-module__metadata',
  ['Metadata-module__secondary', 'selectorContains', 'Metadata-module__metadata'],
  'Metadata-module__alignRight',
  'IssueItemMetadata-module__ListItemMetadata_0',
  'IssueItem-module__commentCountContainer',

  // --- PRC classes ---
  'prc-PageLayout-ContentWrapper',
  'prc-PageLayout-Content',
  'prc-PageLayout-PageLayoutRoot',
  'prc-PageLayout-PageLayoutWrapper',
  'prc-PageLayout-PageLayoutContent',
  'prc-Heading-Heading',
  'prc-Button-ButtonBase',
  'prc-Button-ButtonContent',
  'prc-Button-Visual',
  'prc-Button-VisualWrap',
  'prc-Button-Label',
  'prc-ActionList-ActionList',
  'prc-ActionList-Group',
  'prc-ActionList-GroupHeadingWrap',
  'prc-ActionList-GroupHeading',
  'prc-ActionList-GroupList',
  'prc-ActionList-ActionListItem',
  'prc-ActionList-ActionListContent',
  'prc-ActionList-LeadingAction',
  'prc-ActionList-VisualWrap',
  'prc-ActionList-ActionListSubContent',
  'prc-ActionList-ItemLabel',
  'prc-ActionList-Divider',
  'prc-ActionList-Spacer',
  'prc-ActionList-SingleSelectCheckmark',
  'prc-ActionList-LeadingVisual',
  'prc-Text-Text',
  'prc-Link-Link',
  'prc-TooltipV2-Tooltip',

  // --- Styled-components ---
  'Text__StyledText-sc',
  'Box-sc',
]);

// Build search query string for batch fetching bookmarked issues
function buildIssueSearchQuery(bookmarks) {
  // Build: is:issue (repo:owner/repo1 in:number 123) OR (repo:owner/repo2 in:number 456)
  const parts = bookmarks.map(b => `(repo:${b.owner}/${b.repo} in:number ${b.number})`);
  return 'is:issue ' + parts.join(' OR ');
}

// Execute a GraphQL query with hash discovery fallback
async function executeGraphQLQuery(queryDef, variables) {
  const makeRequest = async (queryHash) => {
    const url = GRAPHQL_ENDPOINT + '?body=' + encodeURIComponent(JSON.stringify({
      persistedQueryName: queryDef.name,
      query: queryHash,
      variables: variables
    }));

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin'
    });

    if (!response.ok) throw new Error(`GraphQL request failed: ${response.status}`);
    return response.json();
  };

  // Try hardcoded hash first
  let result = await makeRequest(queryDef.hash);

  // Check for unknownQuery error - hash may have expired
  if (result.errors?.some(e => e.type === 'unknownQuery')) {
    console.warn(`[Bookmarked] Hardcoded hash expired for ${queryDef.name}, trying discovery...`);

    // Try to get discovered hash from background script
    const discovered = await browser.runtime.sendMessage({
      type: 'GET_DISCOVERED_HASH',
      queryName: queryDef.name
    });

    if (discovered?.hash) {
      console.warn(`[Bookmarked] Using discovered hash for ${queryDef.name}: ${discovered.hash}`);
      console.warn(`[Bookmarked] Please update extension with new hash!`);
      result = await makeRequest(discovered.hash);

      if (result.errors?.some(e => e.type === 'unknownQuery')) {
        throw new Error(`Both hardcoded and discovered hashes expired for ${queryDef.name}`);
      }
    } else {
      throw new Error(`Hash expired for ${queryDef.name} and no discovered hash available`);
    }
  }

  return queryDef.extractResults(result.data);
}

// Batch fetch bookmarked issues via GraphQL (2 requests total)
async function fetchBookmarkedIssuesViaGraphQL(bookmarks) {
  if (bookmarks.length === 0) return [];

  // Step 1: Fetch main data via search query
  const searchQuery = buildIssueSearchQuery(bookmarks);
  console.log('[Bookmarked] GraphQL search query:', searchQuery);

  const dashboardResults = await executeGraphQLQuery(
    GITHUB_QUERIES.issueDashboard,
    GITHUB_QUERIES.issueDashboard.buildVariables(searchQuery)
  );

  console.log('[Bookmarked] GraphQL returned', dashboardResults.length, 'results');

  // Step 2: Filter to exact matches (search returns partial number matches like 3508 matching 23508)
  const exactMatches = dashboardResults.filter(node => {
    const repo = `${node.repository.owner.login}/${node.repository.name}`;
    return bookmarks.some(b => `${b.owner}/${b.repo}` === repo && b.number === node.number);
  });

  console.log('[Bookmarked] After exact match filter:', exactMatches.length, 'issues');

  if (exactMatches.length === 0) return [];

  // Step 3: Fetch comment counts for matched issues
  const nodeIds = exactMatches.map(node => node.id);
  const rowResults = await executeGraphQLQuery(
    GITHUB_QUERIES.issueRowSecondary,
    GITHUB_QUERIES.issueRowSecondary.buildVariables(nodeIds)
  );

  // Step 4: Merge and map to REST API-compatible format
  const commentMap = new Map(rowResults.map(r => [r.id, r.totalCommentsCount || 0]));

  return exactMatches.map(node => ({
    number: node.number,
    title: node.title,
    state: node.state?.toLowerCase() || 'open',
    html_url: `https://github.com/${node.repository.owner.login}/${node.repository.name}/issues/${node.number}`,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    comments: commentMap.get(node.id) || 0,
    user: node.author ? {
      login: node.author.login,
      html_url: `https://github.com/${node.author.login}`
    } : null,
    repository: {
      full_name: `${node.repository.owner.login}/${node.repository.name}`
    }
  }));
}

// Set template content from an HTML string using DOMParser.
// Avoids web-ext lint UNSAFE_VAR_ASSIGNMENT warnings that trigger on any
// innerHTML assignment with template literal interpolation (e.g., cls() calls).
// DOMParser is safe: it does not execute scripts in the parsed content.
function setTemplateHTML(template, html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  template.content.append(...doc.body.childNodes);
}

// Setup templates (injected once into page)
function setupTemplates() {
  if (document.getElementById('ext-bookmarks-templates')) return;

  const container = document.createElement('div');
  container.id = 'ext-bookmarks-templates';
  container.style.display = 'none';

  // Create all templates (using template.innerHTML for static content)
  const bookmarkIcon = createBookmarkIconTemplate();
  if (bookmarkIcon) container.appendChild(bookmarkIcon);
  container.appendChild(createOpenIconTemplate());
  container.appendChild(createClosedIconTemplate());
  container.appendChild(createCommentIconTemplate());
  container.appendChild(createSortDescIconTemplate());
  container.appendChild(createSortAscIconTemplate());
  container.appendChild(createSkeletonItemTemplate());
  container.appendChild(createIssueItemTemplate());
  container.appendChild(createBookmarksViewTemplate());

  document.body.appendChild(container);

  // Inject skeleton CSS styles
  if (!document.getElementById('ext-bookmarks-skeleton-styles')) {
    document.head.appendChild(createSkeletonStyles());
  }
}

// Helper to create bookmark icon template (returns null if already created by content.js)
function createBookmarkIconTemplate() {
  if (document.getElementById('icon-bookmark')) return null;
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

function createSortDescIconTemplate() {
  const template = document.createElement('template');
  template.id = 'icon-sort-desc';
  template.innerHTML = '<svg aria-hidden="true" focusable="false" class="octicon octicon-sort-desc" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;"><path d="M0 4.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Zm0 4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75ZM13.5 10h2.25a.25.25 0 0 1 .177.427l-3 3a.25.25 0 0 1-.354 0l-3-3A.25.25 0 0 1 9.75 10H12V3.75a.75.75 0 0 1 1.5 0V10Z"></path></svg>';
  return template;
}

function createSortAscIconTemplate() {
  const template = document.createElement('template');
  template.id = 'icon-sort-asc';
  template.innerHTML = '<svg aria-hidden="true" focusable="false" class="octicon octicon-sort-asc" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;"><path d="m12.927 2.573 3 3A.25.25 0 0 1 15.75 6H13.5v6.75a.75.75 0 0 1-1.5 0V6H9.75a.25.25 0 0 1-.177-.427l3-3a.25.25 0 0 1 .354 0ZM0 12.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Zm0-4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0-4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Z"></path></svg>';
  return template;
}

// Helper to create skeleton item template
function createSkeletonItemTemplate() {
  const template = document.createElement('template');
  template.id = 'skeleton-item';
  setTemplateHTML(template, `
    <div class="${cls('ListItems-module__listItem')}">
      <div class="${cls('IssueRow-module__row')}">
        <div class="${cls('ListItem-module__listItem')} skeleton-item">
          <div class="${cls('Title-module__container')}" data-listview-item-title-container="true">
            <div class="skeleton-text skeleton-title"></div>
          </div>
          <div class="${clsAll('LeadingContent-module__container', 'IssueItem-module__leadingContent')}">
            <div class="${cls('LeadingVisual-module__outer')}" style="margin-top: 14px;">
              <div>
                <div class="${cls('LeadingVisual-module__inner')}" style="width: 16px; height: 16px;">
                  <div class="skeleton-box skeleton-icon"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="${cls('MainContent-module__container')}">
            <div class="${cls('MainContent-module__inner')}">
              <div class="${cls('Description-module__container')}">
                <div class="${clsAll('DescriptionItem-module__default', 'IssuePullRequestDescription-module__descriptionItem')}">
                  <div class="skeleton-text skeleton-description"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);
  return template;
}

// Helper to create issue item template (structure matches GitHub's native issue rows)
function createIssueItemTemplate() {
  const template = document.createElement('template');
  template.id = 'issue-item';
  setTemplateHTML(template, `
    <div class="${cls('ListItems-module__listItem')}">
      <div class="${cls('IssueRow-module__row')}">
        <li class="${cls('ListItem-module__listItem')}" role="listitem" tabindex="0">
          <div class="${cls('Title-module__container')}" data-listview-item-title-container="true">
            <h4 class="${clsAll('Title-module__heading', 'IssuePullRequestTitle-module__ListItemTitle_0')}">
              <span class="${clsAll('Text__StyledText-sc', 'prc-Text-Text')}">
                <a data-slot="title-link" class="${cls('IssuePullRequestTitle-module__ListItemTitle_1')}" data-testid="issue-pr-title-link" tabindex="-1" target="_blank" rel="noopener noreferrer"></a>
              </span>
            </h4>
          </div>
          <div class="${clsAll('LeadingContent-module__container', 'IssueItem-module__leadingContent')}">
            <div class="${cls('LeadingVisual-module__outer')}" data-testid="list-row-state-icon" style="margin-top: 14px;">
              <div>
                <div class="${cls('LeadingVisual-module__inner')}" style="width: 16px; height: 16px;">
                  <span data-slot="status-icon"></span>
                  <span class="sr-only" data-slot="status-text"></span>
                </div>
              </div>
            </div>
          </div>
          <div class="${cls('MainContent-module__container')}">
            <div class="${cls('MainContent-module__inner')}">
              <div class="${cls('Description-module__container')}">
                <div class="${clsAll('DescriptionItem-module__default', 'IssuePullRequestDescription-module__descriptionItem')}" data-testid="list-row-repo-name-and-number">
                  <div class="${cls('IssueItem-module__defaultRepoContainer')}">
                    <span data-slot="repo-name"></span>
                  </div>
                  <span class="${cls('IssueItem-module__defaultNumberDescription')}">
                    <span data-slot="issue-number"></span>\u00A0</span>
                  <div class="${cls('IssueItem-module__timestampContainer')}" data-testid="created-at">
                    <span>\u00B7 </span>
                    <a data-slot="author-link" class="${clsAll('IssueItem-module__authorCreatedLink', 'prc-Link-Link')}" tabindex="-1" target="_blank" rel="noopener noreferrer"></a>
                    <span> opened </span>
                    <relative-time data-slot="created-time"></relative-time>
                  </div>
                  <div class="${cls('IssueItem-module__timestampContainer')}" data-testid="updated-at">
                    \u00B7 Updated <relative-time data-slot="updated-time" class="${cls('IssuePullRequestDescription-module__RelativeTime')}"></relative-time>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="${clsAll('MetadataContainer-module__container', 'IssueItem-module__ListItem_0')}">
            <div class="${clsAll('Metadata-module__metadata', 'Metadata-module__secondary', 'IssueItemMetadata-module__ListItemMetadata_0')}" data-testid="list-row-linked-pull-requests"></div>
            <div class="${clsAll('Metadata-module__metadata', 'Metadata-module__secondary', 'IssueItemMetadata-module__ListItemMetadata_0')}" data-testid="list-row-comments">
              <div class="${cls('IssueItem-module__commentCountContainer')}">
                <span data-slot="comment-icon"></span>
                <span class="ml-1" data-slot="comment-count"></span>
                <span class="sr-only"> comments</span>
              </div>
            </div>
            <div class="${clsAll('Metadata-module__metadata', 'Metadata-module__secondary', 'Metadata-module__alignRight', 'IssueItemMetadata-module__ListItemMetadata_0')}" data-testid="list-row-assignees"></div>
          </div>
        </li>
      </div>
    </div>
  `);
  return template;
}

// Helper to create skeleton CSS styles
function createSkeletonStyles() {
  const style = document.createElement('style');
  style.id = 'ext-bookmarks-skeleton-styles';
  style.textContent = `
    .skeleton-box,
    .skeleton-text {
      border-radius: var(--borderRadius-small, 3px);
      display: block;
    }

    .skeleton-icon {
      width: 16px;
      height: 16px;
      border-radius: 50%;
    }

    .skeleton-title {
      height: 1rem;
      margin: 4px 0;
    }

    .skeleton-description {
      height: 0.75rem;
      margin: 2px 0;
    }

    /* Shimmer animation using background-position */
    @keyframes skeleton-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    .skeleton-box,
    .skeleton-text {
      background: linear-gradient(
        90deg,
        var(--bgColor-muted, #656d7614) 25%,
        var(--bgColor-default, #f6f8fa) 50%,
        var(--bgColor-muted, #656d7614) 75%
      );
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s ease-in-out infinite;
    }
  `;
  return style;
}

// Helper to create the large bookmarks view template
function createBookmarksViewTemplate() {
  const template = document.createElement('template');
  template.id = 'bookmarks-view';
  setTemplateHTML(template, `
    <div data-extension-bookmarks-container="true" style="display: none;">
      <div class="${cls('prc-PageLayout-ContentWrapper')}" data-is-hidden="false">
        <div class="${cls('prc-PageLayout-Content')}" data-width="full" style="--spacing: var(--spacing-none);">
          <div class="${cls('ThreePanesLayout-module__ThreePanesLayoutMiddleOnlyPane')}">
            <div class="${cls('Box-sc')} pKvlx">
              <div data-testid="list-header">
                <div class="${cls('Header-module__HeaderListContainer')}">
                  <div class="${cls('HeaderContent-module__HeaderContentContainer')}">
                    <div class="${cls('HeaderContent-module__displayModeContainer')}">
                      <span class="${cls('HeaderContent-module__titleOptionsRow')}">
                        <h1 class="${clsAll('HeaderContent-module__Heading', 'prc-Heading-Heading')}">Bookmarked</h1>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="${cls('Search-module__SearchContainer')}">
                <div class="${cls('SearchBar-module__gap8')} px-0 d-block flex-row flex-justify-between">
                  <div class="${clsAll('SearchBar-module__filterContainer', 'SearchBar-module__gap8')} d-flex flex-row flex-1 flexWrap min-width-0">
                    <div class="${cls('SearchBar-module__filter')} d-flex flex-1 flex-column">
                      <div class="FormControl FormControl--fullWidth">
                        <label for="bookmarks-filter" class="FormControl-label sr-only">Filter bookmarked issues</label>
                        <div class="d-flex" style="border: 1px solid var(--borderColor-default, var(--color-border-default)); border-radius: 6px; overflow: hidden;">
                          <input type="text" id="bookmarks-filter" class="FormControl-input ${cls('Input-module__Box_')}" placeholder="Filter by issue title..." autocomplete="off" style="flex: 1; min-width: 0; border: none;">
                          <span class="d-flex flex-items-center px-2" style="background: var(--bgColor-muted, var(--color-canvas-subtle)); border-left: 1px solid var(--borderColor-default, var(--color-border-default)); color: var(--fgColor-muted, var(--color-fg-muted));">
                            <svg aria-hidden="true" focusable="false" class="octicon octicon-search" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="vertical-align: text-bottom;"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"></path></svg>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div class="${cls('ListItems-module__listContainer')}">
                    <div class="${cls('ListItems-module__listScopedCommand')}">
                      <div id="bookmarks-list-container" class="${cls('ListView-module__container')}">
                        <h2 class="sr-only ${cls('prc-Heading-Heading')}">Bookmarked issues</h2>
                        <div id="bookmarks-results-section" class="${clsAll('Metadata-module__container', 'ListItemsHeaderWithoutBulkActions-module__ListViewMetadata_0')}" style="display: none; position: relative; z-index: 1;">
                          <h3 id="bookmarks-count" class="${cls('Metadata-module__heading')}"></h3>
                          <div role="toolbar" aria-label="Actions" class="${cls('VisibleAndOverflowContainer-module__Box_0')}" style="gap: var(--base-size-4);">
                            <div class="${cls('VisibleItems-module__Box_1')}" style="gap: var(--base-size-4);">
                              <div data-action-bar-item="spinner" class="${cls('VisibleItem-module__Box_0')}"></div>
                              <div data-action-bar-item="sort-by" class="${cls('VisibleItem-module__Box_0')}" style="position: relative;">
                                <button type="button" id="bookmarks-sort-button" aria-haspopup="true" aria-expanded="false" class="${cls('prc-Button-ButtonBase')}" data-loading="false" data-size="medium" data-variant="invisible">
                                  <span data-component="buttonContent" class="${cls('prc-Button-ButtonContent')}">
                                    <span data-component="leadingVisual" class="${clsAll('prc-Button-Visual', 'prc-Button-VisualWrap')}">
                                      <svg aria-hidden="true" focusable="false" class="octicon octicon-sort-desc" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                        <path d="M0 4.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Zm0 4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75ZM13.5 10h2.25a.25.25 0 0 1 .177.427l-3 3a.25.25 0 0 1-.354 0l-3-3A.25.25 0 0 1 9.75 10H12V3.75a.75.75 0 0 1 1.5 0V10Z"></path>
                                      </svg>
                                    </span>
                                    <span data-component="text" class="${cls('prc-Button-Label')}">
                                      <span class="sr-only">Sort by </span>
                                      <span id="bookmarks-sort-label">Updated</span>
                                    </span>
                                    <span data-component="trailingAction" class="${clsAll('prc-Button-Visual', 'prc-Button-VisualWrap')}">
                                      <svg aria-hidden="true" focusable="false" class="octicon octicon-triangle-down" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                        <path d="m4.427 7.427 3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z"></path>
                                      </svg>
                                    </span>
                                  </span>
                                </button>
                                <ul id="bookmarks-sort-menu" class="${cls('prc-ActionList-ActionList')}" role="menu" aria-labelledby="bookmarks-sort-button" data-dividers="false" data-variant="inset" style="display: none; position: absolute; z-index: 100; background: var(--overlay-bgColor); border-radius: 12px; box-shadow: rgba(209, 217, 224, 0.5) 0px 0px 0px 1px, rgba(37, 41, 46, 0.04) 0px 6px 12px -3px, rgba(37, 41, 46, 0.12) 0px 6px 18px 0px; min-width: 192px; margin-top: 4px;">
                                  <li class="${cls('prc-ActionList-Group')}" role="none">
                                    <div role="presentation" aria-hidden="true" data-variant="subtle" data-component="GroupHeadingWrap" class="${cls('prc-ActionList-GroupHeadingWrap')}" style="padding: 6px 16px; margin: 0;"><span class="${cls('prc-ActionList-GroupHeading')}" style="font-size: 12px; font-weight: 600; color: var(--fgColor-muted);">Sort by</span></div>
                                    <ul role="group" class="${cls('prc-ActionList-GroupList')}">
                                      <li role="menuitemradio" class="${cls('prc-ActionList-ActionListItem')}" data-sort-criteria="updated" aria-checked="true">
                                        <div class="${cls('prc-ActionList-ActionListContent')}" data-size="medium">
                                          <span class="${clsAll('prc-ActionList-LeadingAction', 'prc-ActionList-VisualWrap')}">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-check" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
                                            </svg>
                                          </span>
                                          <span class="${cls('prc-ActionList-ActionListSubContent')}">
                                            <span class="${cls('prc-ActionList-ItemLabel')}">Last updated</span>
                                          </span>
                                        </div>
                                      </li>
                                      <li role="menuitemradio" class="${cls('prc-ActionList-ActionListItem')}" data-sort-criteria="bookmarked" aria-checked="false">
                                        <div class="${cls('prc-ActionList-ActionListContent')}" data-size="medium">
                                          <span class="${clsAll('prc-ActionList-LeadingAction', 'prc-ActionList-VisualWrap')}">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-check" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
                                            </svg>
                                          </span>
                                          <span class="${cls('prc-ActionList-ActionListSubContent')}">
                                            <span class="${cls('prc-ActionList-ItemLabel')}">Bookmarked on</span>
                                          </span>
                                        </div>
                                      </li>
                                      <li role="menuitemradio" class="${cls('prc-ActionList-ActionListItem')}" data-sort-criteria="repo" aria-checked="false">
                                        <div class="${cls('prc-ActionList-ActionListContent')}" data-size="medium">
                                          <span class="${clsAll('prc-ActionList-LeadingAction', 'prc-ActionList-VisualWrap')}">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-check" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
                                            </svg>
                                          </span>
                                          <span class="${cls('prc-ActionList-ActionListSubContent')}">
                                            <span class="${cls('prc-ActionList-ItemLabel')}">Repository</span>
                                          </span>
                                        </div>
                                      </li>
                                    </ul>
                                  </li>
                                  <li class="${cls('prc-ActionList-Divider')}" aria-hidden="true" data-component="ActionList.Divider"></li>
                                  <li class="${cls('prc-ActionList-Group')}" role="none">
                                    <div role="presentation" aria-hidden="true" data-variant="subtle" data-component="GroupHeadingWrap" class="${cls('prc-ActionList-GroupHeadingWrap')}" style="padding: 6px 16px; margin: 0;"><span class="${cls('prc-ActionList-GroupHeading')}" style="font-size: 12px; font-weight: 600; color: var(--fgColor-muted);">Order</span></div>
                                    <ul role="group" class="${cls('prc-ActionList-GroupList')}">
                                      <li role="menuitemradio" class="${cls('prc-ActionList-ActionListItem')}" data-sort-order="asc" aria-checked="false">
                                        <div class="${cls('prc-ActionList-ActionListContent')}" data-size="medium">
                                          <span class="${cls('prc-ActionList-Spacer')}"></span>
                                          <span class="${clsAll('prc-ActionList-LeadingAction', 'prc-ActionList-VisualWrap')}">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-check ${cls('prc-ActionList-SingleSelectCheckmark')}" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
                                            </svg>
                                          </span>
                                          <span class="${clsAll('prc-ActionList-LeadingVisual', 'prc-ActionList-VisualWrap')}">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-sort-asc" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="m12.927 2.573 3 3A.25.25 0 0 1 15.75 6H13.5v6.75a.75.75 0 0 1-1.5 0V6H9.75a.25.25 0 0 1-.177-.427l3-3a.25.25 0 0 1 .354 0ZM0 12.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Zm0-4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0-4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Z"></path>
                                            </svg>
                                          </span>
                                          <span class="${cls('prc-ActionList-ActionListSubContent')}">
                                            <span class="${cls('prc-ActionList-ItemLabel')}" id="order-asc-label">Oldest</span>
                                          </span>
                                        </div>
                                      </li>
                                      <li role="menuitemradio" class="${cls('prc-ActionList-ActionListItem')}" data-sort-order="desc" aria-checked="true">
                                        <div class="${cls('prc-ActionList-ActionListContent')}" data-size="medium">
                                          <span class="${cls('prc-ActionList-Spacer')}"></span>
                                          <span class="${clsAll('prc-ActionList-LeadingAction', 'prc-ActionList-VisualWrap')}">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-check ${cls('prc-ActionList-SingleSelectCheckmark')}" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
                                            </svg>
                                          </span>
                                          <span class="${clsAll('prc-ActionList-LeadingVisual', 'prc-ActionList-VisualWrap')}">
                                            <svg aria-hidden="true" focusable="false" class="octicon octicon-sort-desc" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; overflow: visible; vertical-align: text-bottom;">
                                              <path d="M0 4.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Zm0 4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75ZM13.5 10h2.25a.25.25 0 0 1 .177.427l-3 3a.25.25 0 0 1-.354 0l-3-3A.25.25 0 0 1 9.75 10H12V3.75a.75.75 0 0 1 1.5 0V10Z"></path>
                                            </svg>
                                          </span>
                                          <span class="${cls('prc-ActionList-ActionListSubContent')}">
                                            <span class="${cls('prc-ActionList-ItemLabel')}" id="order-desc-label">Newest</span>
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
                        <div id="bookmarks-empty" class="blankslate" role="region" aria-live="polite" aria-atomic="true" style="display: none;">
                          <h3 class="blankslate-heading">No bookmarked issues</h3>
                        </div>
                        <div id="bookmarks-list" class="${cls('ListView-module__ul')}" data-listview-component="items-list" data-density="default" tabindex="-1">
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div id="bookmarks-error" style="padding: 16px; color: #cf222e; background-color: #ffebe9; border: 1px solid #ff8182; border-radius: 6px; margin: 16px; display: none;"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);
  return template;
}

// Get template helper
function getTemplate(name) {
  const template = document.getElementById(name);
  return template.content.cloneNode(true);
}

// Render skeleton placeholder items
function renderSkeletonItems(count = 25) {
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const skeleton = getTemplate('skeleton-item');

    // Vary widths for visual interest (like GitHub does)
    const titleWidth = 50 + Math.random() * 30; // 50-80%
    const descWidth = 30 + Math.random() * 20;  // 30-50%

    const titleEl = skeleton.querySelector('.skeleton-title');
    const descEl = skeleton.querySelector('.skeleton-description');

    if (titleEl) titleEl.style.width = `${titleWidth}%`;
    if (descEl) descEl.style.width = `${descWidth}%`;

    fragment.appendChild(skeleton);
  }

  return fragment;
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

  // Ensure the nav item is present, injecting if needed
  function ensureNavItem() {
    const bookmarkNavItem = document.querySelector('li[data-extension-bookmarks-nav="true"]');
    if (!bookmarkNavItem) {
      const navList = document.querySelector('nav[aria-label="Default views"] ul');
      if (navList) {
        injectSidebarNavItem();
      }
    }
  }

  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    // Debounce: wait for mutations to settle before checking
    // This avoids fighting with React during active render cycles
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(ensureNavItem, 100);
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
    ensureNavItem();
    if (isBookmarksViewActive()) {
      showBookmarksView();
    }
  });
}

// formatDate is now in shared.js

async function fetchIssueDetails(owner, repo, number, type) {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'FETCH_ISSUE_DETAILS',
      data: { owner, repo, number, type }
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    return response.data;
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

// Render a single issue item by cloning the issue-item template and populating data
function renderIssueItem(issue) {
  let repoName = issue.repository?.full_name;
  if (!repoName && issue.html_url) {
    const match = issue.html_url.match(/github\.com\/([^/]+)\/([^/]+)\/issues/);
    if (match) repoName = `${match[1]}/${match[2]}`;
  }
  repoName = repoName || 'unknown/repository';

  const isOpen = issue.state === 'open';

  const fragment = getTemplate('issue-item');
  const wrapper = fragment.firstElementChild;

  // Set issue ID on the li element
  const li = wrapper.querySelector('li');
  li.setAttribute('data-issue-id', `${repoName}#${issue.number}`);

  // Title
  const titleLink = wrapper.querySelector('[data-slot="title-link"]');
  titleLink.href = issue.html_url;
  titleLink.textContent = issue.title;

  // Status icon
  const iconSlot = wrapper.querySelector('[data-slot="status-icon"]');
  const statusIcon = getIcon(isOpen ? 'open' : 'closed');
  statusIcon.setAttribute('color', isOpen ? 'var(--fgColor-open)' : 'var(--fgColor-done)');
  iconSlot.replaceWith(statusIcon);

  wrapper.querySelector('[data-slot="status-text"]').textContent =
    `Status: ${isOpen ? 'Open' : 'Closed'}.`;

  // Repo, number, author
  wrapper.querySelector('[data-slot="repo-name"]').textContent = repoName;
  wrapper.querySelector('[data-slot="issue-number"]').textContent = `#${issue.number}`;

  const authorLink = wrapper.querySelector('[data-slot="author-link"]');
  authorLink.href = issue.user?.html_url || '#';
  authorLink.textContent = issue.user?.login || 'unknown';

  // Timestamps
  const createdTime = wrapper.querySelector('[data-slot="created-time"]');
  createdTime.setAttribute('datetime', issue.created_at);
  createdTime.textContent = formatDate(issue.created_at);

  const updatedTime = wrapper.querySelector('[data-slot="updated-time"]');
  updatedTime.setAttribute('datetime', issue.updated_at);
  updatedTime.textContent = formatDate(issue.updated_at);

  // Comment count
  const commentIconSlot = wrapper.querySelector('[data-slot="comment-icon"]');
  commentIconSlot.replaceWith(getIcon('comment'));
  wrapper.querySelector('[data-slot="comment-count"]').textContent = issue.comments;

  return wrapper;
}

// Extract repository name from GitHub issue URL
function getRepoFromUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues/);
  return match ? `${match[1]}/${match[2]}` : 'unknown/repository';
}

// Sort issues based on selected order (e.g. "updated-desc", "repo-asc")
function sortIssues(issues, bookmarks, sortOrder) {
  const sorted = [...issues];

  // Parse "criteria-direction" format
  const parts = sortOrder.split('-');
  const direction = parts.pop(); // "asc" or "desc"
  const criteria = parts.join('-') || 'updated';
  const ascending = direction === 'asc';

  // Key extraction functions for each criteria
  function getUpdatedTime(issue) {
    return new Date(issue.updated_at).getTime();
  }

  function getBookmarkedTime(issue) {
    const id = getBookmarkIdFromUrl(issue.html_url);
    return (id && bookmarks[id]?.bookmarkedAt) || 0;
  }

  function getRepo(issue) {
    return getRepoFromUrl(issue.html_url).toLowerCase();
  }

  switch (criteria) {
    case 'updated':
      sorted.sort((a, b) => ascending
        ? getUpdatedTime(a) - getUpdatedTime(b)
        : getUpdatedTime(b) - getUpdatedTime(a));
      break;

    case 'bookmarked':
      sorted.sort((a, b) => ascending
        ? getBookmarkedTime(a) - getBookmarkedTime(b)
        : getBookmarkedTime(b) - getBookmarkedTime(a));
      break;

    case 'repo':
      sorted.sort((a, b) => {
        const cmp = getRepo(a).localeCompare(getRepo(b));
        const dir = ascending ? 1 : -1;
        return cmp !== 0 ? cmp * dir : (a.number - b.number) * dir;
      });
      break;

    default:
      sorted.sort((a, b) => getUpdatedTime(b) - getUpdatedTime(a));
  }

  return sorted;
}

// Load and render all bookmarked issues
async function loadAndRenderBookmarks() {
  const container = document.querySelector('[data-extension-bookmarks-container]');
  if (!container) return;

  const error = container.querySelector('#bookmarks-error');
  const empty = container.querySelector('#bookmarks-empty');
  const list = container.querySelector('#bookmarks-list');
  const resultsSection = container.querySelector('#bookmarks-results-section');

  // Ensure required elements exist
  if (!error || !list) {
    console.warn('[Bookmarked] Required elements not found in container');
    return;
  }

  // Show skeleton placeholders while loading (25 to match page size)
  error.style.display = 'none';
  if (empty) empty.style.display = 'none';
  // Hide header during loading - will show with actual count when data loads
  const countHeading = container.querySelector('#bookmarks-count');
  if (resultsSection) {
    resultsSection.style.display = 'none';
  }
  list.replaceChildren(renderSkeletonItems(25));

  try {
    const bookmarks = await getBookmarks();
    const bookmarkIds = Object.keys(bookmarks);

    if (bookmarkIds.length === 0) {
      list.replaceChildren();
      if (empty) empty.style.display = 'block';
      // Show header with 0 results
      if (resultsSection && countHeading) {
        countHeading.textContent = '0 results';
        resultsSection.style.display = 'flex';
      }
      return;
    }

    // Load sort preference
    const sortResult = await browser.storage.sync.get(['bookmarks_sort_order']);
    const sortOrder = sortResult.bookmarks_sort_order || 'updated-desc';

    // Convert bookmarks object to array for processing
    const bookmarkArray = Object.values(bookmarks);

    let validIssues = [];
    let failedCount = 0;

    // Try batch GraphQL first (2 requests for all issues)
    try {
      console.log('[Bookmarked] Fetching issues via batch GraphQL...');
      validIssues = await fetchBookmarkedIssuesViaGraphQL(bookmarkArray);
      console.log('[Bookmarked] GraphQL batch fetch succeeded:', validIssues.length, 'issues');

      // Check if any bookmarks weren't found
      const foundCount = validIssues.length;
      const totalCount = bookmarkArray.length;
      if (foundCount < totalCount) {
        failedCount = totalCount - foundCount;
        console.warn('[Bookmarked] Some issues not found via GraphQL:', failedCount, 'of', totalCount);
      }
    } catch (graphqlError) {
      console.warn('[Bookmarked] GraphQL batch fetch failed, falling back to REST API:', graphqlError.message);

      // Fallback: Fetch all issue details individually via REST API
      const issuePromises = bookmarkArray.map(bookmark =>
        fetchIssueDetails(bookmark.owner, bookmark.repo, bookmark.number, bookmark.type)
      );

      const issues = await Promise.all(issuePromises);
      validIssues = issues.filter(issue => issue && !issue._error);
      const failedIssues = issues.filter(issue => issue && issue._error);
      failedCount = failedIssues.length;

      if (failedCount > 0) {
        const errors = failedIssues.map(issue => issue._error).join(', ');
        console.warn('[Bookmarked] REST API errors:', errors);
      }
    }

    if (validIssues.length === 0) {
      list.replaceChildren();
      // Show header with 0 results
      if (resultsSection && countHeading) {
        countHeading.textContent = '0 results';
        resultsSection.style.display = 'flex';
      }
      if (failedCount > 0) {
        // All fetches failed - show error
        error.style.display = 'block';
        error.textContent = `Failed to load issue details. You may need to log in to GitHub.`;
      } else {
        // Genuinely no bookmarks
        if (empty) empty.style.display = 'block';
      }
      return;
    }

    // Show warning if some (but not all) issues failed to load
    if (failedCount > 0) {
      error.style.display = 'block';
      error.textContent = `Warning: ${failedCount} of ${bookmarkArray.length} issues could not be loaded.`;
    }

    // Cache fetched data so sort changes can re-render without re-fetching
    cachedIssueData = { issues: validIssues, bookmarks };

    // Sort issues based on preference
    const sortedIssues = sortIssues(validIssues, bookmarks, sortOrder);

    // Show header with result count
    if (resultsSection && countHeading) {
      const count = sortedIssues.length;
      countHeading.textContent = `${count} result${count !== 1 ? 's' : ''}`;
      resultsSection.style.display = 'flex';
    }

    // Clear skeleton placeholders and render actual issues
    list.replaceChildren();
    sortedIssues.forEach(issue => {
      const item = renderIssueItem(issue);
      list.appendChild(item);
    });

    setupFilterInput();
    setupSortDropdown();

  } catch (e) {
    console.error('[Bookmarked] Error loading bookmarks:', e);
    list.replaceChildren();
    if (resultsSection) resultsSection.style.display = 'none';
    error.style.display = 'block';
    error.textContent = `Failed to load bookmarked issues: ${e.message}`;
  }
}

// Re-sort and re-render from cached data (no network requests)
function resortAndRerender(sortOrder) {
  if (!cachedIssueData) return;

  const { issues, bookmarks } = cachedIssueData;
  const container = document.querySelector('[data-extension-bookmarks-container]');
  if (!container) return;

  const list = container.querySelector('#bookmarks-list');
  const resultsSection = container.querySelector('#bookmarks-results-section');
  const countHeading = container.querySelector('#bookmarks-count');
  if (!list) return;

  const sortedIssues = sortIssues(issues, bookmarks, sortOrder);

  if (resultsSection && countHeading) {
    const count = sortedIssues.length;
    countHeading.textContent = `${count} result${count !== 1 ? 's' : ''}`;
    resultsSection.style.display = 'flex';
  }

  list.replaceChildren();
  sortedIssues.forEach(issue => {
    list.appendChild(renderIssueItem(issue));
  });

  // Re-apply active filter text
  const filterInput = container.querySelector('#bookmarks-filter');
  if (filterInput && filterInput.value) {
    filterInput.dispatchEvent(new Event('input'));
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

// Cached issue data from last fetch, used by sort to avoid re-fetching
let cachedIssueData = null;

// AbortController for sort dropdown's document click listener (cleaned up on re-init)
let sortDropdownAbort = null;

// Debounce timeout for cross-tab bookmark sync
let refreshDebounceTimeout = null;
const REFRESH_DEBOUNCE_MS = 25;

// Setup listener for bookmark changes from other tabs/popup
function setupStorageListener() {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (!changes.bookmarked_issues) return;

    // Only refresh if bookmarks view is currently visible
    const container = document.querySelector('[data-extension-bookmarks-container]');
    if (!container) return;

    // Debounce to batch rapid changes (e.g., bulk import)
    clearTimeout(refreshDebounceTimeout);
    refreshDebounceTimeout = setTimeout(() => {
      console.log('[Bookmarked] Storage changed, reloading bookmarks');
      cachedIssueData = null;
      loadAndRenderBookmarks();
    }, REFRESH_DEBOUNCE_MS);
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
      const iconName = currentOrder === 'desc' ? 'sort-desc' : 'sort-asc';
      const newIcon = getIcon(iconName);
      if (newIcon) {
        buttonIcon.replaceWith(newIcon);
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

      // Show/hide checkmark icon (sort icons always visible)
      const checkmark = item.querySelector('.octicon-check');
      if (checkmark) {
        checkmark.style.visibility = isChecked ? 'visible' : 'hidden';
      }
    });
  }

  async function saveAndReload() {
    const sortOrder = `${currentCriteria}-${currentOrder}`;
    await browser.storage.sync.set({ bookmarks_sort_order: sortOrder });
    closeMenu();
    if (cachedIssueData) {
      resortAndRerender(sortOrder);
    } else {
      await loadAndRenderBookmarks();
    }
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

  // Close menu on outside click (abort previous listener if re-initialized)
  if (sortDropdownAbort) sortDropdownAbort.abort();
  sortDropdownAbort = new AbortController();

  document.addEventListener('click', (e) => {
    if (!sortButton.contains(e.target) && !sortMenu.contains(e.target)) {
      closeMenu();
    }
  }, { signal: sortDropdownAbort.signal });

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
  // Discover CSS class hashes and build templates lazily (not at init time)
  // so that GitHub's stylesheets are fully loaded by the time the user clicks Bookmarked.
  discoverCssClasses();
  setupTemplates();

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

// Check if current page is an /issues page
function isIssuesPage() {
  const path = window.location.pathname;
  return path === '/issues' || path.startsWith('/issues/');
}

// Full initialization for /issues pages
function initIssuesPage() {
  console.log('[Bookmarked] Initializing content script for /issues page');

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

  // Listen for bookmark changes from other tabs/popup
  setupStorageListener();

  console.log('[Bookmarked] Content script initialization complete');
}

// Track current URL to detect SPA navigation to /issues
let currentUrl = location.href;

// Watch for SPA navigation to /issues from non-/issues pages
function setupNavigationWatcher() {
  let navigationTimeout = null;

  const observer = new MutationObserver(() => {
    const newUrl = location.href;
    if (newUrl === currentUrl) return;

    const oldPath = new URL(currentUrl).pathname;
    currentUrl = newUrl;
    const newPath = new URL(newUrl).pathname;

    const wasOnIssues = oldPath === '/issues' || oldPath.startsWith('/issues/');
    const nowOnIssues = newPath === '/issues' || newPath.startsWith('/issues/');

    if (nowOnIssues && !wasOnIssues) {
      console.log('[Bookmarked] SPA navigation to /issues detected');
      // Debounce to let React finish rendering
      clearTimeout(navigationTimeout);
      navigationTimeout = setTimeout(() => {
        initIssuesPage();
      }, 100);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log('[Bookmarked] Navigation watcher started');
}

// Initialize the script
function init() {
  if (isIssuesPage()) {
    initIssuesPage();
  } else {
    // Not on /issues — watch for SPA navigation to /issues
    setupNavigationWatcher();
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
