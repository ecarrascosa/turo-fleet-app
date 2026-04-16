import { NextRequest, NextResponse } from 'next/server';
import { parseTuroEmail } from '@/lib/turo-emails';
import { initDB, upsertFromEmail } from '@/lib/reservations';
import { getFleet } from '@/lib/whatsgps';

export const dynamic = 'force-dynamic';

async function getToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

function extractText(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const t = extractText(part);
      if (t) return t;
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  }
  return '';
}

export async function GET(req: NextRequest) {
  const resId = req.nextUrl.searchParams.get('id');
  if (!resId) return NextResponse.json({ error: 'provide ?id=reservationId' });

  await initDB();
  const token = await getToken();

  // Search for booking email
  const q = `from:noreply@mail.turo.com subject:"is booked" ${resId}`;
  const list = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const ld = await list.json();
  if (!ld.messages?.length) {
    return NextResponse.json({ error: 'No booking email found', resId });
  }

  const detail = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ld.messages[0].id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = await detail.json();
  const body = extractText(d.payload);
  const parsed = parseTuroEmail(body);
  if (!parsed) return NextResponse.json({ error: 'Parse failed', resId });

  let fleetCars: Array<{ carId: string; name: string }> = [];
  try {
    const fleet = await getFleet();
    fleetCars = fleet.map(c => ({ carId: c.carId, name: c.name }));
  } catch (e) {}

  const result = await upsertFromEmail(parsed, fleetCars);
  return NextResponse.json({ success: true, reservation: result });
}
