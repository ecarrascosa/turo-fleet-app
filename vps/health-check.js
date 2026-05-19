#!/usr/bin/env node
/**
 * Turo Session Health Check
 * Runs daily via cron. Tests if cookies are still valid.
 * Alerts Slack if session is expired so Eduardo can re-export cookies
 * BEFORE any guest links fail to send.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const COOKIES_PATH = process.env.COOKIES_PATH || path.join(__dirname, 'turo-cookies.json');
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;

async function alertSlack(message) {
  if (!SLACK_WEBHOOK) {
    console.error('[ALERT]', message);
    return;
  }
  try {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch (e) {
    console.error('Slack alert failed:', e.message);
  }
}

async function main() {
  if (!fs.existsSync(COOKIES_PATH)) {
    await alertSlack('🚨 Turo Bot: Cookie file missing! Guest links will NOT be sent. Please re-export cookies.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
  const cookies = Object.entries(data).map(([name, value]) => ({
    name, value: String(value), domain: '.turo.com', path: '/',
  }));

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setCookie(...cookies);

  try {
    await page.goto('https://turo.com/us/en/trips', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const url = page.url();
    if (url.includes('login')) {
      await alertSlack('🚨 Turo Bot: Session EXPIRED! Guest links will NOT be sent until you re-export cookies.\n\nTo fix:\n1. Open turo.com in Chrome (make sure you\'re logged in)\n2. Tell David to re-export the cookies');
      console.log('FAIL: Session expired');
    } else {
      // Session is valid — save refreshed cookies
      const updated = await page.cookies();
      const obj = {};
      for (const c of updated) obj[c.name] = c.value;
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(obj, null, 2));
      console.log('OK: Session valid, cookies refreshed');
    }
  } catch (e) {
    await alertSlack(`⚠️ Turo Bot Health Check failed: ${e.message}`);
    console.error('ERROR:', e.message);
  }

  await browser.close();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
