#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const type = process.argv[2] || 'patch';
if (!['major', 'minor', 'patch'].includes(type)) {
  console.error('Usage: node bump.js [major|minor|patch]');
  process.exit(1);
}

async function bumpManifest(manifestPath) {
  const content = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(content);

  const [major, minor, patch] = manifest.version.split('.').map(Number);

  switch (type) {
    case 'major':
      manifest.version = `${major + 1}.0.0`;
      break;
    case 'minor':
      manifest.version = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      manifest.version = `${major}.${minor}.${patch + 1}`;
      break;
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest.version;
}

async function bump() {
  const chromeManifest = path.join(ROOT, 'extension', 'manifest-chrome.json');
  const firefoxManifest = path.join(ROOT, 'extension', 'manifest-firefox.json');

  const chromeVersion = await bumpManifest(chromeManifest);
  const firefoxVersion = await bumpManifest(firefoxManifest);

  if (chromeVersion !== firefoxVersion) {
    console.error('ERROR: Version mismatch after bump!');
    process.exit(1);
  }

  console.log(`✓ Version bumped to ${chromeVersion}`);
}

bump().catch(err => {
  console.error('Version bump failed:', err);
  process.exit(1);
});
