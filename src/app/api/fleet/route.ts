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
    // Manual plate mapping (Bouncie doesn't store plates)
    const bounciePlates: Record<string, string> = {
      '5UXWX9C54G0D68890': '9XTY709',  // 2016 BMW X3
      '5UXWX7C51E0E78992': '',          // 2014 BMW X3
      'WBA3C3C58EF984061': '',          // 2014 BMW 320i
      'JTDBCMFE5SJ040887': '',          // 2025 Toyota Corolla
    };
    if (bouncieVehicles.status === 'fulfilled') {
      for (const v of bouncieVehicles.value) {
        const name = v.nickName || `${v.model.year} ${v.model.make} ${v.model.name}`;
        cars.push({
          carId: `bouncie-${v.imei}`,
          name,
          plate: bounciePlates[v.vin] || '',
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
