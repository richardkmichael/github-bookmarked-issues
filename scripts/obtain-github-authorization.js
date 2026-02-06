#!/usr/bin/env node

import { chromium } from '@playwright/test';
import * as readline from 'readline';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const backupPath = path.join(projectRoot, '.env.expired_auth.bak');

const updateEnv = process.argv.includes('--update');

async function main() {
  console.error('Opening browser for GitHub login...');
  console.error('Log in, then press Enter here when done.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://github.com/login');

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  await new Promise(resolve => rl.question('Press Enter after logging in...', resolve));
  rl.close();

  const state = await context.storageState();
  const base64 = Buffer.from(JSON.stringify(state)).toString('base64');

  await browser.close();

  if (updateEnv) {
    updateEnvFile(base64);
  } else {
    const envLine = `GITHUB_AUTH_STATE=${base64}`;
    if (process.stdout.isTTY) {
      console.log('\nAdd this to your .env file:\n');
      console.log(envLine);
    } else {
      console.log(envLine);
      console.error('\nGITHUB_AUTH_STATE written to stdout');
    }
  }
}

// Replace (or append) GITHUB_AUTH_STATE in .env, backing up first.
function updateEnvFile(newValue) {
  const envLine = `export GITHUB_AUTH_STATE=${newValue}`;
  const pattern = /^(export\s+)?GITHUB_AUTH_STATE=.*$/m;

  if (existsSync(envPath)) {
    copyFileSync(envPath, backupPath);
    console.error('Backed up .env to .env.expired_auth.bak');

    const existing = readFileSync(envPath, 'utf-8');
    if (pattern.test(existing)) {
      writeFileSync(envPath, existing.replace(pattern, envLine));
    } else {
      const separator = existing.endsWith('\n') ? '' : '\n';
      writeFileSync(envPath, existing + separator + envLine + '\n');
    }
  } else {
    writeFileSync(envPath, envLine + '\n');
  }

  console.error('Updated GITHUB_AUTH_STATE in .env');
}

main().catch(console.error);
