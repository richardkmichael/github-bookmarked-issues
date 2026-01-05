## Features

- **Bookmark button** on GitHub issue pages
- **Popup** - View bookmarks, copy as markdown, import from URLs
- **Bookmarks View** - Custom view at `github.com/issues/bookmarked` (requires login)
- **Options** - Configure GitHub PAT for higher API rate limits

## How it works

The Bookmarks view uses GitHub's internal GraphQL API (no rate limits for logged-in users).
The popup uses REST API - configure a PAT in options for higher limits (5,000/hr vs 60/hr).

See [GITHUB_OPERATION.md](GITHUB_OPERATION.md) for technical details.

## Development

See [BUILD.md](BUILD.md) for complete build instructions, development workflow, and testing setup.

Quick start:

```bash
npm install
npm run build        # Build both browsers
npm run dev:watch    # Auto-rebuild on changes
npm test             # Run Playwright tests
```

## Data Storage

| Key                    | Storage         | Description                          |
|------------------------|-----------------|--------------------------------------|
| `bookmarked_issues`    | `storage.sync`  | Bookmarks (syncs across devices)     |
| `github_pat`           | `storage.sync`  | PAT token (syncs across devices)     |
| `bookmarks_sort_order` | `storage.sync`  | Sort preference                      |
| `issue_cache`          | `storage.local` | Cached issue data (device-only, 5MB) |
| `discovered_hashes`    | `storage.sync`  | GraphQL query hashes (auto-updated)  |

## Privacy & Security

- No external servers - all data stays in browser storage
- No tracking or analytics
- Bookmark data syncs via browser account (Chrome/Firefox sync)
- Optional GitHub PAT stored in `storage.sync` if configured
- Issue cache stored in `storage.local` (device-only, not synced)
- Open source - inspect the code yourself

## Browser Compatibility

| Browser         | Status | Notes                       |
|-----------------|--------|-----------------------------|
| Chrome          | 123+   | Tested                      |
| Edge            | 123+   | Chromium-based, should work |
| Firefox Desktop | 128+   | Tested                      |
| Firefox Android | -      | No `storage.sync` support   |
| Safari          | -      | Not investigated            |

## Known Limitations

- **Bookmarks view navigation**: Must navigate from a built-in view (e.g., `/issues/created`), then click "Bookmarked". Direct URL navigation to `/issues/bookmarked` returns 404 (GitHub's React router doesn't know the route).
