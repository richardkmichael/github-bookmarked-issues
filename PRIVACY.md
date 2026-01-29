# Privacy Policy

GitHub Bookmarked Issues is a browser extension that lets you bookmark and
track GitHub issues. This policy explains what data the extension handles and
how.

## Data Stored

All data is stored locally in your browser using the Web Extensions Storage
API. No data is sent to any server operated by this extension.

**Synced storage** (`browser.storage.sync`) — synced across your devices by
your browser's built-in sync service (Google Account for Chrome, Firefox
Account for Firefox):

- Bookmarked issue identifiers (repository owner, name, and issue number)
- Sort order preference
- GitHub Personal Access Token (PAT), if you choose to configure one
- GitHub GraphQL query hashes (for API compatibility)

**Local storage** (`browser.storage.local`) — stored on the current device
only:

- Cached issue data (titles, states, labels) fetched from GitHub's API

## Data Transmitted

The extension makes requests only to GitHub's API (`api.github.com`) to fetch
issue details for your bookmarked issues. If you configure a Personal Access
Token, it is sent to GitHub as an authorization header with these API requests.

No data is sent to any other server. There is no analytics, telemetry, or
tracking of any kind.

## Permissions

- **storage**: Store bookmarks, preferences, and cached issue data
- **webRequest**: Discover GitHub's internal API parameters for compatibility
- **host_permissions** (`github.com`, `api.github.com`): Access GitHub pages
  to add bookmark buttons and fetch issue data from GitHub's API

## Third Parties

The extension loads a CSS stylesheet from `unpkg.com` (a CDN for npm packages)
to style the Bookmarks view with GitHub's Primer design system. This request
is subject to unpkg's privacy policy. No user data is included in this request.

## Open Source

This extension is open source. You can inspect the code at:
https://github.com/richardkmichael/github-bookmarked-issues

## Contact

For questions about this privacy policy, open an issue at:
https://github.com/richardkmichael/github-bookmarked-issues/issues
