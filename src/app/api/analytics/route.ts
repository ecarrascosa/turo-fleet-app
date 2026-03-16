import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface Trip {
  resId: string;
  guest: string;
  vehicle: string;
  vehicleName: string;
  plate: string;
  vin: string;
  tripStart: string;
  tripEnd: string;
  status: string;
  tripDays: number;
  tripPrice: number;
  totalEarnings: number;
}

function parseCsv(): Trip[] {
  const csvPath = join(process.cwd(), '..', 'data', 'trip_earnings_export_20260310.csv');
  const raw = readFileSync(csvPath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  return lines.slice(1).map(line => {
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    cols.push(current.trim());

    const clean = (i: number) => (cols[i] || '').trim();
    const money = (i: number) => parseFloat(clean(i).replace(/[A-Z]*\$|,/g, '') || '0');
    const vehicleField = clean(2);
    const plateMatch = vehicleField.match(/#(\w+)/);

    return {
      resId: clean(0),
      guest: clean(1),
      vehicle: vehicleField,
      vehicleName: clean(3),
      plate: plateMatch ? plateMatch[1] : '',
      vin: clean(5),
      tripStart: clean(6),
      tripEnd: clean(7),
      status: clean(10),
      tripDays: parseInt(clean(14)) || 0,
      tripPrice: money(15),
      totalEarnings: money(46),
    };
  }).filter(r => r.resId);
}

export async function GET() {
  try {
    const trips = parseCsv();
    const completed = trips.filter(t => t.status === 'Completed' || t.status === 'In-progress');
    const cancelled = trips.filter(t => t.status.includes('cancellation'));

    // Total revenue
    const totalRevenue = completed.reduce((s, t) => s + t.totalEarnings, 0);
    const totalTrips = completed.length;
    const totalDays = completed.reduce((s, t) => s + t.tripDays, 0);
    const avgEarningsPerTrip = totalTrips ? totalRevenue / totalTrips : 0;
    const avgTripDays = totalTrips ? totalDays / totalTrips : 0;
    const uniqueGuests = new Set(completed.map(t => t.guest)).size;

    // Revenue by vehicle
    const byVehicle: Record<string, { name: string; plate: string; trips: number; revenue: number; days: number }> = {};
    for (const t of completed) {
      const key = t.plate || t.vehicleName;
      if (!byVehicle[key]) byVehicle[key] = { name: t.vehicleName, plate: t.plate, trips: 0, revenue: 0, days: 0 };
      byVehicle[key].trips++;
      byVehicle[key].revenue += t.totalEarnings;
      byVehicle[key].days += t.tripDays;
    }
    const vehicleStats = Object.values(byVehicle)
      .map(v => ({
        ...v,
        avgPerTrip: v.trips ? v.revenue / v.trips : 0,
        avgPerDay: v.days ? v.revenue / v.days : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Revenue by month
    const byMonth: Record<string, { revenue: number; trips: number; days: number }> = {};
    for (const t of completed) {
      const d = new Date(t.tripStart);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { revenue: 0, trips: 0, days: 0 };
      byMonth[key].revenue += t.totalEarnings;
      byMonth[key].trips++;
      byMonth[key].days += t.tripDays;
    }
    const monthlyStats = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    return NextResponse.json({
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalTrips,
        totalDays,
        avgEarningsPerTrip: Math.round(avgEarningsPerTrip * 100) / 100,
        avgTripDays: Math.round(avgTripDays * 10) / 10,
        uniqueGuests,
        cancelledTrips: cancelled.length,
      },
      vehicleStats,
      monthlyStats,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
