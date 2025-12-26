#!/usr/bin/env node

import chokidar from 'chokidar';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

console.log('🔍 Starting development file watcher...\n');

// Initial build
console.log('📦 Running initial build...');
try {
  execSync('npm run build:firefox && npm run build:chrome', {
    cwd: ROOT,
    stdio: 'inherit'
  });
  console.log('\n✓ Initial build complete\n');
} catch (e) {
  console.error('❌ Initial build failed');
  process.exit(1);
}

console.log('👀 Watching extension/ for changes...');
console.log('   Press Ctrl+C to stop\n');

// Watch for changes
const watcher = chokidar.watch('extension', {
  cwd: ROOT,
  ignored: [
    /vendor/,
    /\.xpi$/,
    /\.zip$/,
    /\.tmp$/,
    /\.DS_Store$/,
    /node_modules/
  ],
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 100
  }
});

let isBuilding = false;
let pendingRebuild = false;

async function rebuild() {
  if (isBuilding) {
    pendingRebuild = true;
    return;
  }

  isBuilding = true;
  console.log('🔨 Rebuilding...');

  try {
    execSync('npm run build:firefox && npm run build:chrome', {
      cwd: ROOT,
      stdio: 'inherit'
    });
    console.log('✓ Build complete\n');
  } catch (e) {
    console.error('❌ Build failed\n');
  }

  isBuilding = false;

  if (pendingRebuild) {
    pendingRebuild = false;
    rebuild();
  }
}

watcher
  .on('change', (filepath) => {
    console.log(`Changed: ${filepath}`);
    rebuild();
  })
  .on('add', (filepath) => {
    console.log(`Added: ${filepath}`);
    rebuild();
  })
  .on('unlink', (filepath) => {
    console.log(`Removed: ${filepath}`);
    rebuild();
  })
  .on('error', (error) => {
    console.error('❌ Watcher error:', error);
  });
