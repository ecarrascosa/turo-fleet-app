import { NextRequest, NextResponse } from 'next/server';
import { getReservations, getActiveReservations, getReservationsByStatus } from '@/lib/reservations';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  
  let reservations;
  if (status === 'active') {
    reservations = getActiveReservations();
  } else if (status) {
    reservations = getReservationsByStatus(status);
  } else {
    reservations = getReservations();
  }

  // Sort by trip start descending (newest first)
  reservations.sort((a, b) => new Date(b.tripStart).getTime() - new Date(a.tripStart).getTime());

  return NextResponse.json({ reservations, count: reservations.length });
}
