import { getSessionSkipReason, getPatSkipReason } from '../scripts/validate-github-authorization.js';

// ANSI color codes
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

export default async function globalSetup() {
  const warnings = [];

  const sessionReason = getSessionSkipReason();
  if (sessionReason) {
    process.env.SESSION_SKIP_REASON = sessionReason;
    warnings.push(`@auth-session tests will be skipped:\n  ${sessionReason}`);
  }

  const patReason = await getPatSkipReason();
  if (patReason) {
    process.env.PAT_SKIP_REASON = patReason;
    warnings.push(`@auth-pat tests will be skipped:\n  ${patReason}`);
  }

  if (warnings.length > 0) {
    console.log(`\n${yellow}${warnings.join('\n\n')}${reset}\n`);
  }
}
