import { NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const afterDate = new Date(Date.now() - 7 * 86400000).toISOString();
    const emails = await fetchTuroEmails(5, afterDate);
    return NextResponse.json({ 
      count: emails.length, 
      afterDate,
      subjects: emails.map(e => e.subject).slice(0, 5)
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}
