import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
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

  const tokens = await tokenRes.json();

  if (tokens.error) {
    return NextResponse.json({ error: tokens.error, description: tokens.error_description }, { status: 400 });
  }

  // Display the refresh token so we can save it
  return new NextResponse(
    `<html><body style="font-family:monospace;padding:40px;background:#1e293b;color:#e2e8f0">
      <h1 style="color:#22c55e">✅ Gmail Connected!</h1>
      <p>Save this refresh token to your environment:</p>
      <pre style="background:#0f172a;padding:20px;border-radius:8px;word-break:break-all;color:#fbbf24">${tokens.refresh_token}</pre>
      <p style="color:#94a3b8">Access token (temporary): ${tokens.access_token?.substring(0, 30)}...</p>
      <p style="color:#94a3b8">You can close this window now.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
