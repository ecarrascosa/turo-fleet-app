import { NextResponse } from 'next/server';
import { getBouncieVehicles } from '@/lib/bouncie';

export async function GET() {
  try {
    const vehicles = await getBouncieVehicles();

    // Transform to match a unified fleet format
    const fleet = vehicles.map((v) => ({
      source: 'bouncie',
      vin: v.vin,
      imei: v.imei,
      name: v.nickName || `${v.model.year} ${v.model.make} ${v.model.name}`,
      make: v.model.make,
      model: v.model.name,
      year: v.model.year,
      engine: v.standardEngine,
      location: v.stats.location
        ? {
            lat: v.stats.location.lat,
            lng: v.stats.location.lon,
            heading: v.stats.location.heading,
            address: v.stats.location.address,
          }
        : null,
      status: {
        isRunning: v.stats.isRunning,
        speed: v.stats.speed,
        lastUpdated: v.stats.lastUpdated,
        odometer: v.stats.odometer,
        fuelLevel: v.stats.fuelLevel,
        battery: v.stats.battery?.status,
        checkEngine: v.stats.mil?.milOn || false,
      },
    }));

    return NextResponse.json({ vehicles: fleet, count: fleet.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
