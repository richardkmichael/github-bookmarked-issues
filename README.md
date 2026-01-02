## Features

- **Bookmark button** on GitHub issue pages
- **Popup** - Click extension icon to see bookmarks, copy as markdown, import from URLs
- **Bookmarks View** - Custom view at `github.com/issues/bookmarked` (requires login)
- **Settings** - Configure GitHub PAT for higher API rate limits

## How it works

### API Strategy

| Context        | API     | Why                                                                          |
|----------------|---------|------------------------------------------------------------------------------|
| Bookmarks View | GraphQL | Runs in github.com context, uses session cookies, 2 requests for all issues |
| Popup          | REST    | Extension context, GraphQL blocked by `Sec-Fetch-Site` header                |

### GraphQL (Bookmarks View)

The bookmarks view uses GitHub's internal GraphQL API via persisted queries:
- `IssueDashboardKnownViewPageQuery` - fetches issue metadata in batch
- `IssueRowSecondaryQuery` - fetches comment counts

This provides fast loading (2 requests vs N) and no rate limits for logged-in users.
Hash discovery in background.js auto-recovers when GitHub updates query hashes.

### REST API + PAT (Popup)

The popup uses GitHub's REST API via the background service worker:
- Without PAT: 60 requests/hour
- With PAT: 5,000 requests/hour

Configure a fine-grained PAT in extension settings for higher rate limits.
Issues are cached in `storage.local` to serve from cache when rate-limited.

See [GITHUB_OPERATION.md](GITHUB_OPERATION.md) for detailed technical documentation.

## Development

`npm run build`, then load code from:

- build/chrome/
- build/firefox/

### Chrome

URL: `chrome://extensions`

```
  > Load unpacked
```

### Firefox

URL: `about:debugging`

```
> This Firefox
  > Load Temporary Add-on...
```

## Debugging

### Chrome

URL: `chrome://extensions`

 - `Inspect views service worker` to open devtools for the extension

Install Chrome Canary to allow the chrome-devtools MCP to autoconnect to Chrome to allow Claude to
control and debug, see `.mcp.json`.

### Firefox

```
Firefox devtools > Settings
  > Enable browser chrome and add-on debugging toolboxes
  > Enable remote debugging
```

URL: `about:debugging`

```
> This Firefox
  > GitHub Bookmarked Issues
    > Inspect
```

In the extension devtools window, the `browser` (also as `chrome`) API is available.


## Data Storage

| Key                    | Storage        | Description                          |
|------------------------|----------------|--------------------------------------|
| `bookmarked_issues`    | `storage.sync` | Bookmarks (syncs across devices)     |
| `github_pat`           | `storage.sync` | PAT token (syncs across devices)     |
| `bookmarks_sort_order` | `storage.sync` | Sort preference                      |
| `issue_cache`          | `storage.local`| Cached issue data (device-only, 5MB) |
| `graphql_hashes`       | `storage.sync` | Discovered GraphQL hashes            |

Query stored data (Firefox):
```
$ sqlite3 ${PROFILE_DIR}/storage-sync-v2.sqlite "select data from storage_sync_data where ext_id = 'github-bookmarked-issues@extensions'" | jq
```

## Testing

```
npm test
```

Runs Playwright tests against Chrome. Tests cover:
- Extension loading
- Popup UI and functionality
- Options page (PAT configuration)
- API request authentication
- Bookmarks view (skipped - requires GitHub login)

### References

- [Playwright Chrome extensions](https://playwright.dev/docs/chrome-extensions)
- Firefox extension testing not supported by Playwright ([#7297](https://github.com/microsoft/playwright/issues/7297))
