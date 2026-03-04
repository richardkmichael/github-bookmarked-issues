import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The gecko ID from extension/manifest-firefox.json
const GECKO_ID = 'github-bookmarked-issues@extensions';

// Fixed UUID for the extension, pre-seeded so we can navigate to moz-extension:// pages.
const EXTENSION_UUID = 'b7a1c5d0-8f2e-4a3b-9c6d-1e4f7a8b2c3d';

const firefoxBuildDir = path.join(__dirname, 'build', 'firefox');

// Build an XPI (zip) from the Firefox build directory for installAddOn().
function buildXpi() {
  const xpiPath = path.join(__dirname, 'build', 'firefox-test.xpi');
  if (fs.existsSync(xpiPath)) fs.unlinkSync(xpiPath);
  execSync(`zip -r "${xpiPath}" .`, { cwd: firefoxBuildDir, stdio: 'pipe' });
  return xpiPath;
}

export const config = {
  runner: 'local',
  specs: ['./tests/firefox/**/*.spec.js'],
  maxInstances: 1,
  capabilities: [{
    browserName: 'firefox',
    browserVersion: 'stable',
    ...(process.env.WDIO_CLASSIC ? { 'wdio:enforceWebDriverClassic': true } : {}),
    'moz:firefoxOptions': {
      args: process.env.WDIO_HEADED ? [] : ['-headless'],
      prefs: {
        // Pre-seed extension UUID so we can navigate to moz-extension:// pages
        'extensions.webextensions.uuids': JSON.stringify({ [GECKO_ID]: EXTENSION_UUID }),
        // Allow unsigned extensions (works on Developer Edition/Nightly; ignored on release)
        'xpinstall.signatures.required': false,
      },
    },
  }],
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 5000,
  connectionRetryTimeout: 10000,
  connectionRetryCount: 1,
  services: [
    ['visual', {
      baselineFolder: path.join(__dirname, 'tests', 'screenshots', 'firefox'),
      formatImageName: '{tag}',
      autoSaveBaseline: true,
      screenshotPath: path.join(__dirname, 'tests', 'runs', 'firefox', 'screenshots'),
    }],
  ],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 75000,
    retries: process.env.CI ? 1 : 0,
  },

  // Install the extension via installAddOn() in the before hook rather than
  // using @wdio/firefox-profile-service, per the plan critique recommendation.
  // installAddOn() with temporary=true bypasses signature checks even on release Firefox.
  before: async function () {
    const xpiPath = buildXpi();
    const xpiData = fs.readFileSync(xpiPath).toString('base64');

    try {
      const addonId = await browser.installAddOn(xpiData, true);
      console.log(`Extension installed: ${addonId}`);
    } catch (err) {
      console.error('Failed to install extension:', err.message);
      throw err;
    }
  },
};
