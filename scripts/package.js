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
  const bundleDir = path.join(ROOT, 'build', 'bundle');
  const manifestPath = path.join(buildDir, 'manifest.json');

  // Create bundle directory
  await fs.mkdir(bundleDir, { recursive: true });

  // Read version from manifest (prefer version_name for dev builds)
  const manifestContent = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);
  const version = manifest.version_name || manifest.version;

  const packageName = `github-bookmarked-issues-${version}`;

  if (browser === 'chrome') {
    // Create ZIP for Chrome
    const zipFile = `${packageName}.zip`;
    const zipPath = path.join(bundleDir, zipFile);
    console.log(`Creating Chrome package: ${zipFile}...`);

    execSync(`zip -r "${zipPath}" . -x "*.zip"`, {
      cwd: buildDir,
      stdio: 'inherit'
    });

    console.log(`✓ Chrome package created at build/bundle/${zipFile}`);
  } else {
    // Use web-ext for Firefox
    const xpiFile = `${packageName}.xpi`;
    console.log(`Creating Firefox package: ${xpiFile}...`);

    execSync(`web-ext build --source-dir=. --artifacts-dir="${bundleDir}" --filename="${xpiFile}" --overwrite-dest`, {
      cwd: buildDir,
      stdio: 'inherit'
    });

    console.log(`✓ Firefox package created at build/bundle/${xpiFile}`);
  }
}

packageExtension().catch(err => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
