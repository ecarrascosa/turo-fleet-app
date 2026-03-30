import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No authorization code received' }, { status: 400 });
  }

  const res = await fetch('https://auth.bouncie.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.BOUNCIE_CLIENT_ID,
      client_secret: process.env.BOUNCIE_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.BOUNCIE_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    return NextResponse.json({ error: 'Token exchange failed', details: error }, { status: 500 });
  }

  const data = await res.json();

  return NextResponse.json({
    message: 'Bouncie connected!',
    access_token: data.access_token,
    token_type: data.token_type,
  });
}
