# Overview

This is a browser extension to add a custom Bookmarks view to the collection of GitHub built-in
views at: `github.com/issues`

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

**CRITICAL**: The Bookmarks view markup must match GitHub's native view structure EXACTLY.

## Key Structural Pattern

GitHub's issue list views follow this hierarchy:

```html
<div class="Search-module__SearchContainer--CkrWX">
  <div class="SearchBar-module__gap8--tZi0W...">
    <!-- Search inputs -->
  </div>
  <div>  <!-- Plain wrapper div (no class) -->
    <div class="ListItems-module__listContainer--sgptj">
      <div class="ListItems-module__listScopedCommand--GGPXX">
        <div class="ListView-module__container--rxCWy">
          <!-- List content -->
        </div>
      </div>
    </div>
  </div>
</div>
```

**Why this matters:**
- The list container MUST be nested inside the search container (not a sibling)
- The plain wrapper `<div>` is required for proper spacing
- GitHub's CSS applies spacing based on this exact hierarchy

# Critical CSS Module Classes

These GitHub CSS module classes must be used exactly as shown:

**Container Classes:**
- `Search-module__SearchContainer--CkrWX` - Main search container
- `ListItems-module__listContainer--sgptj` - List wrapper (provides border)
- `ListView-module__container--rxCWy` - Inner list container

**Search Input Classes:**
- `FormControl` + `FormControl--fullWidth` - Wrapper
- `FormControl-label` + `sr-only` - Label
- `FormControl-input` + `Input-module__Box_4--DZrl_` - Input field

**Results Header Classes:**
- `Metadata-module__container--ydeM8` - Must use `display: flex` (NOT `block`)
- `Metadata-module__heading--vvkcl` - Results count heading

# Development Workflow

When modifying the Bookmarks view styling:

1. Navigate to `github.com/issues/created` (or any native view)
2. Open DevTools and inspect the native GitHub element
3. Document the exact DOM structure and CSS classes
4. Click "Bookmarks" to load the custom view
5. Compare structures and identify differences
6. Update extension code to match native structure EXACTLY
7. Reload extension and test

**Never guess** - always inspect the native GitHub views first.

# Common Pitfalls

1. **Wrong display mode**: Metadata container needs `display: flex`, not `display: block`
2. **Missing FormControl wrapper**: Search inputs need full FormControl structure, not just `<input>`
3. **Incorrect nesting**: List container must be INSIDE search container, not a sibling
4. **Missing wrapper divs**: GitHub uses plain wrapper `<div>`s for spacing - don't skip them
5. **CSS class names**: These are CSS modules with generated hash suffixes - copy exactly

# Dependencies and Modules

## Manifest V3 Content Security Policy

The extension uses Manifest V3, which has strict Content Security Policy (CSP) restrictions:

- **No external CDN scripts** - CSP: `script-src 'self'` blocks external URLs
- **No inline scripts** - Inline `<script>` tags are blocked
- **Solution**: Bundle dependencies locally and use ES modules

## Bundled Dependencies Pattern

External libraries must be bundled locally in `extension/assets/vendor/`:

**Example: relative-time-element**
```bash
# One-time build process
cd tmp/relative-time-element
npm install
npm run build
cp dist/bundle.js extension/assets/vendor/relative-time-element.js
```

**Loading as ES Module:**
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
