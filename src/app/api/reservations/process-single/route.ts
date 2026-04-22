import { NextRequest, NextResponse } from 'next/server';
import { parseTuroEmail } from '@/lib/turo-emails';
import { initDB, upsertFromEmail } from '@/lib/reservations';
import { getFleet } from '@/lib/whatsgps';
import { fetchTuroEmails } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

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

  // Use the service account gmail lib to search for this reservation
  // Search across booking, modification, and cancellation emails
  const emails = await fetchTuroEmails(50, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  
  const matchingEmail = emails.find(e => e.body.includes(resId) || e.subject.includes(resId));
  if (!matchingEmail) {
    return NextResponse.json({ error: 'No booking email found', resId });
  }

  const parsed = parseTuroEmail(matchingEmail.body);
  if (!parsed) return NextResponse.json({ error: 'Parse failed', resId });

  let fleetCars: Array<{ carId: string; name: string }> = [];
  try {
    const fleet = await getFleet();
    fleetCars = fleet.map(c => ({ carId: c.carId, name: c.name }));
  } catch (e) {}

  const result = await upsertFromEmail(parsed, fleetCars);
  return NextResponse.json({ success: true, reservation: result });
}
