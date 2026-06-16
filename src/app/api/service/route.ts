import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import fleetData from '@/data/fleet.json';
import odometerData from '@/data/odometer.json';

const DEFAULT_SERVICE_INTERVAL = 7500;

interface FleetCar {
  car: string;
  plate: string;
  lastService: number | null;
}

/** Create tables if they don't exist */
async function initServiceDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS service_records (
      id SERIAL PRIMARY KEY,
      plate VARCHAR(20) NOT NULL,
      mileage INTEGER NOT NULL,
      serviced_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_service_plate ON service_records(plate)`;

  await sql`
    CREATE TABLE IF NOT EXISTS odometer_readings (
      plate VARCHAR(20) PRIMARY KEY,
      mileage INTEGER NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

/** Get the most recent service mileage for a plate from DB, falling back to fleet.json */
async function getLastService(plate: string, fallback: number | null): Promise<number | null> {
  const result = await sql`
    SELECT mileage FROM service_records WHERE plate = ${plate}
    ORDER BY serviced_at DESC LIMIT 1
  `;
  if (result.rows.length > 0) return result.rows[0].mileage;
  return fallback;
}

/** Get current odometer: DB override > Turo CSV static data */
async function getCurrentOdo(plate: string): Promise<number | null> {
  const result = await sql`
    SELECT mileage FROM odometer_readings WHERE plate = ${plate}
  `;
  if (result.rows.length > 0) return result.rows[0].mileage;
  const csvOdo = (odometerData as Record<string, number>)[plate];
  return csvOdo ?? null;
}

async function getServiceStatus(cars: FleetCar[]) {
  const results = await Promise.all(cars.map(async car => {
    const lastService = await getLastService(car.plate, car.lastService);
    const currentOdo = await getCurrentOdo(car.plate);
    const interval = DEFAULT_SERVICE_INTERVAL;
    const nextService = lastService != null ? lastService + interval : null;
    const remaining = (nextService != null && currentOdo != null) ? nextService - currentOdo : null;

    let status: 'overdue' | 'due-soon' | 'ok' | 'no-data' = 'no-data';
    if (remaining !== null) {
      if (remaining <= 0) status = 'overdue';
      else if (remaining <= 1000) status = 'due-soon';
      else status = 'ok';
    } else if (lastService == null) {
      status = 'no-data';
    }

    return {
      car: car.car,
      plate: car.plate,
      lastService,
      currentOdo,
      nextService,
      remaining,
      status,
    };
  }));

  return results.sort((a, b) => {
    const order = { 'overdue': 0, 'due-soon': 1, 'ok': 2, 'no-data': 3 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.remaining != null && b.remaining != null) return a.remaining - b.remaining;
    if (a.remaining != null) return -1;
    return 1;
  });
}

export async function GET() {
  await initServiceDB();
  const status = await getServiceStatus(fleetData as FleetCar[]);
  const overdue = status.filter(c => c.status === 'overdue').length;
  const dueSoon = status.filter(c => c.status === 'due-soon').length;

  return NextResponse.json({
    serviceInterval: DEFAULT_SERVICE_INTERVAL,
    summary: { total: status.length, overdue, dueSoon },
    cars: status,
    storage: 'postgres',
  });
}

export async function POST(request: NextRequest) {
  await initServiceDB();
  const body = await request.json();
  const { action } = body;

  if (action === 'log-odometer') {
    const { plate, mileage } = body;
    if (!plate || !mileage) {
      return NextResponse.json({ error: 'plate and mileage required' }, { status: 400 });
    }
    await sql`
      INSERT INTO odometer_readings (plate, mileage, updated_at)
      VALUES (${plate}, ${Number(mileage)}, NOW())
      ON CONFLICT (plate) DO UPDATE SET mileage = ${Number(mileage)}, updated_at = NOW()
    `;
    return NextResponse.json({ success: true, plate, mileage: Number(mileage) });
  }

  if (action === 'update-service') {
    const { plate, mileage } = body;
    if (!plate || mileage == null) {
      return NextResponse.json({ error: 'plate and mileage required' }, { status: 400 });
    }
    await sql`
      INSERT INTO service_records (plate, mileage, serviced_at)
      VALUES (${plate}, ${Number(mileage)}, NOW())
    `;
    return NextResponse.json({ success: true, plate, newLastService: Number(mileage) });
  }

  if (action === 'bulk-odometer') {
    const { data } = body;
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'data object required' }, { status: 400 });
    }
    let count = 0;
    for (const [plate, mileage] of Object.entries(data)) {
      if (typeof mileage === 'number' && mileage > 0) {
        await sql`
          INSERT INTO odometer_readings (plate, mileage, updated_at)
          VALUES (${plate}, ${mileage}, NOW())
          ON CONFLICT (plate) DO UPDATE SET mileage = ${mileage}, updated_at = NOW()
        `;
        count++;
      }
    }
    return NextResponse.json({ success: true, count });
  }

  if (action === 'upload-csv') {
    const { csv: csvText } = body;
    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'csv text required' }, { status: 400 });
    }

    // Proper CSV parsing (handles quoted fields with commas, newlines, etc.)
    const parseCSV = (text: string): string[][] => {
      const rows: string[][] = [];
      let row: string[] = [];
      let cell = '';
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"' && text[i + 1] === '"') {
            cell += '"'; i++; // escaped quote
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            cell += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            row.push(cell.trim()); cell = '';
          } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
            if (ch === '\r') i++;
            row.push(cell.trim()); cell = '';
            if (row.some(c => c)) rows.push(row);
            row = [];
          } else {
            cell += ch;
          }
        }
      }
      row.push(cell.trim());
      if (row.some(c => c)) rows.push(row);
      return rows;
    }

    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });
    }

    const header = rows[0].map(h => h.toLowerCase());
    const vehicleIdx = header.findIndex(h => h.includes('vehicle'));
    const checkinIdx = header.findIndex(h => h.includes('check-in odometer'));
    const checkoutIdx = header.findIndex(h => h.includes('check-out odometer'));

    if (vehicleIdx === -1 || (checkinIdx === -1 && checkoutIdx === -1)) {
      return NextResponse.json({ 
        error: 'CSV must have "Vehicle" and "Check-in odometer" or "Check-out odometer" columns',
        foundColumns: rows[0],
      }, { status: 400 });
    }

    // Collect all readings per plate
    const allReadings: Record<string, number[]> = {};
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      const vehicle = cols[vehicleIdx] || '';
      const plateMatch = vehicle.match(/#([A-Z0-9]+)\)/);
      if (!plateMatch) continue;
      const plate = plateMatch[1];

      const checkin = checkinIdx !== -1 ? parseFloat(cols[checkinIdx]) : 0;
      const checkout = checkoutIdx !== -1 ? parseFloat(cols[checkoutIdx]) : 0;
      if (checkin > 0) (allReadings[plate] ??= []).push(checkin);
      if (checkout > 0) (allReadings[plate] ??= []).push(checkout);
    }

    // For each car: take the highest reading, skip outliers (>5K above second-highest)
    const results: Record<string, number> = {};
    const details: { plate: string; mileage: number; outlierSkipped?: number }[] = [];
    for (const [plate, readings] of Object.entries(allReadings)) {
      if (readings.length === 0) continue;
      const unique = Array.from(new Set(readings)).sort((a, b) => b - a);
      let best = unique[0];
      let outlierSkipped: number | undefined;
      if (unique.length >= 2 && best - unique[1] > 5000) {
        outlierSkipped = best;
        best = unique[1];
      }
      results[plate] = Math.round(best);
      details.push({ plate, mileage: Math.round(best), ...(outlierSkipped ? { outlierSkipped: Math.round(outlierSkipped) } : {}) });
    }

    // Write to DB
    let count = 0;
    for (const [plate, mileage] of Object.entries(results)) {
      await sql`
        INSERT INTO odometer_readings (plate, mileage, updated_at)
        VALUES (${plate}, ${mileage}, NOW())
        ON CONFLICT (plate) DO UPDATE SET mileage = ${mileage}, updated_at = NOW()
      `;
      count++;
    }

    return NextResponse.json({ success: true, count, details });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
