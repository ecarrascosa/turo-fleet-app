import { NextResponse } from 'next/server';
import { getActiveRentals, getScrapedAt } from '@/lib/rentals';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const active = getActiveRentals();
    const scrapedAt = getScrapedAt();
    return NextResponse.json({ active, all: active, scrapedAt });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
