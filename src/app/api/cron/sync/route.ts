import { NextRequest, NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';
import { initDB, upsertFromEmail } from '@/lib/reservations';
import { getFleet } from '@/lib/whatsgps';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Pro plan

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initDB();

    // Fetch fleet for car matching
    let fleetCars: Array<{ carId: string; name: string }> = [];
    try {
      const fleet = await getFleet();
      fleetCars = fleet.map(c => ({ carId: c.carId, name: c.name }));
    } catch (e) {
      console.warn('Could not fetch fleet:', e);
    }

    // Look back 2 hours for new bookings/changes
    const afterDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const emails = await fetchTuroEmails(20, afterDate);

    // Also look back 7 days for cancellations (they can come anytime)
    const cancelAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const cancelEmails = await fetchTuroEmails(20, cancelAfter, ['cancelled']);
    
    // Merge, dedup by id
    const seenIds = new Set(emails.map(e => e.id));
    for (const ce of cancelEmails) {
      if (!seenIds.has(ce.id)) {
        emails.push(ce);
        seenIds.add(ce.id);
      }
    }

    // Sort by date so cancellations (which come after bookings) are processed last
    emails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let processed = 0;
    let skipped = 0;

    for (const email of emails) {
      try {
        const parsed = parseTuroEmail(email.body || email.subject, email.htmlBody);
        if (parsed) {
          await upsertFromEmail(parsed, fleetCars);
          processed++;
        } else {
          skipped++;
        }
      } catch (e: any) {
        console.error(`Error processing email ${email.id}:`, e.message);
      }
    }

    // Re-match any booked/active reservations still missing car_id
    // This catches duplicates that need GPS fallback or re-parsed location
    let rematched = 0;
    try {
      const { sql } = await import('@vercel/postgres');
      const { matchCarId } = await import('@/lib/reservations');
      const unmatched = await sql`
        SELECT id, vehicle_model, vehicle_year, location, reservation_id
        FROM reservations
        WHERE car_id IS NULL AND status IN ('booked', 'active')
      `;
      for (const row of unmatched.rows) {
        const carId = await matchCarId(row.vehicle_model || '', row.vehicle_year || '', row.location || undefined);
        if (carId) {
          await sql`UPDATE reservations SET car_id = ${carId}, updated_at = NOW() WHERE id = ${row.id}`;
          rematched++;
        }
      }
    } catch (e: any) {
      console.error('Rematch step failed:', e.message);
    }

    return NextResponse.json({
      success: true,
      emailsFetched: emails.length,
      processed,
      skipped,
      rematched,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('Cron sync error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
