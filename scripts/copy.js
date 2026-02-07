#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'extension');

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      typeof override[key] === 'object' && override[key] !== null &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object' && base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

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

    // Skip manifest files - handled separately (base + browser override merged)
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

  // Merge base manifest with browser-specific overrides
  const base = JSON.parse(await fs.readFile(path.join(SOURCE, 'manifest-base.json'), 'utf8'));
  const overrides = JSON.parse(await fs.readFile(path.join(SOURCE, `manifest-${browser}.json`), 'utf8'));
  const manifest = deepMerge(base, overrides);
  const manifestDest = path.join(TARGET, 'manifest.json');

  const versionName = getVersionName(manifest.version);
  if (versionName !== manifest.version) {
    // version_name is Chrome-specific; Firefox warns about unknown properties
    if (browser === 'chrome') {
      manifest.version_name = versionName;
    }
    console.log(`  Version: ${versionName}`);
  }

  const sortedKeys = (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  };
  await fs.writeFile(manifestDest, JSON.stringify(manifest, sortedKeys, 2) + '\n');

  // Write version name for package.js (Firefox manifest can't store it)
  await fs.writeFile(path.join(TARGET, '.version_name'), versionName);

  console.log(`✓ Extension files copied for ${browser}`);
}

build().catch(err => {
  console.error('Build preparation failed:', err);
  process.exit(1);
});
