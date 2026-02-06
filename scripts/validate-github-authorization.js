#!/usr/bin/env node

/**
 * Validates GitHub session auth from GITHUB_AUTH_STATE environment variable.
 * Can be run as CLI or imported as a module.
 */

/**
 * Decodes and validates GITHUB_AUTH_STATE, returns the storage state or null.
 * @param {string} [encoded] - Base64-encoded auth state (defaults to env var)
 * @returns {object|null} - Playwright storageState object, or null if invalid
 */
export function getGitHubAuth(encoded = process.env.GITHUB_AUTH_STATE) {
  if (!encoded) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    const githubCookies = decoded.cookies?.filter(c => c.domain?.includes('github')) || [];
    if (githubCookies.length === 0) return null;

    // Check for expired cookies (expires > 0 means it has expiry, not a session cookie)
    const expiredCount = githubCookies.filter(c => c.expires > 0 && c.expires * 1000 < Date.now()).length;
    if (expiredCount > 0) return null;

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Returns a descriptive reason why session auth is unavailable, or null if valid.
 * @param {string} [encoded] - Base64-encoded auth state (defaults to env var)
 * @returns {string|null} - Error message, or null if auth is valid
 */
export function getSessionSkipReason(encoded = process.env.GITHUB_AUTH_STATE) {
  if (!encoded) {
    return 'GITHUB_AUTH_STATE not set. Run: node scripts/obtain-github-authorization.js --update';
  }
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    const githubCookies = decoded.cookies?.filter(c => c.domain?.includes('github')) || [];
    if (githubCookies.length === 0) {
      return 'GITHUB_AUTH_STATE has no GitHub cookies';
    }
    const expiredCount = githubCookies.filter(c => c.expires > 0 && c.expires * 1000 < Date.now()).length;
    if (expiredCount > 0) {
      return `GITHUB_AUTH_STATE has ${expiredCount} expired cookie(s). Run: node scripts/obtain-github-authorization.js --update`;
    }
    return null; // Auth is valid
  } catch (e) {
    return `GITHUB_AUTH_STATE decode failed: ${e.message}`;
  }
}

/**
 * Validates GitHub PAT by making an API call. Returns skip reason or null if valid.
 * @param {string} [pat] - GitHub PAT (defaults to env var)
 * @returns {Promise<string|null>} - Error message, or null if PAT is valid
 */
export async function getPatSkipReason(pat = process.env.API_CONTRACT_TEST_PAT) {
  if (!pat) {
    return 'API_CONTRACT_TEST_PAT not set';
  }
  try {
    const response = await fetch('https://api.github.com/rate_limit', {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (response.status === 401) {
      return 'API_CONTRACT_TEST_PAT is expired or invalid (HTTP 401)';
    }
    if (!response.ok) {
      return `API_CONTRACT_TEST_PAT validation failed (HTTP ${response.status})`;
    }
    return null; // PAT is valid
  } catch (e) {
    return `API_CONTRACT_TEST_PAT validation error: ${e.message}`;
  }
}

// CLI behavior when run directly
const isMain = process.argv[1]?.endsWith('validate-github-authorization.js');
if (isMain) {
  const encoded = process.env.GITHUB_AUTH_STATE;

  if (!encoded) {
    console.error('GITHUB_AUTH_STATE environment variable is not set');
    process.exit(1);
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));

    console.log('Cookies:', decoded.cookies?.length || 0);
    console.log('Origins:', decoded.origins?.length || 0);
    console.log();

    const githubCookies = decoded.cookies?.filter(c => c.domain?.includes('github')) || [];

    if (githubCookies.length === 0) {
      console.error('No GitHub cookies found - auth state may be invalid');
      process.exit(1);
    }

    console.log('GitHub cookies:');
    githubCookies.forEach(c => {
      // expires <= 0 means session cookie, not expired
      const isSession = !c.expires || c.expires <= 0;
      const expires = isSession ? 'session' : new Date(c.expires * 1000).toISOString();
      const expired = !isSession && c.expires * 1000 < Date.now() ? ' (EXPIRED)' : '';
      console.log(`  ${c.name} ${c.domain} ${expires}${expired}`);
    });

    const expiredCount = githubCookies.filter(c => c.expires > 0 && c.expires * 1000 < Date.now()).length;
    if (expiredCount > 0) {
      console.log();
      console.error(`${expiredCount} cookie(s) expired - regenerate with: node scripts/obtain-github-authorization.js --update`);
      process.exit(1);
    }

    console.log();
    console.log('Auth state appears valid');
  } catch (e) {
    console.error('Failed to decode GITHUB_AUTH_STATE:', e.message);
    process.exit(1);
  }
}
