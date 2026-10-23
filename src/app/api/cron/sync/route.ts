import { NextRequest, NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';
import { initDB, upsertFromEmail, alertSlack } from '@/lib/reservations';
import { getFleet, getOdometerMeters } from '@/lib/whatsgps';

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
          await upsertFromEmail(parsed, fleetCars, email.date);
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

    // Swaps still unresolved 3 hours before pickup: ask a human to pick the car
    let swapsNeedPick = 0;
    try {
      const { sql } = await import('@vercel/postgres');
      const esc = await sql`
        UPDATE reservations SET swap_status = 'needs_pick', updated_at = NOW()
        WHERE swap_status = 'pending' AND status IN ('booked', 'active')
          AND trip_start < NOW() + INTERVAL '3 hours'
        RETURNING reservation_id, guest_name, vehicle_year, vehicle_model, trip_start
      `;
      for (const r of esc.rows) {
        swapsNeedPick++;
        const start = new Date(r.trip_start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        await alertSlack(
          `⚠️ Swap — pick car: Res #${r.reservation_id} (${r.guest_name}) starts ${start} and we still don't know ` +
          `which car it was swapped to (was ${r.vehicle_year} ${(r.vehicle_model || '').trim()}). Pick it in the Trips page.`
        );
      }
    } catch (e: any) {
      console.error('Swap escalation failed:', e.message);
    }

    // Trip mileage: GPS odometer at trip start/end for trips starting 2026-10-23 (PT) onward.
    // Wrapped in try/catch so it can never break the email sync.
    const mileage = { started: 0, noGps: 0, finished: 0, over: 0, carChanged: 0, errors: 0, readFailures: 0 };
    try {
      mileage.noGps = await mileageMarkNoGps();
      await mileageStartReadings(mileage);
      await mileageEndReadings(mileage);
    } catch (e: any) {
      console.error('Mileage step failed:', e.message);
    }

    return NextResponse.json({
      success: true,
      mileage,
      swapsNeedPick,
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

// ---------------- Trip mileage tracking ----------------

const MILEAGE_CUTOFF = '2026-10-23 00:00:00 America/Los_Angeles';
const METERS_PER_MILE = 1609.344;
const MAX_READS_PER_RUN = 12; // keep WhatsGPS calls few and sequential

type MileageCounts = { started: number; noGps: number; finished: number; over: number; carChanged: number; errors: number; readFailures: number };

async function mileageMarkNoGps(): Promise<number> {
  const { sql } = await import('@vercel/postgres');
  const r = await sql`
    UPDATE reservations SET mileage_status = 'no_gps', updated_at = NOW()
    WHERE trip_start >= ${MILEAGE_CUTOFF}::timestamptz AND trip_start <= NOW()
      AND status <> 'cancelled' AND car_id IS NULL
      AND odometer_start_m IS NULL AND mileage_status IS NULL
  `;
  return r.rowCount ?? 0;
}

async function mileageStartReadings(c: MileageCounts) {
  const { sql } = await import('@vercel/postgres');
  const due = await sql`
    SELECT id, car_id FROM reservations
    WHERE trip_start >= ${MILEAGE_CUTOFF}::timestamptz AND trip_start <= NOW()
      AND status <> 'cancelled' AND car_id IS NOT NULL
      AND odometer_start_m IS NULL
      AND (mileage_status IS NULL OR mileage_status = 'no_gps')
      AND trip_end > NOW() -- a start reading taken after the trip ended would be meaningless
    ORDER BY trip_start ASC
    LIMIT ${MAX_READS_PER_RUN}
  `;
  for (const row of due.rows) {
    const m = await getOdometerMeters(String(row.car_id));
    if (m == null) { c.readFailures++; continue; }
    await sql`
      UPDATE reservations SET odometer_start_m = ${m}, odometer_start_at = NOW(),
        odometer_car_id = ${row.car_id}, mileage_status = 'tracking', updated_at = NOW()
      WHERE id = ${row.id} AND odometer_start_m IS NULL
    `;
    c.started++;
  }
}

async function mileageEndReadings(c: MileageCounts) {
  const { sql } = await import('@vercel/postgres');
  const due = await sql`
    SELECT id, reservation_id, guest_name, vehicle_year, vehicle_model, car_id, odometer_car_id,
           odometer_start_m, trip_start, trip_end, distance_included
    FROM reservations
    WHERE trip_start >= ${MILEAGE_CUTOFF}::timestamptz AND trip_end <= NOW()
      AND status <> 'cancelled'
      AND odometer_start_m IS NOT NULL AND odometer_end_m IS NULL
      AND mileage_status = 'tracking'
    ORDER BY trip_end ASC
    LIMIT ${MAX_READS_PER_RUN}
  `;
  for (const row of due.rows) {
    if (String(row.car_id || '') !== String(row.odometer_car_id || '')) {
      await sql`UPDATE reservations SET mileage_status = 'car_changed', updated_at = NOW() WHERE id = ${row.id}`;
      c.carChanged++;
      continue;
    }
    const end = await getOdometerMeters(String(row.car_id));
    if (end == null) { c.readFailures++; continue; }
    const start = Number(row.odometer_start_m);
    const driven = Math.round(((end - start) / METERS_PER_MILE) * 10) / 10;
    if (!Number.isFinite(driven) || driven < 0 || driven > 3000) {
      await sql`
        UPDATE reservations SET odometer_end_m = ${end}, odometer_end_at = NOW(),
          miles_driven = ${Number.isFinite(driven) ? driven : null}, mileage_status = 'error', updated_at = NOW()
        WHERE id = ${row.id}
      `;
      c.errors++;
      continue;
    }
    const hours = (new Date(row.trip_end).getTime() - new Date(row.trip_start).getTime()) / 3600000;
    const allowed = row.distance_included != null
      ? Number(row.distance_included)
      : 200 * Math.max(1, Math.ceil(hours / 24));
    const over = Math.max(0, Math.round((driven - allowed) * 10) / 10);
    const status = over > 0 ? 'over' : 'done';
    await sql`
      UPDATE reservations SET odometer_end_m = ${end}, odometer_end_at = NOW(),
        miles_driven = ${driven}, miles_allowed = ${allowed}, miles_over = ${over},
        mileage_status = ${status}, updated_at = NOW()
      WHERE id = ${row.id}
    `;
    c.finished++;
    if (status === 'over') {
      c.over++;
      const fmt = (d: any) => new Date(d).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      await alertSlack(
        `⚠️ Mileage overage: ${row.guest_name} (Res #${row.reservation_id}) drove ${Math.round(driven)} mi in the ` +
        `${row.vehicle_year} ${(row.vehicle_model || '').trim()} (${fmt(row.trip_start)} → ${fmt(row.trip_end)}). ` +
        `Allowed ${Math.round(allowed)} mi — over by ${Math.round(over)} mi.` +
        (row.distance_included == null ? ' (Allowance not in booking email; assumed 200 mi/day.)' : '') +
        ` Reminder: Turo needs odometer photos (pickup + return) to file a reimbursement claim.`
      );
    }
  }
}
