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
