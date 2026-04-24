import { NextRequest, NextResponse } from 'next/server';
import { getReservationByToken } from '@/lib/reservations';
import { lockOnly, unlockOnly } from '@/lib/whatsgps';

export const dynamic = 'force-dynamic';

function getTripStatus(tripStart: string, tripEnd: string): 'upcoming' | 'active' | 'grace' | 'ended' {
  const now = Date.now();
  const start = new Date(tripStart).getTime();
  const end = new Date(tripEnd).getTime();
  const graceEnd = end + 30 * 60 * 1000;
  const earlyAccess = start - 15 * 60 * 1000;
  if (now < earlyAccess) return 'upcoming';
  if (now <= end) return 'active';
  if (now <= graceEnd) return 'grace';
  return 'ended';
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { action } = await req.json();

    if (!['lock', 'unlock'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const reservation = await getReservationByToken(token);
    if (!reservation) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    if (!reservation.carId) {
      return NextResponse.json({ error: 'No car linked to this trip' }, { status: 400 });
    }

    const status = getTripStatus(reservation.tripStart, reservation.tripEnd);

    if (status === 'upcoming' || status === 'ended') {
      return NextResponse.json({ error: 'Commands are only available during your trip' }, { status: 403 });
    }
    if (status === 'grace' && action === 'unlock') {
      return NextResponse.json({ error: 'Only locking is allowed during grace period' }, { status: 403 });
    }

    if (action === 'unlock') {
      const result = await unlockOnly(reservation.carId);
      return NextResponse.json({ success: true, result });
    } else {
      const result = await lockOnly(reservation.carId);
      return NextResponse.json({ success: true, result });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
