#!/usr/bin/env node
/**
 * Turo Guest Link Sender v2 — Headless Chrome with Stealth
 * 
 * Uses puppeteer-extra + stealth plugin to bypass Cloudflare.
 * Session cookies (remember me + refresh token) avoid needing to log in.
 * 
 * Runs every 15 min via cron on VPS.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// --- Config ---
const DB_URL = process.env.DATABASE_URL;
const COOKIES_PATH = process.env.COOKIES_PATH || path.join(__dirname, 'turo-cookies.json');
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
const APP_BASE_URL = 'https://turo-fleet-app-theta.vercel.app';

const GUEST_MESSAGE = `Here is the link for you to find the car, unlock it and lock it. To find the car, simply click "Navigate to Car" and it will open Google Maps directing you to the car. When you are at the car, you can use the app to unlock it. The controls will display 30 minutes prior to your scheduled trip start time. Make sure you have uploaded your driver's license prior to starting the trip. The key will be in the center console inside a black RFID pouch. Please put it back in the pouch after trip end and lock the car with the app.`;

async function alertSlack(message) {
  if (!SLACK_WEBHOOK) {
    console.error('[ALERT]', message);
    return;
  }
  try {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🚨 Guest Link Bot: ${message}` }),
    });
  } catch (e) {
    console.error('Slack alert failed:', e.message);
  }
}

function loadCookies() {
  if (!fs.existsSync(COOKIES_PATH)) {
    throw new Error(`Cookie file not found: ${COOKIES_PATH}`);
  }
  const data = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
  // Convert {name: value} to puppeteer cookie format
  const cookies = [];
  for (const [name, value] of Object.entries(data)) {
    cookies.push({
      name,
      value: String(value),
      domain: '.turo.com',
      path: '/',
    });
  }
  return cookies;
}

function saveCookies(puppeteerCookies) {
  const obj = {};
  for (const c of puppeteerCookies) {
    obj[c.name] = c.value;
  }
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(obj, null, 2));
}

async function getReservationsToSend(sql) {
  const rows = await sql`
    SELECT reservation_id, renter_token, guest_name, vehicle_model, trip_start
    FROM reservations
    WHERE trip_start <= NOW() + INTERVAL '75 minutes'
      AND trip_start >= NOW() - INTERVAL '30 minutes'
      AND car_id IS NOT NULL
      AND link_sent = false
      AND status IN ('booked', 'active')
    ORDER BY trip_start ASC
  `;
  return rows;
}

async function markLinkSent(sql, reservationId) {
  await sql`
    UPDATE reservations 
    SET link_sent = true, link_sent_at = NOW() 
    WHERE reservation_id = ${reservationId}
  `;
}

async function sendGuestLink(page, reservation) {
  const { reservation_id, renter_token, guest_name } = reservation;
  const link = `${APP_BASE_URL}/trip/${renter_token}`;
  const fullMessage = `${GUEST_MESSAGE}\n${link}`;

  console.log(`Sending link to ${guest_name} (res ${reservation_id})...`);

  // Navigate to the reservation's message thread
  await page.goto(`https://turo.com/us/en/inbox/messages/thread/${reservation_id}`, {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  // Check if we got redirected to login
  const url = page.url();
  if (url.includes('login')) {
    throw new Error('Session expired — redirected to login');
  }

  // Wait for the message input area
  // Turo uses a textarea or contenteditable div for messages
  await page.waitForSelector('textarea, [contenteditable="true"], [data-testid*="message"]', {
    timeout: 15000,
  });

  // Find and click the textarea/input
  const inputEl = await page.$('textarea, [contenteditable="true"], [data-testid*="message"]');
  if (!inputEl) {
    throw new Error('Could not find message input');
  }
  await inputEl.click();
  await new Promise(r => setTimeout(r, 500));

  // Type the message line by line (Shift+Enter for newlines within the message)
  const lines = fullMessage.split('\n');
  for (let i = 0; i < lines.length; i++) {
    await page.keyboard.type(lines[i], { delay: 5 });
    if (i < lines.length - 1) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
  }

  await new Promise(r => setTimeout(r, 1000));

  // Send by pressing Enter (Turo's send button is an icon that's hard to target,
  // but Enter sends the message reliably)
  await page.keyboard.press('Enter');

  // Wait for message to send
  await new Promise(r => setTimeout(r, 3000));
  console.log(`✅ Sent to ${guest_name}`);
  return true;
}

async function main() {
  if (!DB_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = neon(DB_URL);
  const reservations = await getReservationsToSend(sql);

  if (reservations.length === 0) {
    console.log('No guest links to send.');
    return;
  }

  console.log(`Found ${reservations.length} reservation(s) to send links for.`);

  // Load session cookies
  let cookies;
  try {
    cookies = loadCookies();
  } catch (e) {
    await alertSlack(e.message);
    console.error(e.message);
    process.exit(1);
  }

  // Launch stealth browser
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Set cookies before navigating
    await page.setCookie(...cookies);

    // Test session by visiting a protected page
    await page.goto('https://turo.com/us/en/trips', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const url = page.url();
    if (url.includes('login')) {
      const msg = '⚠️ Session expired — cookies need refreshing. Eduardo needs to re-export cookies.';
      await alertSlack(msg);
      console.error(msg);
      await browser.close();
      process.exit(1);
    }

    // Dismiss cookie banner if present
    try {
      const closeBtn = await page.$('button.osano-cm-dialog__close');
      if (closeBtn) { await closeBtn.click(); await new Promise(r => setTimeout(r, 500)); }
    } catch(e) {}

    console.log('Session valid. Logged in as host.');

    // Save updated cookies (Turo may have refreshed tokens)
    const updatedCookies = await page.cookies();
    saveCookies(updatedCookies);

    // Send each guest link
    for (const res of reservations) {
      try {
        await sendGuestLink(page, res);
        await markLinkSent(sql, res.reservation_id);
      } catch (e) {
        const msg = `Failed to send link for ${res.guest_name} (res ${res.reservation_id}, ${res.vehicle_model}): ${e.message}`;
        console.error(msg);
        await alertSlack(msg);

        // Take debug screenshot
        try {
          await page.screenshot({
            path: `/home/deploy/turo-bot/debug-${res.reservation_id}.png`,
          });
        } catch (_) {}

        if (e.message.includes('Session expired')) break;
      }
    }
  } catch (e) {
    const msg = `Guest link bot error: ${e.message}`;
    console.error(msg);
    await alertSlack(msg);
  } finally {
    await browser.close();
  }

  console.log('Done.');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
