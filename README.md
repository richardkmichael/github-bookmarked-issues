## Development

Loading local development code.

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


## Data

Data is stored locally and synchronized when connected to a Firefox Account or Google Account.

```
$ sqlite3 ${PROFILE_DIR}/storage-sync-v2.sqlite "select data from storage_sync_data where ext_id = 'github-bookmarked-issues@extensions'" | jq
```

## Testing

### Chrome

- [Playwright Chrome extensions](https://playwright.dev/docs/chrome-extensions)
- Puppeteer Chrome extensions
  - https://developer.chrome.com/docs/extensions/how-to/test/puppeteer
  - https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing

### Firefox

#### Playwright

- https://github.com/microsoft/playwright/issues/7297
  - [Build XPI and use policy to load it](https://github.com/microsoft/playwright/issues/7297#issuecomment-3333317209)
  - Closed - Dec 3 2024: [Out of scope](https://github.com/microsoft/playwright/issues/7297#issuecomment-2515561760)
- All closed for #7297
  - https://github.com/microsoft/playwright/issues/26995
  - https://github.com/microsoft/playwright/issues/36728
  - https://github.com/microsoft/playwright/issues/15299
  - https://github.com/microsoft/playwright/issues/37981
- [Requested in Playwright Discord](https://discord.com/channels/807756831384403968/1295731963927334995)
