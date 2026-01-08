# Build Instructions

This cross-platform extension supports both Chrome and Firefox.

## Prerequisites

- Node.js 18+
- npm

## Quick Start

**Firefox**:
```bash
npm install
npm run build:firefox
```

**Chrome**:
```bash
npm install
npm run build:chrome
```

**Both browsers**:
```bash
npm install
npm run build
```

## Output Locations

- Firefox XPI: `build/bundle/github-bookmarked-issues-{version}.xpi`
- Chrome ZIP: `build/bundle/github-bookmarked-issues-{version}.zip`

## Build System Architecture

### Why Two Manifest Files?

This extension maintains **separate manifest files** due to incompatible Manifest V3 implementations:

**Chrome** (`extension/manifest-chrome.json`):
```json
"background": {
  "service_worker": "assets/background.js",
  "type": "module"
}
```

**Firefox** (`extension/manifest-firefox.json`):
```json
"background": {
  "scripts": ["assets/background.js"],
  "type": "module"
},
"browser_specific_settings": {
  "gecko": {
    "id": "github-bookmarked-issues@extensions",
    "strict_min_version": "128.0",
    "data_collection_permissions": {"required": ["none"]}
  }
}
```

**Key Differences**:
- Chrome uses `service_worker` (string), Firefox uses `scripts` (array)
- Firefox requires `browser_specific_settings.gecko.id` for extension persistence
- Firefox-specific `data_collection_permissions` declaration
- Chrome manifest includes `$schema` for IDE validation (Firefox rejects this field)

### Build Pipeline (3 Stages)

#### 1. `scripts/copy.js` - File Preparation
- Copies `extension/` → `build/{browser}/`
- Skips `manifest-*.json` and `vendor/` (handled separately)
- Copies browser-specific manifest (`manifest-{browser}.json`), renames to `manifest.json`

#### 2. `scripts/build.js` - Dependency Bundling
- Bundles `@github/relative-time-element` into `assets/vendor/`
- Required for Manifest V3 Content Security Policy compliance

#### 3. `scripts/package.js` - Distribution Packaging
- **Chrome**: Creates ZIP using `zip` utility
- **Firefox**: Creates XPI using `web-ext build` with validation

### Why Not Use web-ext Alone?

While `web-ext` supports cross-platform development:
- ✓ Can test in Chromium: `web-ext run --target chromium`
- ✓ Can build packages: `web-ext build`
- ✓ Validates Firefox extensions: `web-ext lint`

**BUT** it cannot:
- ✗ Automatically handle manifest differences between browsers
- ✗ Swap manifests based on target platform
- ✗ Create Chrome Web Store packages (only Firefox signing via `web-ext sign`)

Our build system uses `web-ext` where appropriate (Firefox packaging/linting) while handling cross-platform manifest differences through custom scripts.

## Development Workflow

Use the file watcher for automatic rebuilds during development:

```bash
# Terminal 1: Start file watcher
npm run dev:watch

# Terminal 2: Load Firefox from build/firefox/
# Terminal 3: Load Chrome from build/chrome/
```

**How it works**:
- Watches `extension/` directory for changes
- Automatically rebuilds both Firefox and Chrome builds
- Reload extension in browser to see changes

**Loading the extension**:
- **Firefox**: `about:debugging` → "Load Temporary Add-on" → select `build/firefox/manifest.json`
- **Chrome**: `chrome://extensions` → "Load unpacked" → select `build/chrome/` directory

**Making changes**:
1. Edit files in `extension/` directory
2. Watcher detects change and rebuilds (~2-3 seconds)
3. Reload extension in browser to see changes

### Running Tests

```bash
npm test              # All tests
npm run test:chrome   # Chrome-specific
npm run test:visual   # Visual regression tests only
npm run lint          # Lint Firefox build
```

### Visual Regression Tests

Visual tests compare screenshots against baseline images to detect unintended UI changes.

- Baselines stored in `tests/screenshots/`
- Tests tagged with `@visual` in test names
- Tolerances: 2% pixel diff ratio, 0.2 per-pixel threshold (accounts for font rendering differences)

```bash
npm run test:visual          # Run visual tests
npm run test:visual:update   # Update baseline screenshots
```

### CI Testing

Tests run on macOS, Ubuntu, and Windows via GitHub Actions matrix. Each OS uploads:
- Built Chrome extension (`.zip`)
- Playwright HTML report
- Test results directory

Artifacts are retained for 7 days for debugging failed runs.

### Authenticated Tests

Some tests require GitHub authentication (bookmarks view, error handling). These skip gracefully if not configured.

Setup:
```bash
node scripts/obtain-github-authorization.js
# Browser opens - log in to GitHub, then press Enter
# Copy output to .env file
```

The script outputs a `GITHUB_AUTH_STATE` value to add to `.env`. Sessions expire after ~2 weeks.

### Version Tracking

Dev builds include git commit info in `version_name` (visible in `chrome://extensions` or `about:addons`):

| Build Type                 | version_name Example                      |
|----------------------------|-------------------------------------------|
| Release (CI with tag)      | `1.0.0-rc1` (from tag `v1.0.0-rc1`)       |
| Release (local tagged)     | `1.0.0-rc1` (detected via git describe)  |
| Dev (clean)                | `1.0.0-dev+abc1234`                       |
| Dev (uncommitted changes)  | `1.0.0-dev+abc1234-dirty:worktree-name`   |

CI release builds receive the tag name via `VERSION_TAG` environment variable. Local builds detect tags via `git describe --exact-match HEAD`. The dirty suffix includes the worktree directory name to distinguish between multiple worktrees.

## Dependency Information

**@github/relative-time-element** (GitHub's official web component)
- npm: https://www.npmjs.com/package/@github/relative-time-element
- Source: https://github.com/github/relative-time-element
- Version: 5.0.0 (pinned in package.json)
- License: MIT
- Purpose: Display human-friendly timestamps ("2 weeks ago")
- Build: Copied from `node_modules/@github/relative-time-element/dist/index.js`
- Output: `build/{browser}/assets/vendor/relative-time-element.js`

Bundled locally to comply with Manifest V3 CSP (no external CDN scripts allowed).

## For Firefox AMO Reviewers

The build is deterministic and reproducible:

```bash
npm install
npm run build:firefox
```

Output: `build/bundle/github-bookmarked-issues-{version}.xpi`

Source code is in `extension/`, build scripts in `scripts/`. Same source + dependencies = same output.

## Troubleshooting

**"File does not contain a valid manifest" in Firefox**:
- Load from `build/firefox/manifest.json`, not from `extension/` directory
- Firefox rejects manifests containing `$schema` field (Chrome manifest has this)

**Extension not loading**:
- Always load from `build/{browser}/` directory, not from `extension/`
- Use `npm run dev:watch` for automatic rebuilds during development

**Watcher not detecting changes**:
- Ensure `npm run dev:watch` is running
- Check that you're editing files in `extension/` directory
- Restart watcher if needed (Ctrl+C, then `npm run dev:watch`)

**Missing vendor directory**:
- Run `npm run dev:watch` or `npm run build:{browser}`
- Vendor files are generated during build, not in source
