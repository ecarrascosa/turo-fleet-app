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

    // Test token refresh
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID!,
        client_secret: process.env.GMAIL_CLIENT_SECRET!,
        refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      return NextResponse.json({ error: 'Token refresh failed', detail: tokenData });
    }

    // Test raw Gmail search
    const accessToken = tokenData.access_token;
    const query = 'from:noreply@mail.turo.com';
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();

    return NextResponse.json({
      envOk: true,
      tokenOk: true,
      tokenType: tokenData.token_type,
      tokenScope: tokenData.scope,
      expiresIn: tokenData.expires_in,
      accessTokenPrefix: accessToken?.substring(0, 30),
      tokenLen: accessToken?.length,
      listStatus: listRes.status,
      refreshPrefix: process.env.GMAIL_REFRESH_TOKEN?.substring(0, 20),
      cidPrefix: process.env.GMAIL_CLIENT_ID?.substring(0, 20),
      query,
      gmailResponse: listData,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.split('\n').slice(0, 3) }, { status: 500 });
  }
}
