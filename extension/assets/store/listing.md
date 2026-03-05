# Shared store information

Shared store information for cut-and-paste.

## Summary

Track your bookmarked GitHub issues across all repositories with cross-device sync

## Description

```
Bookmark any issue from its page and find it later in one place.  GitHub Bookmarked Issues adds a
Bookmarked view to github.com/issues, alongside GitHub's built-in views.

Features:

- Bookmark button on every GitHub issue page
- Bookmarked view at github.com/issues with search, sort and filter
- Cross-device sync via your browser's built-in sync (Google Account or
  Firefox Account)
- Toolbar icon for quick access to all bookmarked issues
- Copy bookmarked issues as Markdown links
- Import issues from GitHub URLs
- Works without authentication; optional GitHub PAT for higher API rate limits

Permissions:

- Storage: saves your bookmarks and preferences
- Web Request: discovers GitHub API parameters for compatibility
- Host permissions (github.com, api.github.com): adds bookmark buttons to
  issue pages and fetches issue details from GitHub's API

No data is sent to any server other than GitHub's API. No analytics or tracking. Fully open source.
```

Source code: https://github.com/richardkmichael/github-bookmarked-issues

# Specific store information

## Firefox Add-on

Add description, icon and screenshots to the Firefox Addons listing using the [Add-on Developer Hub](https://addons.mozilla.org/en-US/developers/addon/github-bookmarked-issues/edit):

```
  > Edit Product Page
    > Add screenshots
    > Add 128x128 icon (`assets/icon-128.png`)
```

Screenshot captions:

1. `Toolbar icon for quick access to bookmarked issues.`
2. `Bookmark button on each GitHub Issue page.`
3. `Bookmarked view added alongside native views.`
4. `Optional: configure a read-only PAT for higher API rate limits.`

## Chrome Web Store

Add description, icon and screenshots to the Chrome Web Store listing using the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/c4788956-5ef1-486f-abc2-4acc9ea32cb2/kdfehpmalbfoffnicnelgdnlkfomlhbd/edit/listing):

### Privacy practices justifications:

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

# Taking screenshots

## macOS

Size browser window to 1168 x 688 (accommodates window shadow), then screenshot window: `Option+Shift+4 - Space`.
