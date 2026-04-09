import { NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const hasClientId = !!process.env.GMAIL_CLIENT_ID;
    const hasSecret = !!process.env.GMAIL_CLIENT_SECRET;
    const hasRefresh = !!process.env.GMAIL_REFRESH_TOKEN;

    if (!hasClientId || !hasSecret || !hasRefresh) {
      return NextResponse.json({
        error: 'Missing Gmail env vars',
        hasClientId, hasSecret, hasRefresh,
      });
    }

    const emails = await fetchTuroEmails(3);
    return NextResponse.json({
      envOk: true,
      emailCount: emails.length,
      emails: emails.map(e => ({ id: e.id, subject: e.subject, date: e.date })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.split('\n').slice(0, 3) }, { status: 500 });
  }
}
