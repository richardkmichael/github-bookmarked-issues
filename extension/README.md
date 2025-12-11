# GitHub Subscribed Issues Tracker - Browser Extension

A privacy-first browser extension to track your subscribed GitHub issues across all repositories with automatic cross-device sync.

## Why This Extension?

GitHub's native interface doesn't provide a way to view all your subscribed issues in one place. While the REST API supports `filter=subscribed`, it only returns issues from repositories you own, are a member of, or belong to your organizations - **not arbitrary public repositories**.

This extension solves the problem by:
- Capturing subscribe/unsubscribe actions as you browse GitHub
- Storing minimal data (only IDs) in browser sync storage
- Syncing your subscriptions across all your devices automatically
- **No backend server** - completely privacy-first
- Works with ANY repository on GitHub

## Features

- ✅ Capture subscriptions from any GitHub repository
- ✅ Cross-device sync via browser account (Firefox/Chrome)
- ✅ Privacy-first: no external servers, no tracking
- ✅ Minimal storage: only issue IDs synced (~50-100 issues supported)
- ✅ Clean popup interface using GitHub's Primer CSS
- ✅ Real-time issue status from GitHub API
- ✅ Handles GitHub's Turbo navigation

## Installation

### Chrome / Edge / Brave

1. Open `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` directory
5. The extension icon should appear in your toolbar

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Navigate to the `extension` directory
4. Select `manifest.json`
5. The extension will load temporarily (persists until browser restart)

For permanent installation in Firefox:
- Package as `.xpi` and self-host, or
- Submit to Firefox Add-ons (requires review)

## Usage

1. **Subscribe to issues on GitHub**:
   - Navigate to any GitHub issue or pull request
   - Click the "Subscribe" button
   - The extension will automatically capture and store it

2. **View your subscriptions**:
   - Click the extension icon in your toolbar
   - See all your subscribed issues with live status
   - Click any issue to open it on GitHub

3. **Cross-device sync**:
   - Make sure you're signed into your browser account:
     - Chrome: Google Account with sync enabled
     - Firefox: Firefox Account with "Add-ons" sync enabled
   - Subscriptions automatically sync across your devices!

## Storage Limits

The extension uses `browser.storage.sync` which has a **100 KB limit**. With minimal data storage:
- Each subscription: ~200 bytes
- Maximum subscriptions: ~50-100 issues
- Storage usage shown in popup

If you approach the limit, consider unsubscribing from older issues.

## Privacy & Security

- **No external servers**: All data stays in your browser
- **No tracking**: Extension doesn't collect any analytics
- **Minimal data**: Only stores owner/repo/number/type
- **GitHub API**: Uses public GitHub API to fetch issue details
- **Open source**: Inspect the code yourself!

## Architecture

```
extension/
├── manifest.json           # Extension configuration
├── assets/
│   ├── background.js       # Service worker for storage management
│   ├── content.js          # Content script to capture subscribe clicks
│   ├── popup.html          # Popup interface
│   ├── popup.js            # Popup logic
│   └── icon.svg            # Extension icon
└── README.md
```

**How it works:**

1. **Content Script** (`content.js`):
   - Injected on GitHub issue/PR pages
   - Monitors subscribe/unsubscribe button clicks
   - Sends messages to background script

2. **Background Script** (`background.js`):
   - Service worker (Manifest V3)
   - Manages `storage.sync` operations
   - Tracks storage usage

3. **Popup** (`popup.html` + `popup.js`):
   - Displays subscribed issues
   - Fetches live issue data from GitHub API
   - Shows storage usage stats

## Limitations

- **Storage**: 100 KB limit (~50-100 issues)
- **Firefox Android**: No sync storage support
- **Retroactive**: Only tracks subscriptions made after installation
- **Rate Limits**: GitHub API has rate limits for unauthenticated requests (60/hour)

## Development

To modify the extension:

1. Make changes to files in `extension/assets/`
2. Reload the extension:
   - Chrome: Go to `chrome://extensions/` and click reload
   - Firefox: Go to `about:debugging` and click reload

## Future Enhancements

- [ ] OAuth GitHub authentication for higher API rate limits
- [ ] Export/import subscriptions
- [ ] Browser action badge showing subscription count
- [ ] Filter by state (open/closed)
- [ ] Search subscriptions
- [ ] Bulk unsubscribe

## Browser Compatibility

- **Chrome**: 123+ ✅
- **Edge**: 123+ ✅
- **Firefox Desktop**: 128+ ✅
- **Firefox Android**: ❌ (no sync storage support)
- **Safari**: Requires conversion to Safari extension format

## Contributing

This extension was built as a solution to GitHub's API limitations. Feel free to:
- Report issues
- Suggest features
- Submit pull requests
- Fork and customize

## License

MIT

## Acknowledgments

- Inspired by [Refined GitHub](https://github.com/refined-github/refined-github)
- Uses GitHub's [Primer CSS](https://primer.style/css)
- Built with privacy and simplicity in mind
