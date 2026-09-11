import { NextRequest, NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';
import { parseTuroEmail } from '@/lib/turo-emails';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const resId = req.nextUrl.searchParams.get('id') || '60165085';
  
  // Fetch cancelled emails from last 14 days
  const emails = await fetchTuroEmails(50, new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), ['cancelled']);
  
  const matching = emails.filter(e => 
    e.body.includes(resId) || e.subject.includes(resId) || (e.htmlBody && e.htmlBody.includes(resId))
  );

  const results = matching.map(e => ({
    id: e.id,
    subject: e.subject,
    date: e.date,
    bodySnippet: e.body.substring(0, 500),
    hasHtml: !!e.htmlBody,
    parsed: parseTuroEmail(e.body, e.htmlBody),
  }));

  return NextResponse.json({
    totalCancelEmails: emails.length,
    matchingResId: matching.length,
    results,
    // Also show all cancellation subjects for debugging
    allSubjects: emails.map(e => ({ subject: e.subject, date: e.date })),
  });
}
