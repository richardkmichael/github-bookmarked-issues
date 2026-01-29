#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'extension');

const browser = process.argv[2];
if (!browser || !['chrome', 'firefox'].includes(browser)) {
  console.error('Usage: node copy.js [chrome|firefox]');
  process.exit(1);
}

const TARGET = path.join(ROOT, 'build', browser);

function getVersionName(baseVersion) {
  // Check for VERSION_TAG env var (set by CI for release builds)
  const versionTag = process.env.VERSION_TAG;
  if (versionTag) {
    return versionTag.startsWith('v') ? versionTag.slice(1) : versionTag;
  }

  try {
    // Get short commit hash
    const commitHash = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();

    // Check if HEAD is tagged (release build)
    try {
      const tag = execSync('git describe --exact-match HEAD', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      // HEAD is tagged - use tag name as version (strip 'v' prefix if present)
      return tag.startsWith('v') ? tag.slice(1) : tag;
    } catch {
      // Not tagged - development build
    }

    // Get branch name
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();

    // Check if extension source is dirty
    const dirty = execSync('git status --porcelain -- extension/', { cwd: ROOT, encoding: 'utf8' }).trim();

    if (dirty) {
      return `${baseVersion}-${branch}_${commitHash}-dirty`;
    }

    return `${baseVersion}-${branch}_${commitHash}`;
  } catch (err) {
    // Not a git repo or git not available
    console.warn('Warning: Could not get git info for version_name');
    return baseVersion;
  }
}

async function copyDirectory(src, dest, options = {}) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip manifest files - handled separately
    if (entry.name.startsWith('manifest-') && entry.name.endsWith('.json')) {
      continue;
    }

    // Skip vendor directory in source - handled separately
    if (options.skipVendor && entry.name === 'vendor') {
      continue;
    }

    // Skip store listing assets - not part of the extension
    if (entry.name === 'store') {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, options);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function build() {
  console.log(`Copying extension files for ${browser}...`);

  // Copy extension files (skip vendor as it's built separately)
  await copyDirectory(SOURCE, TARGET, { skipVendor: true });

  // Read, modify, and write manifest with version_name
  const manifestSrc = path.join(SOURCE, `manifest-${browser}.json`);
  const manifestDest = path.join(TARGET, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestSrc, 'utf8'));

  const versionName = getVersionName(manifest.version);
  if (versionName !== manifest.version) {
    // version_name is Chrome-specific; Firefox warns about unknown properties
    if (browser === 'chrome') {
      manifest.version_name = versionName;
    }
    console.log(`  Version: ${versionName}`);
  }

  await fs.writeFile(manifestDest, JSON.stringify(manifest, null, 2) + '\n');

  // Write version name for package.js (Firefox manifest can't store it)
  await fs.writeFile(path.join(TARGET, '.version_name'), versionName);

  console.log(`✓ Extension files copied for ${browser}`);
}

build().catch(err => {
  console.error('Build preparation failed:', err);
  process.exit(1);
});
