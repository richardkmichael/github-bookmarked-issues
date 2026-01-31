# Overview

This is a browser extension to add a custom Bookmarks view to the collection of GitHub built-in
views at: `github.com/issues`

The GitHub repo is: richardkmichael/github-bookmarked-issues

# Implementation

The github.com/issues page has GitHub built-in views as a React app:

```
<div class="application-main">
  <main>
    <react-app app-name="issues-react">
      <!-- All view content here -->
    </react-app>
  </main>
</div>
```

This extension:

- Inserts a new custom `Bookmarks` view at the end of the list of the built-in views, i.e. into the
  React-controlled DOM (obviously fragile due to React re-rendering)

- Adds a MutationObserver on `div.application-main` (outside the React app) to monitor the React app
  for re-rendering, to re-insert the custom view after re-render

Read @GITHUB_OPERATION.md for details of how the github.com React site operates.  The details are
helpful when debugging or making changes to the extension.

# Navigation

**Critical for development and debugging**:

- To inspect the Bookmarks view, navigate to the built-in view: `github.com/issues/created`, then
  *click* on the Bookmarks view.

- Unless debugging *routing*, DO NOT navigate directly to `github.com/issues/bookmarks`, because
  this will result in a 404, since the React router is unaware of the `/issues/bookmarks` route.

# GitHub style

The custom Bookmarks view style must match the GitHub built-in style (CSS).

- https://primer.style
- We use the "list-view", but it is "internal-use only": https://primer.style/product/internal-components/list-view/
- Icons are GitHub's Octicons: https://primer.style/octicons/

# DOM Structure Requirements

The Bookmarks view markup must match GitHub's native view structure.

## Key Structural Pattern

GitHub's issue list views follow this hierarchy (hash suffixes omitted — they change between
deployments and are resolved at runtime by the CSS class discovery system):

```html
<div class="Search-module__SearchContainer--{hash}">
  <div class="SearchBar-module__gap8--{hash}...">
    <!-- Search inputs -->
  </div>
  <div>  <!-- Plain wrapper div (no class) -->
    <div class="ListItems-module__listContainer--{hash}">
      <div class="ListItems-module__listScopedCommand--{hash}">
        <div class="ListView-module__container--{hash}">
          <!-- List content -->
        </div>
      </div>
    </div>
  </div>
</div>
```

Why this matters:
- The list container MUST be nested inside the search container (not a sibling)
- The plain wrapper `<div>` is required for proper spacing
- GitHub's CSS applies spacing based on this exact hierarchy

# CSS Module Classes

GitHub uses CSS modules with generated hash suffixes (e.g., `Search-module__SearchContainer--CkrWX`)
that change between deployments.  The extension discovers current class names at runtime instead of
hardcoding them.

## Discovery System (`shared.js`)

1. Content scripts call `registerCssClasses()` with prefix keys (the stable part before the hash)
2. At render time, `discoverCssClasses()` scans GitHub's stylesheets to resolve each prefix to the
   current full class name
3. Code uses `cls('prefix')` or `clsAll('prefix1', 'prefix2')` to get resolved class names

Example:
```javascript
// Registration (top of content-issues-list.js)
registerCssClasses([
  'Search-module__SearchContainer',
  'ListItems-module__listContainer',
  ['Title-module__container', 'display', 'block'],  // with CSS discriminator
  ['Metadata-module__secondary', 'selectorContains', '.IssueItemMetadata'],  // with selector discriminator
]);

// Usage
const container = document.createElement('div');
container.className = cls('Search-module__SearchContainer');
```

## Discriminators

Some prefixes are ambiguous — multiple CSS rules share the same module file name (e.g.,
`Title-module__container` appears in both text-clamping and list-item contexts). Discriminators
select the correct variant:

- CSS property discriminator: `['prefix', 'property', 'value']` — matches the rule where
  `rule.style.getPropertyValue(property) === value`
- Selector discriminator: `['prefix', 'selectorContains', 'substring']` — matches the rule where
  `rule.selectorText.includes(substring)`

## Adding New CSS Classes

1. Inspect the native GitHub DOM to find the class name prefix (everything before the hash suffix)
2. Add the prefix to the `registerCssClasses()` call in the relevant content script
3. If the prefix is ambiguous (multiple stylesheet matches), add a discriminator
4. Use `cls('prefix')` in your code — never hardcode full class names with hashes

# Development Workflow

1. Edit source code in `extension/assets/`
2. Run `npm run build:chrome` (or `build:firefox`)
3. Reload extension in browser
4. Test changes

## Testing the Bookmarks View

To compare our custom view against GitHub's native views:

1. Navigate to `github.com/issues/created` (or any native view)
2. Open DevTools and inspect the native GitHub element
3. Click "Bookmarks" to load the custom view
4. Compare DOM structure and styling

**Never guess** - always inspect native GitHub views first.

# Common Pitfalls

1. Wrong display mode: Metadata container needs `display: flex`, not `display: block`
2. Missing FormControl wrapper: Search inputs need full FormControl structure, not just `<input>`
3. Incorrect nesting: List container must be INSIDE search container, not a sibling
4. Missing wrapper divs: GitHub uses plain wrapper `<div>`s for spacing — don't skip them
5. Hardcoded CSS class hashes: Never hardcode full class names with hash suffixes — use
   `registerCssClasses()` with prefixes and `cls()` to resolve them at runtime
6. Ambiguous CSS prefixes: When adding a new prefix that has multiple stylesheet matches, add a
   discriminator — otherwise the first match wins, which may be the wrong variant

# Code Style

Do not use Hungarian notation for variable names. Use descriptive names without type suffixes.

Good examples:
- `error`, `loading`, `empty`, `list` (not `errorEl`, `loadingEl`, `emptyEl`, `listEl`)
- `item`, `issueItem`, `issueTitle` (not `liEl`, `issueElement`, `titleElement`)
- `button`, `container` (not `buttonEl`, `containerEl`)

# Dependencies and Modules

## Manifest V3 Content Security Policy

The extension uses Manifest V3, which has strict Content Security Policy (CSP) restrictions:

- **No external CDN scripts** - CSP: `script-src 'self'` blocks external URLs
- **No inline scripts** - Inline `<script>` tags are blocked
- **Solution**: Bundle dependencies locally and use ES modules

## CSS vs JavaScript Loading: CDN vs Bundled

| Dependency                    | Type       | Loading     | Reason                          |
|-------------------------------|------------|-------------|---------------------------------|
| @primer/css                   | CSS        | CDN (unpkg) | CSP allows external stylesheets |
| @github/relative-time-element | JavaScript | Bundled     | CSP blocks external scripts     |

Why the difference? Manifest V3's CSP treats styles and scripts differently:
- `script-src 'self'`: Blocks external JavaScript (CDN scripts rejected)
- `style-src`: Allows external stylesheets by default

Why not bundle Primer CSS too?
- ~300KB size increase to extension package
- CDN provides caching benefits
- CDN loading is allowed and works fine

Content script note: Content scripts create `<relative-time>` elements that work because
GitHub's pages already load this web component. The extension only bundles it for
extension pages (popup/options).

## Bundled Dependencies Pattern

External libraries are managed via npm and bundled during build:

1. Add dependency: `npm install @github/relative-time-element`
2. Build copies from `node_modules/` to `build/<browser>/assets/vendor/`

The build script (`scripts/build.js`) handles copying vendor dependencies from
`node_modules/` to the build output directory.

**Loading in extension code:**
```javascript
// In popup.js (as a module)
import './vendor/relative-time-element.js';
```

**HTML:**
```html
<script type="module" src="popup.js"></script>
```

## Module Loading Requirements

- **Extension pages (popup, options)**: Must use ES modules to import dependencies
- **Content scripts**: Can use regular scripts, but modules preferred for dependencies
- **Background service worker**: Configured as module in manifest.json

## Debugging Extension Popup

Since the popup runs in an isolated context:

1. **Right-click in popup → Inspect** - Opens DevTools for popup
2. **chrome://extensions → Inspect views** - Click when popup is open
3. **Console debugging**:
   ```javascript
   // Check if custom element is defined
   customElements.get('relative-time')

   // Check module loading
   document.querySelector('script[type="module"]')
   ```

## Date Formatting

The extension uses GitHub's `relative-time-element` web component for human-friendly dates:

- Displays "2 weeks ago" instead of "2mo ago"
- Auto-updates as time passes
- Fallback: `formatDate()` function provides initial text content
- Elements upgrade automatically after creation (custom elements spec)

# innerHTML and XSS Prevention

## The Problem

Using `innerHTML` with dynamic content creates XSS vulnerabilities and triggers web-ext linter warnings (`UNSAFE_VAR_ASSIGNMENT`). However, avoiding innerHTML entirely can lead to verbose, hard-to-maintain code with endless `createElement` and `setAttribute` calls.

## The Solution

Use template elements for static structure, textContent for dynamic data:

1. Template elements (`<template>`) hold inert content that won't execute scripts
2. `template.innerHTML` is safe for static program data and doesn't trigger warnings
3. `textContent` automatically escapes user input, preventing XSS

## Patterns to Follow

### For Popup/Options Pages (with .html files)

Add templates directly to the HTML:

```html
<!-- In popup.html -->
<template id="icon-open">
  <svg viewBox="0 0 16 16" width="16" height="16">
    <path d="M8 9.5a1.5 1.5 0 1 0 0-3..."></path>
  </svg>
</template>

<template id="issue-item">
  <div class="issue-item">
    <div class="state-icon"></div>
    <div class="issue-title">
      <a target="_blank" rel="noopener noreferrer"></a>
    </div>
    <div class="issue-meta">
      <span class="repo-name"></span>
      <span class="issue-number"></span>
    </div>
  </div>
</template>
```

Use in JavaScript:

```javascript
// Clone template
const template = document.getElementById('issue-item');
const item = template.content.cloneNode(true);

// Populate with data using textContent (auto-escapes)
item.querySelector('.issue-title a').href = issue.html_url;
item.querySelector('.issue-title a').textContent = issue.title;
item.querySelector('.repo-name').textContent = repoName;
item.querySelector('.issue-number').textContent = `#${issue.number}`;

// Add icon from another template
const icon = document.getElementById('icon-open').content.cloneNode(true);
item.querySelector('.state-icon').appendChild(icon);

container.appendChild(item);
```

### For Content Scripts (no .html file)

Create templates programmatically:

```javascript
function setupTemplates() {
  if (document.getElementById('ext-templates')) return;

  const container = document.createElement('div');
  container.id = 'ext-templates';
  container.style.display = 'none';

  const iconTemplate = document.createElement('template');
  iconTemplate.id = 'icon-bookmark';
  // Using innerHTML here is SAFE - static program data in template element
  iconTemplate.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 2.75..."></path></svg>';

  container.appendChild(iconTemplate);
  document.body.appendChild(container);
}

// Call once at initialization
setupTemplates();

// Use throughout the code
function getIcon(name) {
  const template = document.getElementById(`icon-${name}`);
  return template.content.cloneNode(true).firstChild;
}

button.appendChild(getIcon('bookmark'));
```

### Templates with Interpolated Strings

`template.innerHTML` with a plain string (e.g., an SVG icon) does not trigger the web-ext linter.
However, template literals with any `${...}` interpolation do — the linter flags every `innerHTML`
assignment containing expressions, even on inert `<template>` elements where it is safe.

Use `setTemplateHTML()` (defined in `content-issues-list.js`) for templates that need interpolation
(e.g., `cls()` calls for CSS class names). It uses `DOMParser` internally, avoiding `innerHTML`:

```javascript
function createMyTemplate() {
  const template = document.createElement('template');
  template.id = 'my-template';
  setTemplateHTML(template, `
    <div class="${cls('Some-module__container')}">...</div>
  `);
  return template;
}
```

## Patterns to Avoid

### Don't: Use innerHTML for Dynamic Content

```javascript
// BAD - XSS vulnerability
element.innerHTML = `<span>${userInput}</span>`;

// BAD - Even with escaping, triggers linter warnings
element.innerHTML = `<span>${escapeHtml(userInput)}</span>`;
```

### Don't: Verbose createElement Chains for Static Content

```javascript
// BAD - 20+ lines for a simple SVG
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svg.setAttribute('aria-hidden', 'true');
svg.setAttribute('focusable', 'false');
svg.setAttribute('viewBox', '0 0 16 16');
svg.setAttribute('width', '16');
svg.setAttribute('height', '16');
// ... 15 more setAttribute calls ...
const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
path.setAttribute('d', 'M3 2.75C3...');
svg.appendChild(path);

// GOOD - 2 lines using template
const template = document.createElement('template');
template.innerHTML = '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3 2.75..."></path></svg>';
```

## Key Principles

1. **Separation of concerns**: Static structure (templates) vs. dynamic data (textContent)
2. **Template elements are designed for this**: Using `template.innerHTML` for static content is the intended use case
3. **textContent auto-escapes**: No need for `escapeHtml()` helpers
4. **Zero warnings**: This approach eliminates all web-ext linter warnings
5. **Readable code**: Templates keep HTML structure visible and maintainable

# Researching Primer CSS

## Caching Primer Source

To avoid repeatedly downloading Primer CSS when searching for class names or patterns:

1. Check if already cached: `ls tmp/primer-css/`
2. If not cached, download once:
   ```bash
   mkdir -p tmp && cd tmp
   npm pack @primer/css && tar -xzf primer-css-*.tgz && mv package primer-css
   ```
3. Search the cached source: `grep -r "pattern" tmp/primer-css/`

## Primer View Components

Between Primer v21 and v22, components were extracted from main Primer to separate packages like
`primer_view_components`. When implementing UI elements that match GitHub's style:

1. First inspect the live GitHub page to see actual class names
2. Search Primer CSS for the class patterns
3. If not found, check `primer_view_components` or other Primer-related packages
4. Example: Label classes were found by reviewing the label view component implementation

# Development Commands

## Reloading the Extension

After code changes:

Chrome:
1. `npm run build:chrome`
2. Go to `chrome://extensions`
3. Click the refresh icon on the extension card

Firefox:
1. `npm run build:firefox` (or just reload if using symlink method)
2. Go to `about:debugging#/runtime/this-firefox`
3. Click "Reload" on the extension

With watch mode (`npm run dev:watch`), step 1 is automatic - just reload in the browser.

## Reading Extension Errors

Chrome:
- `chrome://extensions` → Click "Errors" on the extension card
- Or: Click "Inspect views service worker" → Console tab

Firefox:
- `about:debugging#/runtime/this-firefox` → Click "Inspect" on the extension
- Console tab shows errors from background script

Content script errors appear in the page's DevTools console (F12 on github.com).

# MCP Chrome DevTools

The `chrome-devtools` MCP server connects to Chrome Canary for automated browser control.

## Handle chrome-devtools MCP server error

When any chrome-devtools tool returns this error:

```
Error: Could not connect to Chrome. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.
```

Start Chrome manually with: `./chrome-canary.sh --start`

# Release

## Tags

Releases use annotated, not lightweight, tags.  The annotated tag message is simply the tag name
itself: `v1.0.0`, because the release notes explain the release content.

Prerelease tags use `-rcX` notation, e.g., `v1.0.0-rc3`.
