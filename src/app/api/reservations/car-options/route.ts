import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * Cars to choose from when resolving a swap.
 * Cars with a WhatsGPS unit come from vehicle_mappings; cars without one (no lock/unlock)
 * come from the vehicles that have appeared on Turo trips.
 */
export async function GET() {
  try {
    const gps = await sql`
      SELECT whatsgps_car_id, plate, turo_model, turo_year, location
      FROM vehicle_mappings
      ORDER BY turo_model, turo_year, plate
    `;
    const cars: any[] = gps.rows.map(x => ({
      carId: x.whatsgps_car_id,
      plate: x.plate,
      vehicleModel: (x.turo_model || '').trim(),
      vehicleYear: x.turo_year,
      hasGps: true,
      label: `${x.turo_year} ${(x.turo_model || '').trim()}${x.plate ? ' · ' + x.plate : ''}${x.location ? ' · ' + x.location : ''}`,
    }));
    const key = (y: string, m: string) => `${y}|${(m || '').trim().toLowerCase()}`;
    const known = new Set(cars.map(c => key(c.vehicleYear, c.vehicleModel)));
    const seen = await sql`
      SELECT DISTINCT vehicle_year, TRIM(vehicle_model) AS vehicle_model
      FROM reservations
      WHERE vehicle_year ~ '^(19|20)[0-9]{2}$' AND COALESCE(TRIM(vehicle_model), '') <> ''
    `;
    for (const r of seen.rows) {
      const k = key(r.vehicle_year, r.vehicle_model);
      if (known.has(k)) continue;
      known.add(k);
      cars.push({
        carId: null,
        plate: null,
        vehicleModel: r.vehicle_model,
        vehicleYear: r.vehicle_year,
        hasGps: false,
        label: `${r.vehicle_year} ${r.vehicle_model} · no GPS`,
      });
    }
    cars.sort((a, b) => a.label.localeCompare(b.label));
    return NextResponse.json({ cars });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
