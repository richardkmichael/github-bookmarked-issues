# GitHub Page Operation - Technical Reference

This document captures learnings about how GitHub's website operates internally, useful for building browser extensions that integrate with GitHub.

## Page Architecture

### React Application Structure

GitHub's issues pages (`github.com/issues/*`) are React applications:

```html
<div class="application-main">
  <main>
    <react-app app-name="issues-react">
      <!-- All view content rendered by React -->
    </react-app>
  </main>
</div>
```

Key observations:
- The React app controls all content within `<react-app>`
- React re-renders can destroy injected DOM elements
- Extensions must use MutationObserver on a stable parent (e.g., `div.application-main`) to detect and re-inject content after re-renders

### Client-Side Navigation

GitHub uses client-side routing (likely React Router):
- Clicking between views (e.g., "Created by me" to "Assigned to me") doesn't trigger full page reload
- URL changes via History API
- React app fetches data and re-renders content
- Direct navigation to a custom route (e.g., `/issues/bookmarked`) causes 404 since React router doesn't know about it

Best practice: Navigate to a built-in view first, then click to custom view.

## GraphQL API

### Internal GraphQL Endpoint

GitHub uses an internal GraphQL endpoint for its own UI:

- URL: `https://github.com/_graphql`
- Method: GET
- Authentication: Session cookies (automatic via `credentials: 'same-origin'`)
- No rate limits (uses user's session, not API quota)

**Critical Restriction: Sec-Fetch-Site Header**

GitHub validates the `Sec-Fetch-Site` request header and rejects requests that aren't `same-origin`:

```json
{
  "errors": [{
    "type": "INTERNAL",
    "message": "Expected value for header `sec-fetch-site` is `same-origin`, but received `none`.",
    "extensions": { "code": "invalidHeader" }
  }]
}
```

The browser sets this header automatically based on request context:

| Context                      | Sec-Fetch-Site | Result     |
|------------------------------|----------------|------------|
| Content script (github.com)  | `same-origin`  | ✓ Works    |
| Extension popup              | `none`         | ✗ Rejected |
| Background service worker    | `none`         | ✗ Rejected |

This means **only content scripts** running in the github.com context can use the internal GraphQL endpoint. Extension popups and background scripts cannot, even with `credentials: 'include'` and proper `host_permissions`.

### Request Format

```javascript
const url = 'https://github.com/_graphql?body=' + encodeURIComponent(JSON.stringify({
  persistedQueryName: "QueryName",
  query: "hash_value",  // MD5-like hash identifying the query
  variables: {
    // Query-specific variables
  }
}));

const response = await fetch(url, {
  headers: {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  },
  credentials: 'same-origin'
});
```

### Persisted Queries

GitHub uses persisted queries (pre-registered on server):
- Queries identified by hash, not full GraphQL text
- Hash appears to be MD5 of the query text
- Hashes can change when GitHub updates their frontend
- If hash is invalid, response includes `errors[].type === 'unknownQuery'`

### Discovering Query Hashes

Query hashes can be discovered from:

1. Link Header (during navigation):
   ```
   Link: <https://github.com/_graphql?body=...>; rel="preload"; as="fetch"
   ```
   The `body` parameter contains the encoded query with hash.

2. Network traffic inspection:
   - Open DevTools Network tab
   - Filter by `_graphql`
   - Observe requests made by GitHub's UI

### Known Persisted Queries

| Query Name | Hash | Purpose |
|------------|------|---------|
| `IssueDashboardKnownViewPageQuery` | `e02318ebeb8613553613ac1ebdbb7a4b` | Main issue search/list (SSR) |
| `IssueRowSecondaryQuery` | `c5aa81956ee8f848ea72a183fef833c9` | Supplementary issue metadata |
| `IssueViewerSecondaryViewQuery` | `0fa9695082c7a84f6fdb66cac112ba18` | Issue page sidebar |
| `NewTimelinePaginationBackQuery` | `1d0c85e346fdb084cf7580ae118d1d60` | Issue timeline/comments |

### Query Details

#### IssueDashboardKnownViewPageQuery (Primary - Use This)

This is the main query used by GitHub's /issues views. Returns comprehensive issue data.

Variables:
```json
{
  "query": "is:issue state:open archived:false author:@me sort:updated-desc",
  "skip": 0
}
```

Returns per issue:
- `id` - GitHub global node ID (e.g., `I_kwDOQMXXOs7dlMrd`)
- `number` - Issue number
- `title` - Issue title
- `createdAt` - ISO timestamp
- `updatedAt` - ISO timestamp
- `state` - OPEN or CLOSED
- `author.login` - Author username
- `author.name` - Author display name
- `repository.name` - Repository name
- `repository.owner.login` - Repository owner
- `labels.edges` - Issue labels
- `milestone` - Milestone info
- `assignedActors.edges` - Assignees

Usage for bookmarked issues:
```javascript
// Batch query for multiple issues
// NOTE: GitHub search does partial matching on numbers, so filter results client-side
const bookmarks = [
  { owner: 'microsoft', repo: 'playwright', number: 38643 },
  { owner: 'rails', repo: 'rails', number: 3508 }
];

// Build search query - in:number does substring matching
const parts = bookmarks.map(b => `(repo:${b.owner}/${b.repo} in:number ${b.number})`);
const searchQuery = 'is:issue ' + parts.join(' OR ');

const url = 'https://github.com/_graphql?body=' + encodeURIComponent(JSON.stringify({
  persistedQueryName: 'IssueDashboardKnownViewPageQuery',
  query: 'e02318ebeb8613553613ac1ebdbb7a4b',
  variables: {
    query: searchQuery,
    skip: 0
  }
}));

const response = await fetch(url, {
  headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  credentials: 'same-origin'
});

const data = await response.json();
const edges = data.data?.search?.edges || [];

// Filter to exact matches (search returns partial matches)
const exactMatches = edges.filter(e => {
  const node = e.node;
  const repo = `${node.repository.owner.login}/${node.repository.name}`;
  return bookmarks.some(b =>
    `${b.owner}/${b.repo}` === repo && b.number === node.number
  );
});
```

Limitations:
- `in:number 3508` matches any issue containing "3508" in the number (e.g., 23508, 35081)
- Must filter results client-side to get exact matches
- Single request can batch multiple issues, reducing API calls

#### IssueRowSecondaryQuery (Supplementary)

Used to fetch additional metadata for issues already displayed. Takes node IDs.

Variables:
```json
{
  "includeReactions": false,
  "nodes": ["I_kwDOQMXXOs7dlMrd", "I_kwDOAUJXoM7cX_qV"]
}
```

Returns per issue:
- `id` - Node ID
- `state` - OPEN or CLOSED
- `totalCommentsCount` - Comment count
- `assignedActors` - Assignees
- `subIssuesSummary` - Sub-issue progress
- `issueDependenciesSummary` - Dependency info

Note: Does NOT return title, author, dates - those come from the primary query.

#### IssueViewerSecondaryViewQuery (Issue Page Only)

Used on individual issue pages for sidebar data. NOT suitable for list views.

Variables:
```json
{
  "markAsRead": false,
  "number": 3508,
  "owner": "rails",
  "repo": "rails"
}
```

Returns: title, number, state, participants, milestone, but NOT createdAt, updatedAt, or author.

### Query Limitations

Different queries return different fields. For example, `IssueViewerSecondaryViewQuery`:
- Returns: title, number, state, participants, milestone
- Missing: createdAt, updatedAt, author, comments.totalCount

Always validate that required fields are present in the response.

## REST API Comparison

### Endpoint
- URL: `https://api.github.com/repos/{owner}/{repo}/issues/{number}`
- Authentication: None (public repos) or PAT
- Rate limit: 60 requests/hour (unauthenticated), 5000/hour (authenticated)
- No batch endpoint: Each issue requires a separate request

### CORS and Extension Context

**Content scripts** cannot directly call `api.github.com` due to CORS:
- Browser blocks cross-origin requests from content scripts
- Solution: Route requests through background service worker

**Background scripts and popups** can call `api.github.com`:
- Not subject to CORS restrictions (with `host_permissions`)
- This is the only way for extension UI (popup) to fetch issue data
- Subject to rate limits (60/hour unauthenticated)

### Response Format

REST API returns comprehensive issue data:
```json
{
  "number": 3508,
  "title": "Issue title",
  "state": "open",
  "html_url": "https://github.com/owner/repo/issues/3508",
  "created_at": "2011-11-03T...",
  "updated_at": "2024-12-15T...",
  "comments": 16,
  "user": {
    "login": "username",
    "html_url": "https://github.com/username"
  }
}
```

## Capturing Data Passively

### webRequest API

The `webRequest` API can intercept HTTP traffic without making additional requests:

```javascript
browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    const linkHeader = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'link'
    );
    // Extract data from headers
  },
  { urls: ['https://github.com/*/*/issues/*'] },
  ['responseHeaders']
);
```

Use cases:
- Capture GraphQL query hashes from preload hints
- Monitor for specific response patterns
- Zero latency overhead (piggybacks on normal navigation)

## CSS Module Classes

GitHub uses CSS modules with generated hash suffixes:

```
Search-module__SearchContainer--CkrWX
ListItems-module__listContainer--sgptj
ListView-module__container--rxCWy
Metadata-module__container--ydeM8
```

These class names:
- Are stable within a deployment
- May change between deployments
- Should be copied exactly when matching GitHub's styling

## Authentication State

### Detecting Login Status

When user is not logged in:
- GraphQL requests may return different data or errors
- Some queries may fail entirely
- Extension should handle gracefully and show appropriate message

### Session Cookies

GitHub session is maintained via cookies:
- `user_session` - main session cookie
- `__Host-user_session_same_site` - SameSite variant
- Cookies sent automatically with `credentials: 'same-origin'`

## Best Practices for Extensions

1. Use GraphQL from content scripts (no rate limits, batch queries)
2. Use REST API from popup/background (only option due to Sec-Fetch-Site)
3. Route REST requests through background script when called from content scripts (CORS)
4. Validate GraphQL responses for required fields
5. Use MutationObserver for React re-render resilience
6. Cache query hashes to storage.sync (survives service worker restarts)
7. Handle hash expiration gracefully (discover new hashes from Link headers)
8. Never assume field presence - use optional chaining

## Rate Limit Considerations

### Primary Limits

| Method                 | Limit      | Notes                        |
|------------------------|------------|------------------------------|
| GraphQL (internal)     | None       | Uses session, not API quota  |
| REST (unauthenticated) | 60/hour    | Per IP address               |
| REST (with PAT)        | 5,000/hour | Per token                    |

### Secondary Limits (REST API)

These apply regardless of authentication:

| Limit Type          | Value            | Notes                              |
|---------------------|------------------|------------------------------------|
| Concurrent requests | 100 max          | Shared across REST and GraphQL     |
| Per-endpoint        | 900 points/min   | GET/HEAD/OPTIONS: 1 pt, others: 5  |
| CPU time            | 90s per 60s real | Computation limit                  |
| Content creation    | 80/min, 500/hour | Rate for creating content          |

### Implications for Extensions

For users with 100+ bookmarks:
- Pagination is essential to stay within limits
- GraphQL (internal) is preferred - no rate limits for logged-in users
- REST API requires careful batching (recommend 20 items per page)

## Architectural Constraints Summary

Due to the Sec-Fetch-Site restriction, extension components have different capabilities:

| Component      | GraphQL (internal) | REST API       | Use Case                            |
|----------------|--------------------| ---------------|-------------------------------------|
| Content script | ✓ Yes              | Via background | Bookmarks view on github.com/issues |
| Popup          | ✗ No               | ✓ Yes          | Toolbar popup (rate-limited)        |
| Background     | ✗ No               | ✓ Yes          | API proxy for content scripts       |

This creates an architectural asymmetry:
- The bookmarks view (content script) can use efficient batch GraphQL queries
- The popup must use REST API (60/hour unauthenticated, 5,000/hour with PAT)
- No shared data-fetching code between them is practical

Mitigation strategies for popup rate limits:
- Fine-grained PAT via extension options page (5,000/hour vs 60/hour)
- Issue data cached in `storage.local` with automatic fallback when rate-limited
- Rate limit errors show cached data if available, otherwise prompt for PAT setup
