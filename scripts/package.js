#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const browser = process.argv[2];
if (!browser || !['chrome', 'firefox'].includes(browser)) {
  console.error('Usage: node package.js [chrome|firefox]');
  process.exit(1);
}

async function packageExtension() {
  const buildDir = path.join(ROOT, 'build', browser);
  const manifestPath = path.join(buildDir, 'manifest.json');

  // Read version from manifest
  const manifestContent = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);
  const version = manifest.version;

  const packageName = `github-bookmarked-issues-${version}`;

  if (browser === 'chrome') {
    // Create ZIP for Chrome
    const zipFile = `${packageName}.zip`;
    console.log(`Creating Chrome package: ${zipFile}...`);

    execSync(`zip -r "${zipFile}" . -x "*.zip"`, {
      cwd: buildDir,
      stdio: 'inherit'
    });

    console.log(`✓ Chrome package created at build/chrome/${zipFile}`);
  } else {
    // Use web-ext for Firefox
    console.log(`Creating Firefox package: ${packageName}.xpi...`);

    execSync(`web-ext build --source-dir=. --artifacts-dir=. --filename="${packageName}.xpi" --overwrite-dest`, {
      cwd: buildDir,
      stdio: 'inherit'
    });

    console.log(`✓ Firefox package created at build/firefox/${packageName}.xpi`);
  }
}

packageExtension().catch(err => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
