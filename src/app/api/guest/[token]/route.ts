import { NextRequest, NextResponse } from 'next/server';
import { getReservationByToken } from '@/lib/reservations';
import { getFleet } from '@/lib/whatsgps';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function getTripStatus(tripStart: string, tripEnd: string): { status: 'upcoming' | 'active' | 'grace' | 'ended'; timeLeft: string } {
  const now = Date.now();
  const start = new Date(tripStart).getTime();
  const end = new Date(tripEnd).getTime();
  const graceEnd = end + 30 * 60 * 1000;

  if (now < start) {
    const diff = start - now;
    return { status: 'upcoming', timeLeft: formatDuration(diff) + ' until trip starts' };
  }
  if (now >= start && now <= end) {
    const diff = end - now;
    return { status: 'active', timeLeft: formatDuration(diff) + ' remaining' };
  }
  if (now > end && now <= graceEnd) {
    const diff = graceEnd - now;
    return { status: 'grace', timeLeft: formatDuration(diff) + ' grace period remaining' };
  }
  return { status: 'ended', timeLeft: 'Trip ended' };
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(' ');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const reservation = await getReservationByToken(token);
    if (!reservation) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const { status: tripStatus, timeLeft } = getTripStatus(reservation.tripStart, reservation.tripEnd);

    let car = { lat: 0, lon: 0, name: '', plate: '', locked: false };
    if (reservation.carId) {
      try {
        const fleet = await getFleet();
        const found = fleet.find(c => c.carId === reservation.carId);
        if (found) {
          car = { lat: found.lat, lon: found.lon, name: found.name, plate: found.plate, locked: found.locked };
        }
      } catch (e) {
        console.error('Failed to get car location:', e);
      }
    }

    if (!car.name) {
      car.name = `${reservation.vehicleModel} ${reservation.vehicleYear}`.trim();
    }

    return NextResponse.json({ reservation, car, tripStatus, timeLeft });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
