#!/usr/bin/env node
/**
 * Automated Turo Guest Link Sender
 * Runs every 15 min via cron on VPS.
 * Queries Neon DB for upcoming trips, sends guest links via Turo messaging.
 */

const puppeteer = require('puppeteer');
const { neon } = require('@neondatabase/serverless');

// --- Config ---
const DB_URL = process.env.DATABASE_URL;
const TURO_EMAIL = process.env.TURO_EMAIL;
const TURO_PASSWORD = process.env.TURO_PASSWORD;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK; // Optional: for failure alerts
const APP_BASE_URL = 'https://turo-fleet-app-theta.vercel.app';
const LOOKAHEAD_MINUTES = 75;
const COOKIES_PATH = '/home/deploy/turo-cookies.json';

const fs = require('fs');

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

async function saveCookies(page) {
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
}

async function loadCookies(page) {
  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
    if (cookies.length) {
      await page.setCookie(...cookies);
      return true;
    }
  }
  return false;
}

async function loginToTuro(page) {
  console.log('Logging into Turo...');
  await page.goto('https://turo.com/us/en/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 15000 });
  
  await page.type('input[name="email"], input[type="email"]', TURO_EMAIL, { delay: 50 });
  await page.type('input[name="password"], input[type="password"]', TURO_PASSWORD, { delay: 50 });
  
  // Click login button
  const loginBtn = await page.$('button[type="submit"]');
  if (loginBtn) {
    await loginBtn.click();
  }
  
  // Wait for navigation after login
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  
  // Check if logged in
  const url = page.url();
  if (url.includes('login')) {
    throw new Error('Login failed — still on login page');
  }
  
  await saveCookies(page);
  console.log('Login successful, cookies saved.');
}

async function ensureLoggedIn(page) {
  const hasCookies = await loadCookies(page);
  
  // Navigate to Turo and check if session is valid
  await page.goto('https://turo.com/us/en/trips', { waitUntil: 'networkidle2' });
  
  const url = page.url();
  if (url.includes('login') || !hasCookies) {
    await loginToTuro(page);
  } else {
    console.log('Session valid (cookies loaded).');
  }
}

async function sendGuestLink(page, reservation) {
  const { reservation_id, renter_token, guest_name } = reservation;
  const link = `${APP_BASE_URL}/trip/${renter_token}`;
  const fullMessage = `${GUEST_MESSAGE}\n${link}`;

  console.log(`Sending link to ${guest_name} (res ${reservation_id})...`);

  // Navigate to Turo messages for this reservation
  await page.goto(`https://turo.com/us/en/reservation/${reservation_id}/messages`, {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  // Wait for message input
  const textareaSelector = 'textarea, [contenteditable="true"], input[type="text"]';
  await page.waitForSelector(textareaSelector, { timeout: 15000 });

  // Clear and type message
  const textarea = await page.$(textareaSelector);
  await textarea.click();
  
  // Type the message (using keyboard to handle newlines)
  for (const line of fullMessage.split('\n')) {
    await page.keyboard.type(line, { delay: 10 });
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
  }

  // Find and click Send button
  const sendBtn = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => b.textContent.trim().toLowerCase() === 'send');
  });

  if (!sendBtn) {
    throw new Error(`Could not find Send button for res ${reservation_id}`);
  }

  await sendBtn.click();
  
  // Wait a moment for message to send
  await new Promise(r => setTimeout(r, 3000));

  console.log(`✅ Message sent to ${guest_name}`);
  return true;
}

async function markLinkSent(sql, reservationId) {
  await sql`
    UPDATE reservations 
    SET link_sent = true, link_sent_at = NOW() 
    WHERE reservation_id = ${reservationId}
  `;
}

async function main() {
  if (!DB_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  if (!TURO_EMAIL || !TURO_PASSWORD) {
    console.error('TURO_EMAIL and TURO_PASSWORD must be set');
    process.exit(1);
  }

  const sql = neon(DB_URL);

  // Get reservations that need links
  const reservations = await getReservationsToSend(sql);

  if (reservations.length === 0) {
    console.log('No guest links to send.');
    return;
  }

  console.log(`Found ${reservations.length} reservation(s) to send links for.`);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  try {
    await ensureLoggedIn(page);

    for (const res of reservations) {
      try {
        await sendGuestLink(page, res);
        await markLinkSent(sql, res.reservation_id);
      } catch (e) {
        const msg = `Failed to send link for ${res.guest_name} (res ${res.reservation_id}, ${res.vehicle_model}): ${e.message}`;
        console.error(msg);
        await alertSlack(msg);
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
