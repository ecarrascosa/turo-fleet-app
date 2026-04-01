import { NextRequest, NextResponse } from 'next/server';
import fleetData from '@/data/fleet.json';

const SERVICE_INTERVAL = 7000;

// In-memory store (resets on cold start — replace with Vercel KV later)
const odoStore: Record<string, { mileage: number; timestamp: string; type: string }> = {};
const serviceOverrides: Record<string, number> = {};

interface FleetCar {
  car: string;
  plate: string;
  lastService: number | null;
}

function getServiceStatus(cars: FleetCar[]) {
  return cars.map(car => {
    const latestOdo = odoStore[car.plate];
    const lastService = serviceOverrides[car.plate] ?? car.lastService;
    const currentOdo = latestOdo?.mileage ?? null;
    const nextService = lastService != null ? lastService + SERVICE_INTERVAL : null;
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
      lastReading: latestOdo?.timestamp ?? null,
    };
  }).sort((a, b) => {
    const order = { 'overdue': 0, 'due-soon': 1, 'ok': 2, 'no-data': 3 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.remaining != null && b.remaining != null) return a.remaining - b.remaining;
    if (a.remaining != null) return -1;
    return 1;
  });
}

export async function GET() {
  const status = getServiceStatus(fleetData as FleetCar[]);
  const overdue = status.filter(c => c.status === 'overdue').length;
  const dueSoon = status.filter(c => c.status === 'due-soon').length;

  return NextResponse.json({
    serviceInterval: SERVICE_INTERVAL,
    summary: { total: status.length, overdue, dueSoon },
    cars: status,
    storage: 'memory', // will be 'kv' when Vercel KV is connected
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === 'log-odometer') {
    const { plate, mileage, type } = body;
    if (!plate || !mileage) {
      return NextResponse.json({ error: 'plate and mileage required' }, { status: 400 });
    }
    odoStore[plate] = {
      mileage: Number(mileage),
      timestamp: new Date().toISOString(),
      type: type || 'checkin',
    };
    return NextResponse.json({ success: true, stored: odoStore[plate] });
  }

  if (action === 'update-service') {
    const { plate, mileage } = body;
    if (!plate || mileage == null) {
      return NextResponse.json({ error: 'plate and mileage required' }, { status: 400 });
    }
    serviceOverrides[plate] = Number(mileage);
    return NextResponse.json({ success: true, plate, newLastService: Number(mileage) });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
