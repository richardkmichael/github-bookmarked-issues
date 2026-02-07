# Store Listing

## Short Description (used in both stores, 82 chars)

Track your bookmarked GitHub issues across all repositories with cross-device sync

## Detailed Description

This extension adds a "Bookmarked" view to github.com/issues, alongside GitHub's built-in views like
"Created" and "Assigned." Bookmark any issue from its page and find it later in the toolbar popup
or GitHub view.

Features:

- Bookmark button on every GitHub issue page
- Bookmarked view at github.com/issues, integrated with GitHub's native UI
- Toolbar popup for quick access to all bookmarked issues
- Cross-device sync via browser sync (using your Google or Firefox account)
- Uses Markdown lists for easy import/export
- Works without authentication; optional GitHub PAT for higher API rate limits

Permissions:

- Storage: saves your bookmarks and preferences
- Web Request: discovers GitHub API parameters for compatibility
- Host permissions (github.com, api.github.com): adds bookmark buttons to
  issue pages and fetches issue details from GitHub's API

No data is sent to any server other than GitHub's API. No analytics or tracking. Fully open source.

Source code: https://github.com/richardkmichael/github-bookmarked-issues

## Chrome Web Store

Privacy practices justifications:

### Storage

Stores the user's bookmarked issues, sort preference, and an optional GitHub personal access token
in sync storage (for cross-device sync). Caches fetched issue data in local storage to reduce API
calls and provide fallback when rate-limited.

### webRequest

Listens for HTTP response headers on github.com navigation to discover GraphQL query hashes from
Link preload hints. These hashes are required to fetch issue data from GitHub's internal API. No
request data is modified or redirected.

### Host permissions

Content scripts on github.com add a bookmark button to issue pages and inject a Bookmarked view into
github.com/issues. Requests to api.github.com fetch issue details (title, state, author) for display
in the toolbar popup.

### Remote code

This extension does not use remote code. All JavaScript is bundled in the extension package.

## Categories

Chrome Web Store: Productivity
Firefox AMO: Other (no exact match; alternatively: Web Development)
