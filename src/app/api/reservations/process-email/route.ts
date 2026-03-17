import { NextRequest, NextResponse } from 'next/server';
import { parseTuroEmail, parseTuroEmails } from '@/lib/turo-emails';
import { upsertFromEmail } from '@/lib/reservations';
import { getFleet } from '@/lib/whatsgps';

export async function POST(req: NextRequest) {
  try {
    const { emailText } = await req.json();
    if (!emailText) {
      return NextResponse.json({ error: 'emailText required' }, { status: 400 });
    }

    // Get fleet for car matching
    let fleetCars: Array<{ carId: string; name: string }> = [];
    try {
      const fleet = await getFleet();
      fleetCars = fleet.map(c => ({ carId: c.carId, name: c.name }));
    } catch (e) {
      console.warn('Could not fetch fleet for car matching:', e);
    }

    // Try parsing as multiple emails first, then single
    let emails = parseTuroEmails(emailText);
    if (emails.length === 0) {
      const single = parseTuroEmail(emailText);
      if (single) emails = [single];
    }

    if (emails.length === 0) {
      return NextResponse.json({ error: 'Could not parse any Turo emails from input' }, { status: 400 });
    }

    const results = emails.map(email => {
      const reservation = upsertFromEmail(email, fleetCars);
      return { email, reservation };
    });

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
