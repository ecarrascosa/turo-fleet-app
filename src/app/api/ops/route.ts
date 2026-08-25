import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Task {
  id: string;
  type: 'trip_start' | 'trip_end' | 'cleaning';
  time: string;
  vehicle: string;
  guest?: string;
  location?: string;
  reservationId: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Default to today in LA timezone
    const date =
      searchParams.get('date') ||
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

    const starts = await sql`
      SELECT reservation_id, guest_name, vehicle_year, vehicle_model, trip_start, location
      FROM reservations
      WHERE (trip_start AT TIME ZONE 'America/Los_Angeles')::date = ${date}::date
        AND status != 'cancelled'
      ORDER BY trip_start ASC
    `;

    const ends = await sql`
      SELECT reservation_id, guest_name, vehicle_year, vehicle_model, trip_end, location
      FROM reservations
      WHERE (trip_end AT TIME ZONE 'America/Los_Angeles')::date = ${date}::date
        AND status != 'cancelled'
      ORDER BY trip_end ASC
    `;

    const tasks: Task[] = [];

    for (const r of starts.rows) {
      tasks.push({
        id: `start-${r.reservation_id}`,
        type: 'trip_start',
        time: r.trip_start,
        vehicle: `${r.vehicle_year} ${r.vehicle_model}`,
        guest: r.guest_name,
        location: r.location || undefined,
        reservationId: r.reservation_id,
      });
    }

    for (const r of ends.rows) {
      tasks.push({
        id: `end-${r.reservation_id}`,
        type: 'trip_end',
        time: r.trip_end,
        vehicle: `${r.vehicle_year} ${r.vehicle_model}`,
        guest: r.guest_name,
        location: r.location || undefined,
        reservationId: r.reservation_id,
      });
      tasks.push({
        id: `clean-${r.reservation_id}`,
        type: 'cleaning',
        time: r.trip_end,
        vehicle: `${r.vehicle_year} ${r.vehicle_model}`,
        reservationId: r.reservation_id,
      });
    }

    tasks.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return NextResponse.json({
      date,
      summary: {
        tripsStarting: starts.rows.length,
        tripsEnding: ends.rows.length,
        cleanings: ends.rows.length,
      },
      tasks,
    });
  } catch (error) {
    console.error('Ops API error:', error);
    return NextResponse.json({ error: 'Failed to fetch ops data' }, { status: 500 });
  }
}
