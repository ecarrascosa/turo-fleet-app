import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!code) return NextResponse.json({ error: 'No code' }, { status: 400 });

  const tokenRes = await fetch('https://auth.bouncie.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.BOUNCIE_CLIENT_ID,
      client_secret: process.env.BOUNCIE_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://localhost:3000/api/bouncie/callback',
    }),
  });

  const data = await tokenRes.json();

  if (data.error) {
    return NextResponse.json({ error: data.error, desc: data.error_description }, { status: 400 });
  }

  // Show tokens for copying
  return new NextResponse(
    `<html><body style="font-family:monospace;padding:40px;background:#111;color:#0f0">
      <h2>✅ Bouncie Connected!</h2>
      <p><b>Access Token:</b></p>
      <textarea readonly style="width:100%;height:60px;background:#222;color:#0f0;border:1px solid #333;padding:8px">${data.access_token}</textarea>
      <p><b>Refresh Token:</b></p>
      <textarea readonly style="width:100%;height:60px;background:#222;color:#0f0;border:1px solid #333;padding:8px">${data.refresh_token}</textarea>
      <p style="color:#888">Send these to David or just tell him it worked.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
