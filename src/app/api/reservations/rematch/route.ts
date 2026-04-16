import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { initDB, matchCarId } from '@/lib/reservations';
import { getFleet } from '@/lib/whatsgps';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reservations/rematch
 * Re-matches all reservations with missing carId to the current WhatsGPS fleet.
 */
export async function GET() {
  try {
    await initDB();
    const fleet = await getFleet();
    const fleetCars = fleet.map(c => ({ carId: c.carId, name: c.name }));

    const unmatched = await sql`SELECT * FROM reservations WHERE car_id IS NULL OR car_id = ''`;
    let updated = 0;

    for (const row of unmatched.rows) {
      const carId = matchCarId(row.vehicle_model || '', row.vehicle_year || '', fleetCars);
      if (carId) {
        await sql`UPDATE reservations SET car_id = ${carId}, updated_at = NOW() WHERE id = ${row.id}`;
        updated++;
      }
    }

    return NextResponse.json({ success: true, unmatched: unmatched.rows.length, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
