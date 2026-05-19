#!/usr/bin/env node
/**
 * Turo Guest Link Sender — API-based (no browser needed)
 * 
 * Uses Turo's internal API with cookie auth.
 * Cookies exported from a logged-in Chrome session.
 * 
 * Runs every 15 min via cron on VPS.
 */

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

// --- Config ---
const DB_URL = process.env.DATABASE_URL;
const COOKIES_PATH = process.env.COOKIES_PATH || path.join(__dirname, 'turo-cookies.json');
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
const APP_BASE_URL = 'https://turo-fleet-app-theta.vercel.app';
const LOOKAHEAD_MINUTES = 75;

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
    throw new Error(`Cookie file not found: ${COOKIES_PATH}. Run export-cookies.sh first.`);
  }
  const data = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
  // Support both formats: array of {name,value} or plain object {name: value}
  if (Array.isArray(data)) {
    return data.map(c => `${c.name}=${c.value}`).join('; ');
  }
  return Object.entries(data).map(([k, v]) => `${k}=${v}`).join('; ');
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

async function sendMessage(cookieString, reservationId, message) {
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="message"',
    '',
    message,
    `--${boundary}`,
    'Content-Disposition: form-data; name="reservationId"',
    '',
    String(reservationId),
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch('https://turo.com/api/v2/message/send', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Cookie': cookieString,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      'Origin': 'https://turo.com',
      'Referer': `https://turo.com/ca/en/inbox/messages/thread/${reservationId}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  }

  return await res.json();
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

  const sql = neon(DB_URL);
  const reservations = await getReservationsToSend(sql);

  if (reservations.length === 0) {
    console.log('No guest links to send.');
    return;
  }

  console.log(`Found ${reservations.length} reservation(s) to send links for.`);

  let cookieString;
  try {
    cookieString = loadCookies();
  } catch (e) {
    await alertSlack(e.message);
    console.error(e.message);
    process.exit(1);
  }

  for (const res of reservations) {
    const { reservation_id, renter_token, guest_name, vehicle_model } = res;
    const link = `${APP_BASE_URL}/trip/${renter_token}`;
    const fullMessage = `${GUEST_MESSAGE}\n${link}`;

    console.log(`Sending link to ${guest_name} (res ${reservation_id}, ${vehicle_model})...`);

    try {
      await sendMessage(cookieString, reservation_id, fullMessage);
      await markLinkSent(sql, reservation_id);
      console.log(`✅ Sent to ${guest_name}`);
    } catch (e) {
      const msg = `Failed to send link for ${guest_name} (res ${reservation_id}, ${vehicle_model}): ${e.message}`;
      console.error(msg);
      await alertSlack(msg);

      // If auth error, alert and stop
      if (e.message.includes('401') || e.message.includes('403') || e.message.includes('blocked')) {
        await alertSlack('⚠️ Auth expired — cookies need refreshing. Run: openclaw turo-cookies');
        break;
      }
    }
  }

  console.log('Done.');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
