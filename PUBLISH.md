# Publishing to Web Stores

## Overview

Extensions are published to both stores using
[publish-browser-extension](https://github.com/aklinker1/publish-browser-extension), either
locally via `npm run publish` or via the `Publish to Web Stores` GitHub Actions workflow.

For store descriptions and screenshots, see: [extension/assets/store/listing.md].
## Credentials

Credentials are stored in `.env.submit` (local) and GitHub Actions secrets (CI).

### Chrome Web Store

| Variable               | Source                                                         |
|------------------------|----------------------------------------------------------------|
| `CHROME_EXTENSION_ID`  | Developer Dashboard → extension ID                             |
| `CHROME_CLIENT_ID`     | Google Cloud Console → OAuth credentials (Desktop app type)    |
| `CHROME_CLIENT_SECRET` | Same                                                           |
| `CHROME_REFRESH_TOKEN` | Run `npx chrome-webstore-upload-keys` (interactive OAuth flow) |

Setup:

1. Create a Google Cloud project at https://console.cloud.google.com/projectcreate
2. Enable Chrome Web Store API at https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com
3. Set up OAuth consent screen at https://console.cloud.google.com/auth/overview — app name, emails,
   "External" user type, add your email as test user, skip scopes
4. Create credentials: OAuth client ID → Application type: "Desktop app" (not "Chrome Extension")
5. Generate refresh token: `npx chrome-webstore-upload-keys`

### Firefox Add-ons (AMO)

| Variable             | Source                                                     |
|----------------------|------------------------------------------------------------|
| `FIREFOX_JWT_ISSUER` | https://addons.mozilla.org/en-US/developers/addon/api/key/ |
| `FIREFOX_JWT_SECRET` | Same page                                                  |

## Publishing

### Local (manual)

```bash
# Build both extensions
npm run build

# Verify credentials work
npm run publish:dry-run

# Publish to both stores
npm run publish
```

Or publish from CI-built release artifacts:

```bash
# Download artifacts from a GitHub release
gh release download v1.0.1 --pattern '*.zip' --pattern '*.xpi' --dir /tmp/publish

# Publish those artifacts
npx publish-extension --chrome-zip /tmp/publish/*.zip --firefox-zip /tmp/publish/*.xpi
```

### CI (GitHub Actions)

The `Publish to Web Stores` workflow (`.github/workflows/publish.yml`) is manually triggered via
`workflow_dispatch`. It downloads artifacts from a GitHub release and publishes to both stores.

1. Go to Actions → "Publish to Web Stores" → "Run workflow"
2. Enter the release tag (e.g., `v1.0.1`)
3. Run

The workflow requires these repository secrets: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`,
`CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`.

## Review Process

Both stores review every version update:

- Chrome: Automated review, typically minutes to hours. Once approved, the update goes live automatically.
- Firefox: Automated checks, sometimes followed by human review. Listed submissions go "pending
  review" — the CI job succeeds when the upload is accepted, not when the review completes.

## Checking Submission Status

### Chrome

```bash
scripts/cws-status.sh
```

The response shows `publishedItemRevisionStatus` (live version) and `submittedItemRevisionStatus`
(pending review, if any).

### Firefox

Check the Developer Hub at https://addons.mozilla.org/en-US/developers/addon/github-bookmarked-issues/versions

## Version Numbering

See [BUILD.md — Version Numbering](BUILD.md#version-numbering) for the full version scheme.

The key constraint for publishing: both stores require numeric-only versions (`X.Y.Z`), so RC builds
cannot be published to the stores unless the base version is bumped. Only final releases should be
published.

## Pitfalls

### Do not mix dashboard uploads with API uploads

The `publish-browser-extension` tool uploads a zip then immediately submits for review. If a
previous submission is still pending review, the upload fails silently (`ITEM_NOT_UPDATABLE`) but the
tool proceeds to "submit" — which re-submits the old draft. The tool reports success even though the
new zip was never uploaded.

If this happens:

1. Cancel the pending review from the Chrome Developer Dashboard
2. Upload via the raw API (upload only, no submit):
   ```bash
   scripts/cws-upload.sh path/to/extension.zip
   ```
3. Verify the upload in the Dashboard (check version in Package tab)
4. Submit for review:
   ```bash
   scripts/cws-submit.sh
   ```

To avoid this: don't upload packages manually through the Dashboard while also using the API. Stick
to one method.

### Chrome OAuth credential type

When creating Google Cloud OAuth credentials, select "Desktop app" — not "Chrome Extension". The
Chrome Extension type uses a different OAuth flow and does not generate a client secret.

### Firefox duplicate versions

AMO rejects uploads if the manifest `version` already exists for that add-on. Since RC builds share
the same base version, only the first RC (or the final release) can be uploaded to AMO per version
number.

## Helper Scripts

| Script                  | Purpose                                          |
|-------------------------|--------------------------------------------------|
| `scripts/cws-status.sh` | Check Chrome Web Store published/pending status  |
| `scripts/cws-upload.sh` | Upload a zip without submitting for review       |
| `scripts/cws-submit.sh` | Submit the current draft for review              |

All scripts read credentials from `.env.submit`.
