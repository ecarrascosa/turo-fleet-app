import { NextRequest, NextResponse } from 'next/server';
import fleetData from '@/data/fleet.json';
import odometerData from '@/data/odometer.json';

const SERVICE_INTERVAL = 7000;

// In-memory overrides (survive warm invocations)
const odoOverrides: Record<string, number> = {};
const serviceOverrides: Record<string, number> = {};

interface FleetCar {
  car: string;
  plate: string;
  lastService: number | null;
}

function getCurrentOdo(plate: string): number | null {
  // Priority: manual override > Turo CSV data
  if (odoOverrides[plate]) return odoOverrides[plate];
  const csvOdo = (odometerData as Record<string, number>)[plate];
  return csvOdo ?? null;
}

function getServiceStatus(cars: FleetCar[]) {
  return cars.map(car => {
    const lastService = serviceOverrides[car.plate] ?? car.lastService;
    const currentOdo = getCurrentOdo(car.plate);
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
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === 'log-odometer') {
    const { plate, mileage } = body;
    if (!plate || !mileage) {
      return NextResponse.json({ error: 'plate and mileage required' }, { status: 400 });
    }
    odoOverrides[plate] = Number(mileage);
    return NextResponse.json({ success: true, plate, mileage: Number(mileage) });
  }

  if (action === 'update-service') {
    const { plate, mileage } = body;
    if (!plate || mileage == null) {
      return NextResponse.json({ error: 'plate and mileage required' }, { status: 400 });
    }
    serviceOverrides[plate] = Number(mileage);
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
        odoOverrides[plate] = mileage;
        count++;
      }
    }
    return NextResponse.json({ success: true, count });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
