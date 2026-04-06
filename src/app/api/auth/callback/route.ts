import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  // Exchange code for tokens
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      redirect_uri: process.env.GMAIL_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json();

  if (data.error) {
    return NextResponse.json({ error: data.error, description: data.error_description }, { status: 400 });
  }

  // Show the refresh token so we can save it
  return new NextResponse(
    `<html><body style="font-family:monospace;padding:40px;background:#111;color:#0f0">
      <h2>✅ Gmail Connected!</h2>
      <p><strong>Refresh Token:</strong></p>
      <textarea readonly style="width:100%;height:100px;background:#222;color:#0f0;border:1px solid #333;padding:10px;font-size:14px">${data.refresh_token || 'NO REFRESH TOKEN - you may need to revoke access and try again'}</textarea>
      <p style="color:#888;margin-top:20px">Copy this refresh token and send it to David. You can close this page after.</p>
      <p style="color:#666;font-size:12px">Access token expires in ${data.expires_in}s. Refresh token is permanent.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
