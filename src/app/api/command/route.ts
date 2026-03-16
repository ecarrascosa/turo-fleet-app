import { NextRequest, NextResponse } from 'next/server';
import { lockAndKill, lockOnly, unlockAndRestore, sendCommand, COMMANDS } from '@/lib/whatsgps';
import { getFleet } from '@/lib/whatsgps';
import { isCarRented } from '@/lib/rentals';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  try {
    const { action, carId } = await req.json();

    if (action === 'lock-kill') {
      const result = await lockAndKill(carId);
      return NextResponse.json({ success: true, result });
    }
    if (action === 'unlock-restore') {
      const result = await unlockAndRestore(carId);
      return NextResponse.json({ success: true, result });
    }
    if (action === 'lock-all') {
      const cars = await getFleet();
      const results = [];
      for (const car of cars) {
        const r = await lockOnly(car.carId);
        results.push({ carId: car.carId, name: car.name, ...r });
      }
      return NextResponse.json({ success: true, count: results.length, results });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
