import { NextRequest, NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';
import { upsertFromEmail, getReservations } from '@/lib/reservations';
import { getFleet } from '@/lib/whatsgps';

/**
 * GET /api/reservations/sync
 * Fetches recent Turo emails from Gmail, parses them, and upserts reservations.
 * Query params:
 *   ?days=7  — how far back to look (default 7)
 *   ?max=50  — max emails to fetch (default 50)
 */
export async function GET(req: NextRequest) {
  try {
    const days = parseInt(req.nextUrl.searchParams.get('days') || '7');
    const max = parseInt(req.nextUrl.searchParams.get('max') || '50');

    const afterDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Fetch fleet for car matching
    let fleetCars: Array<{ carId: string; name: string }> = [];
    try {
      const fleet = await getFleet();
      fleetCars = fleet.map(c => ({ carId: c.carId, name: c.name }));
    } catch (e) {
      console.warn('Could not fetch fleet for car matching:', e);
    }

    // Fetch emails from Gmail
    const emails = await fetchTuroEmails(max, afterDate);

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const email of emails) {
      try {
        const parsed = parseTuroEmail(email.body || email.subject);
        if (parsed) {
          upsertFromEmail(parsed, fleetCars);
          processed++;
        } else {
          skipped++;
        }
      } catch (e: any) {
        errors.push(`${email.id}: ${e.message}`);
      }
    }

    const reservations = getReservations();

    return NextResponse.json({
      success: true,
      emailsFetched: emails.length,
      processed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      totalReservations: reservations.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
