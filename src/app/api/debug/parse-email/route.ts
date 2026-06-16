import { NextRequest, NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const days = parseInt(req.nextUrl.searchParams.get('days') || '3');
    const emails = await fetchTuroEmails(50, new Date(Date.now() - days * 86400000).toISOString(), ['modified']);
    
    const results = emails.map(email => {
      const parsed = parseTuroEmail(email.body || email.subject, email.htmlBody);
      return {
        emailId: email.id,
        subject: email.subject,
        date: email.date,
        parsed: parsed ? {
          type: parsed.type,
          reservationId: parsed.reservationId,
          guestName: parsed.guestName,
          vehicleModel: parsed.vehicleModel,
          tripStart: parsed.tripStart,
          tripEnd: parsed.tripEnd,
          changes: parsed.changes,
        } : null,
        // Include raw body snippet for debugging
        bodySnippet: (email.body || '').slice(0, 500),
      };
    });

    return NextResponse.json({ count: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
