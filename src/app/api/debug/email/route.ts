import { NextRequest, NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint: fetch recent Turo emails and show raw + parsed data.
 * GET /api/debug/email?resId=57678292
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resId = req.nextUrl.searchParams.get('resId');

  try {
    // Look back 7 days
    const afterDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const emails = await fetchTuroEmails(50, afterDate);

    const results = [];
    for (const email of emails) {
      const parsed = parseTuroEmail(email.body || email.subject, email.htmlBody);
      if (resId && parsed?.reservationId !== resId) continue;

      // Find "Location" context in the raw text
      const locIdx = (email.body || '').indexOf('Location');
      const locContext = locIdx >= 0
        ? (email.body || '').substring(Math.max(0, locIdx - 20), locIdx + 200)
        : 'NOT FOUND in text';

      const htmlLocIdx = (email.htmlBody || '').indexOf('Location');
      const htmlLocContext = htmlLocIdx >= 0
        ? (email.htmlBody || '').substring(Math.max(0, htmlLocIdx - 20), htmlLocIdx + 200)
        : 'NOT FOUND in htmlBody';

      results.push({
        emailId: email.id,
        subject: email.subject,
        parsedLocation: parsed?.location || 'NOT PARSED',
        parsedResId: parsed?.reservationId,
        parsedGuest: parsed?.guestName,
        parsedModel: parsed?.vehicleModel,
        locContextText: locContext,
        locContextHtml: htmlLocContext,
        // Include first 500 chars of body for debugging
        bodySnippet: (email.body || '').substring(0, 500),
      });
    }

    return NextResponse.json({ count: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
