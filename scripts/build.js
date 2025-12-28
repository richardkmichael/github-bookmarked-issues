#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const browser = process.argv[2];
if (!browser || !['chrome', 'firefox'].includes(browser)) {
  console.error('Usage: node build.js [chrome|firefox]');
  process.exit(1);
}

const OUTPUT_DIR = path.join(ROOT, 'build', browser, 'assets', 'vendor');

async function buildVendor() {
  console.log(`Building vendor dependencies for ${browser}...`);

  // Relative time source from node_modules (use bundle.js, not index.js)
  const source = path.join(ROOT, 'node_modules', '@github', 'relative-time-element', 'dist', 'bundle.js');

  // Check if dependency is installed
  try {
    await fs.access(source);
  } catch {
    console.error('ERROR: @github/relative-time-element not found in node_modules.');
    console.error('Run: npm install');
    process.exit(1);
  }

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Copy the relative time source bundle file to vendor, renaming for clarity.
  const dest = path.join(OUTPUT_DIR, 'relative-time-element.js');
  await fs.copyFile(source, dest);

  console.log(`✓ Vendor dependencies built for ${browser}`);
}

buildVendor().catch(err => {
  console.error('Vendor build failed:', err);
  process.exit(1);
});
