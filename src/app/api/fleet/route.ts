import { NextResponse } from 'next/server';
import { getFleet } from '@/lib/whatsgps';
import { getBouncieVehicles } from '@/lib/bouncie';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    // Fetch from both sources in parallel
    const [whatsgpsCars, bouncieVehicles] = await Promise.allSettled([
      getFleet(),
      getBouncieVehicles(),
    ]);

    const cars: any[] = [];

    // WhatsGPS cars
    if (whatsgpsCars.status === 'fulfilled') {
      for (const c of whatsgpsCars.value) {
        cars.push({ ...c, source: 'whatsgps' });
      }
    } else {
      console.warn('[Fleet] WhatsGPS failed:', whatsgpsCars.reason?.message);
    }

    // Bouncie cars — normalize to same Car shape
    if (bouncieVehicles.status === 'fulfilled') {
      for (const v of bouncieVehicles.value) {
        const name = v.nickName || `${v.model.year} ${v.model.make} ${v.model.name}`;
        cars.push({
          carId: `bouncie-${v.imei}`,
          name,
          plate: '', // Bouncie doesn't provide plates
          imei: v.imei,
          online: true, // Bouncie devices are always "online" if reporting
          moving: v.stats.isRunning && v.stats.speed > 5,
          speed: v.stats.speed,
          lat: v.stats.location?.lat || 0,
          lon: v.stats.location?.lon || 0,
          acc: v.stats.isRunning ? 'on' : 'off',
          locked: false,
          engineCut: false,
          voltage: v.stats.battery?.status || '',
          source: 'bouncie',
          vin: v.vin,
          fuelLevel: v.stats.fuelLevel,
          odometer: v.stats.odometer,
          checkEngine: v.stats.mil?.milOn || false,
        });
      }
    } else {
      console.warn('[Fleet] Bouncie failed:', bouncieVehicles.reason?.message);
    }

    return NextResponse.json({ cars });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
