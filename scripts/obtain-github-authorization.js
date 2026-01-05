#!/usr/bin/env node

import { chromium } from '@playwright/test';
import * as readline from 'readline';

async function main() {
  console.log('Opening browser for GitHub login...');
  console.log('Log in, then press Enter here when done.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://github.com/login');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('Press Enter after logging in...', resolve));
  rl.close();

  const state = await context.storageState();
  const base64 = Buffer.from(JSON.stringify(state)).toString('base64');

  await browser.close();

  console.log('\nAdd this to your .env file:\n');
  console.log(`GITHUB_AUTH_STATE=${base64}`);
}

main().catch(console.error);
