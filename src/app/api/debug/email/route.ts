import { NextRequest, NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const resId = req.nextUrl.searchParams.get('id');
  if (!resId) return NextResponse.json({ error: 'provide ?id=reservationId' });

  const emails = await fetchTuroEmails(100, new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString());
  const match = emails.find(e => e.body.includes(resId));
  if (!match) return NextResponse.json({ error: 'email not found', resId });

  const parsed = parseTuroEmail(match.body, match.htmlBody);

  return NextResponse.json({
    subject: match.subject,
    plainBody: match.body,
    htmlBody: match.htmlBody?.substring(0, 5000),
    parsed: parsed ? { location: parsed.location, vehicleModel: parsed.vehicleModel, vehicleYear: parsed.vehicleYear } : null,
  });
}
