import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

/**
 * Manually set which car a trip is on (used to resolve vehicle swaps).
 * Body: { carId } for a car with a WhatsGPS unit, or { vehicleYear, vehicleModel } for a car without one.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const carId: string | null = body.carId || null;
    let vehicleYear: string | null = body.vehicleYear || null;
    let vehicleModel: string | null = body.vehicleModel || null;

    if (!carId && !(vehicleYear && vehicleModel)) {
      return NextResponse.json({ error: 'carId or vehicleYear + vehicleModel is required' }, { status: 400 });
    }

    // Look up the Turo model/year for a GPS car so the trip shows the right name
    if (carId && (!vehicleYear || !vehicleModel)) {
      const m = await sql`SELECT turo_model, turo_year FROM vehicle_mappings WHERE whatsgps_car_id = ${carId} LIMIT 1`;
      if (m.rows[0]) {
        vehicleModel = vehicleModel || m.rows[0].turo_model;
        vehicleYear = vehicleYear || m.rows[0].turo_year;
      }
    }

    const cur = await sql`SELECT vehicle_year, vehicle_model, car_id, vehicle_history FROM reservations WHERE reservation_id = ${id}`;
    const row = cur.rows[0];
    if (!row) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });

    const history = row.vehicle_history || [];
    history.push({
      at: new Date().toISOString(),
      from: `${row.vehicle_year || ''} ${(row.vehicle_model || '').trim()}`.trim(),
      to: `${vehicleYear || row.vehicle_year || ''} ${vehicleModel || (row.vehicle_model || '').trim()}`.trim(),
      fromCarId: row.car_id || null,
      toCarId: carId,
      source: 'manual',
    });

    await sql`
      UPDATE reservations SET
        car_id = ${carId},
        vehicle_year = COALESCE(${vehicleYear}, vehicle_year),
        vehicle_model = COALESCE(${vehicleModel}, vehicle_model),
        swap_status = 'confirmed',
        vehicle_history = ${JSON.stringify(history)}::jsonb,
        updated_at = NOW()
      WHERE reservation_id = ${id}
    `;

    return NextResponse.json({ success: true, reservationId: id, carId, vehicleYear, vehicleModel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
