// Shared utilities for GitHub Bookmarked Issues extension

/**
 * Bookmark ID format: owner/repo/type/number
 * Example: "microsoft/playwright/issues/1284"
 */

// Create a bookmark ID from components
function makeBookmarkId(owner, repo, type, number) {
  return `${owner}/${repo}/${type}/${number}`;
}

// Parse a bookmark ID into components
function parseBookmarkId(id) {
  const parts = id.split('/');
  if (parts.length !== 4) return null;
  return {
    owner: parts[0],
    repo: parts[1],
    type: parts[2],
    number: parseInt(parts[3], 10)
  };
}

// Extract bookmark ID from a GitHub issue URL
function getBookmarkIdFromUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  return match ? makeBookmarkId(match[1], match[2], 'issues', match[3]) : null;
}

// Get icon SVG from template element
// Uses firstElementChild to avoid whitespace text nodes
function getIcon(name) {
  const template = document.getElementById(`icon-${name}`);
  if (!template) return null;
  return template.content.firstElementChild.cloneNode(true);
}

// CSS Class Discovery System
// GitHub uses CSS modules with generated hash suffixes that change between deployments.
// Content scripts register class key prefixes, then call discoverCssClasses() to
// extract current full class names from GitHub's stylesheets.

// Guard: shared.js may be loaded twice in the same isolated world
// (once per content_scripts entry in the manifest).
if (typeof CSS_CLASSES !== 'undefined') {
  console.log('[Bookmarked] shared.js already loaded, skipping re-declaration');
}
// Use var (not const) so the second execution doesn't throw a SyntaxError
var CSS_CLASSES = CSS_CLASSES || new Map();
// Discriminators for ambiguous prefixes: prefix -> { property, value }
var CSS_DISCRIMINATORS = CSS_DISCRIMINATORS || new Map();

// Register CSS class prefixes for discovery.
// Each entry is either a string (prefix) or a tuple [prefix, property, value]
// where the property/value pair disambiguates when multiple stylesheet rules
// share the same prefix (e.g., different React components with same module name).
function registerCssClasses(keys) {
  for (const entry of keys) {
    const key = Array.isArray(entry) ? entry[0] : entry;
    if (!CSS_CLASSES.has(key)) {
      CSS_CLASSES.set(key, key);
    }
    if (Array.isArray(entry)) {
      CSS_DISCRIMINATORS.set(key, { property: entry[1], value: entry[2] });
    }
  }
}

function cls(key) {
  return CSS_CLASSES.get(key) || key;
}

function clsAll(...keys) {
  return keys.map(k => cls(k)).join(' ');
}

function discoverCssClasses() {
  // Build a set of undiscovered keys (value still equals the bare prefix)
  const pending = new Set();
  for (const [key, value] of CSS_CLASSES) {
    if (key === value) pending.add(key);
  }
  if (pending.size === 0) return;

  // Build one regex per pending key (escaped for use in regex)
  const keyRegexes = new Map();
  for (const key of pending) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    keyRegexes.set(key, new RegExp('\\.' + escaped + '[\\w-]+'));
  }

  // Split keys into simple (first match wins) and discriminated (collect candidates)
  const simple = new Set();
  const discriminated = new Set();
  for (const key of pending) {
    if (CSS_DISCRIMINATORS.has(key)) {
      discriminated.add(key);
    } else {
      simple.add(key);
    }
  }

  // Candidates for discriminated keys: key -> [{ className, rule }]
  const candidates = new Map();
  for (const key of discriminated) {
    candidates.set(key, []);
  }

  // Search all stylesheet rules (recurse into @layer/@media groups)
  let discovered = 0;
  for (const sheet of document.styleSheets) {
    if (simple.size === 0 && discriminated.size === 0) break;
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    discovered += scanRules(rules, simple, discriminated, keyRegexes, candidates);
  }

  // Resolve discriminated keys by picking the candidate matching the discriminator
  for (const key of discriminated) {
    const { property, value } = CSS_DISCRIMINATORS.get(key);
    const matches = candidates.get(key);
    const winner = matches.find(c => c.rule.style.getPropertyValue(property) === value);
    if (winner) {
      CSS_CLASSES.set(key, winner.className);
      pending.delete(key);
      discovered++;
    } else if (matches.length > 0) {
      // No discriminator match; fall back to first candidate
      CSS_CLASSES.set(key, matches[0].className);
      pending.delete(key);
      discovered++;
      console.warn(`[Bookmarked] ${key}: discriminator ${property}=${value} not found, using first match`);
    }
  }

  if (discovered > 0) {
    console.log(`[Bookmarked] Discovered ${discovered} CSS classes from stylesheets`);
  }
  if (pending.size > 0) {
    console.warn(`[Bookmarked] ${pending.size} CSS classes not found in stylesheets`);
  }
}

function scanRules(rules, simple, discriminated, keyRegexes, candidates) {
  let discovered = 0;
  for (const rule of rules) {
    if (simple.size === 0 && discriminated.size === 0) break;
    // Recurse into grouped rules (@layer, @media, @supports, etc.)
    // Note: CSS nesting means CSSStyleRule also has cssRules (length 0),
    // so check length to avoid skipping the selectorText match below.
    if (rule.cssRules && rule.cssRules.length > 0) {
      discovered += scanRules(rule.cssRules, simple, discriminated, keyRegexes, candidates);
      continue;
    }
    if (!rule.selectorText) continue;

    // Check simple keys (first match wins)
    for (const key of simple) {
      if (!rule.selectorText.includes(key)) continue;
      const match = rule.selectorText.match(keyRegexes.get(key));
      if (match) {
        CSS_CLASSES.set(key, match[0].slice(1)); // remove leading dot
        simple.delete(key);
        discovered++;
        break;
      }
    }

    // Check discriminated keys (collect all candidates)
    for (const key of discriminated) {
      if (!rule.selectorText.includes(key)) continue;
      const match = rule.selectorText.match(keyRegexes.get(key));
      if (match && rule.selectorText === match[0]) {
        // Only consider rules where the selector IS the class (not compound selectors)
        candidates.get(key).push({ className: match[0].slice(1), rule });
      }
    }
  }
  return discovered;
}

// Format date to relative time string
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'just now';

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;

  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears}y ago`;
}
