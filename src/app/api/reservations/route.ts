import { NextRequest, NextResponse } from 'next/server';
import { getReservations, getActiveReservations, getReservationsByStatus, initDB } from '@/lib/reservations';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await initDB();

    const status = req.nextUrl.searchParams.get('status');

    let reservations;
    if (status === 'active') {
      reservations = await getActiveReservations();
    } else if (status) {
      reservations = await getReservationsByStatus(status);
    } else {
      reservations = await getReservations();
    }

    // Filter out cancelled unless explicitly requested
    if (status !== 'cancelled') {
      reservations = reservations.filter(r => r.status !== 'cancelled');
    }

    // Sort by trip start
    reservations.sort((a, b) => {
      const aStart = a.tripStart ? new Date(a.tripStart).getTime() : Infinity;
      const bStart = b.tripStart ? new Date(b.tripStart).getTime() : Infinity;
      return aStart - bStart;
    });

    return NextResponse.json({ reservations, count: reservations.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
