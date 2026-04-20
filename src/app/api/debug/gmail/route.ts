import { NextRequest, NextResponse } from 'next/server';
import { fetchTuroEmails } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const hasSA = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const hasUser = !!process.env.GMAIL_USER_EMAIL;

    if (!hasSA || !hasUser) {
      return NextResponse.json({
        error: 'Missing env vars',
        hasServiceAccountKey: hasSA,
        hasUserEmail: hasUser,
      });
    }

    // Check key parsing
    const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
    const keyHasNewlines = key.private_key?.includes('\n');
    const keyHasLiteralBackslashN = key.private_key?.includes('\\n');

    // Try fetching 1 email to test end-to-end
    const emails = await fetchTuroEmails(1);

    return NextResponse.json({
      ok: true,
      authMethod: 'service_account',
      userEmail: process.env.GMAIL_USER_EMAIL,
      serviceAccount: key.client_email,
      keyParsed: !!key.private_key,
      keyHasNewlines,
      keyHasLiteralBackslashN,
      emailsFetched: emails.length,
      latestSubject: emails[0]?.subject || null,
      latestDate: emails[0]?.date || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.split('\n').slice(0, 3) }, { status: 500 });
  }
}
