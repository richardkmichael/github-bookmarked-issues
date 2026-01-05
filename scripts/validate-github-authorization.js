#!/usr/bin/env node

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
    console.error(`${expiredCount} cookie(s) expired - regenerate with: node scripts/obtain-github-authorization.js`);
    process.exit(1);
  }

  console.log();
  console.log('Auth state appears valid');
} catch (e) {
  console.error('Failed to decode GITHUB_AUTH_STATE:', e.message);
  process.exit(1);
}
