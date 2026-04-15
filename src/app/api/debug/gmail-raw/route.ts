import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cid = process.env.GMAIL_CLIENT_ID || '';
    const sec = process.env.GMAIL_CLIENT_SECRET || '';
    const ref = process.env.GMAIL_REFRESH_TOKEN || '';
    
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cid,
        client_secret: sec,
        refresh_token: ref,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    
    if (tokenData.error) {
      return NextResponse.json({ step: 'token', error: tokenData, cidPrefix: cid.substring(0, 12) });
    }

    const token = tokenData.access_token;
    
    // Test 1: list with token
    const r1 = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1',
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    const d1 = await r1.json();
    
    // Test 2: profile
    const r2 = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    const d2 = await r2.json();
    
    return NextResponse.json({
      cidPrefix: cid.substring(0, 12),
      secPrefix: sec.substring(0, 10),
      refPrefix: ref.substring(0, 10),
      tokenPrefix: token.substring(0, 20),
      scope: tokenData.scope,
      messagesStatus: r1.status,
      messagesError: d1.error?.message,
      profileStatus: r2.status,
      profileEmail: d2.emailAddress,
      profileError: d2.error?.message,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
