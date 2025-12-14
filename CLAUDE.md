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
