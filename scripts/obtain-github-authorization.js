#!/usr/bin/env node

import { chromium } from '@playwright/test';
import * as readline from 'readline';

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

  const envLine = `GITHUB_AUTH_STATE=${base64}`;

  if (process.stdout.isTTY) {
    // Interactive: show instructions and env var
    console.log('\nAdd this to your .env file:\n');
    console.log(envLine);
  } else {
    // Redirected: output only env var to stdout, success message to stderr
    console.log(envLine);
    console.error('\nGITHUB_AUTH_STATE written to stdout');
  }
}

main().catch(console.error);
