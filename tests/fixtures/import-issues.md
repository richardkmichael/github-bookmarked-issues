# Test Fixtures for Import Functionality

## Valid GitHub Issue URLs

### Plain URLs
- https://github.com/microsoft/playwright/issues/38673
- https://github.com/microsoft/playwright/issues/38674
- https://github.com/facebook/react/issues/100

### Markdown Links
- [Built-in Method to Mask Sensitive Input](https://github.com/microsoft/playwright/issues/38673)
- [React renderComponent issue](https://github.com/facebook/react/issues/100)

### URLs with anchors (should still parse)
- https://github.com/microsoft/playwright/issues/38673#issuecomment-123456

## Invalid Entries

### Non-GitHub URLs
- https://gitlab.com/owner/repo/issues/123
- https://bitbucket.org/owner/repo/issues/456

### Not issue URLs
- https://github.com/microsoft/playwright/pull/100
- https://github.com/microsoft/playwright/discussions/200
- https://github.com/microsoft/playwright

### Malformed entries
- Just some text without a URL
- [A title](not-a-valid-url)

## Duplicates (for deduplication testing)
- https://github.com/microsoft/playwright/issues/38673
