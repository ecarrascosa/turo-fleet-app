import { NextRequest, NextResponse } from 'next/server';
import { getReservations, getActiveReservations, getReservationsByStatus, upsertFromEmail } from '@/lib/reservations';
import { fetchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';
import { getFleet } from '@/lib/whatsgps';

async function ensureSynced() {
  const existing = getReservations();
  if (existing.length > 0) return; // Already have data in memory

  // Auto-sync from Gmail on cold start
  try {
    const afterDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const emails = await fetchTuroEmails(50, afterDate);
    let fleetCars: Array<{ carId: string; name: string }> = [];
    try {
      const fleet = await getFleet();
      fleetCars = fleet.map(c => ({ carId: c.carId, name: c.name }));
    } catch {}

    for (const email of emails) {
      try {
        const parsed = parseTuroEmail(email.body);
        if (parsed) upsertFromEmail(parsed, fleetCars);
      } catch {}
    }
    console.log(`[Reservations] Auto-synced from Gmail: ${emails.length} emails`);
  } catch (e) {
    console.warn('[Reservations] Auto-sync failed:', e);
  }
}

export async function GET(req: NextRequest) {
  await ensureSynced();

  const status = req.nextUrl.searchParams.get('status');

  let reservations;
  if (status === 'active') {
    reservations = getActiveReservations();
  } else if (status) {
    reservations = getReservationsByStatus(status);
  } else {
    reservations = getReservations();
  }

  reservations.sort((a, b) => new Date(b.tripStart).getTime() - new Date(a.tripStart).getTime());

  return NextResponse.json({ reservations, count: reservations.length });
}
