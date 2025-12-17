#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'extension');

const browser = process.argv[2];
if (!browser || !['chrome', 'firefox'].includes(browser)) {
  console.error('Usage: node copy.js [chrome|firefox]');
  process.exit(1);
}

const TARGET = path.join(ROOT, 'build', browser);

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

  // Copy and rename the correct manifest
  const manifestSrc = path.join(SOURCE, `manifest-${browser}.json`);
  const manifestDest = path.join(TARGET, 'manifest.json');
  await fs.copyFile(manifestSrc, manifestDest);

  console.log(`✓ Extension files copied for ${browser}`);
}

build().catch(err => {
  console.error('Build preparation failed:', err);
  process.exit(1);
});
