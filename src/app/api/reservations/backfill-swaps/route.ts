import { NextRequest, NextResponse } from 'next/server';
import { searchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';
import { initDB, upsertFromEmail, muteSlack } from '@/lib/reservations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One-off repair: re-read past vehicle-swap emails and every later email for those trips,
 * so trips swapped before this feature existed get the right car.
 * GET /api/reservations/backfill-swaps?after=2026/03/01&offset=0&limit=8   (Authorization: Bearer CRON_SECRET)
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await initDB();
  const after = req.nextUrl.searchParams.get('after') || '2026/03/01';
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '8');

  const swapEmails = await searchTuroEmails(`subject:"vehicle swap request" after:${after}`, 100);
  const tripIds = Array.from(new Set(swapEmails
    .map(e => parseTuroEmail(e.body || e.subject, e.htmlBody)?.reservationId)
    .filter(Boolean) as string[]));

  const results: any[] = [];
  muteSlack(true); // these are old swaps — don't flood Slack
  try {
  for (const id of tripIds.slice(offset, offset + limit)) {
    const emails = await searchTuroEmails(`"${id}"`, 50);
    emails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let processed = 0;
    let final: any = null;
    for (const email of emails) {
      const parsed = parseTuroEmail(email.body || email.subject, email.htmlBody);
      if (!parsed || parsed.reservationId !== id) continue;
      // Booking emails only create a missing reservation; never re-apply their (original) car
      final = await upsertFromEmail(parsed, undefined, email.date);
      processed++;
    }
    results.push({
      reservationId: id, emails: emails.length, processed,
      guest: final?.guestName, vehicle: final ? `${final.vehicleYear} ${(final.vehicleModel || '').trim()}` : null,
      carId: final?.carId || null, swapStatus: final?.swapStatus || null, status: final?.status || null,
    });
  }
  } finally {
    muteSlack(false);
  }
  return NextResponse.json({ totalSwapTrips: tripIds.length, offset, limit, nextOffset: offset + limit < tripIds.length ? offset + limit : null, results });
}
