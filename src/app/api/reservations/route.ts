import { NextRequest, NextResponse } from 'next/server';
import { getReservations, getActiveReservations, getReservationsByStatus, upsertFromEmail } from '@/lib/reservations';
import { fetchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';
import { getFleet } from '@/lib/whatsgps';

let lastSyncTime = 0;
const SYNC_COOLDOWN = 5 * 60 * 1000; // 5 minutes between syncs

async function ensureSynced() {
  const now = Date.now();
  const existing = getReservations();

  // Skip if we synced recently (within cooldown)
  if (existing.length > 0 && (now - lastSyncTime) < SYNC_COOLDOWN) return;

  // Sync from Gmail — last 7 days for regular refreshes, 30 for cold start
  try {
    const days = existing.length === 0 ? 30 : 7;
    const afterDate = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const emails = await fetchTuroEmails(existing.length === 0 ? 50 : 20, afterDate);
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
    lastSyncTime = now;
    console.log(`[Reservations] Synced: ${emails.length} emails processed`);
  } catch (e) {
    console.warn('[Reservations] Sync failed:', e);
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

  // Filter out cancelled reservations
  reservations = reservations.filter(r => r.status !== 'cancelled');
  reservations.sort((a, b) => new Date(b.tripStart).getTime() - new Date(a.tripStart).getTime());

  return NextResponse.json({ reservations, count: reservations.length });
}
