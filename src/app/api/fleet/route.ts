import { NextResponse } from 'next/server';
import { getFleet } from '@/lib/whatsgps';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const cars = await getFleet();
    return NextResponse.json({ cars });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
