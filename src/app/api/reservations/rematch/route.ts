import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { initDB, matchCarId } from '@/lib/reservations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reservations/rematch
 * Re-matches all reservations with missing carId using vehicle_mappings table.
 */
export async function GET() {
  try {
    await initDB();

    const unmatched = await sql`SELECT * FROM reservations WHERE car_id IS NULL OR car_id = ''`;
    let updated = 0;

    for (const row of unmatched.rows) {
      const carId = await matchCarId(row.vehicle_model || '', row.vehicle_year || '', row.location || undefined);
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
