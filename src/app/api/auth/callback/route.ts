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

  if (!data.refresh_token) {
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;background:#111;color:#f00">
        <h2>⚠️ No Refresh Token</h2>
        <p>Google didn't return a refresh token. You may need to revoke access first:</p>
        <ol>
          <li>Go to <a href="https://myaccount.google.com/permissions" style="color:#0af">myaccount.google.com/permissions</a></li>
          <li>Find "Turo Fleet" and remove access</li>
          <li>Try again: <a href="/api/auth" style="color:#0af">/api/auth</a></li>
        </ol>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Auto-save refresh token to Vercel env var
  let saved = false;
  let saveError = '';
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;
  const vercelTeamId = process.env.VERCEL_TEAM_ID;

  if (vercelToken && vercelProjectId) {
    try {
      // First, try to find existing env var to get its ID
      const teamParam = vercelTeamId ? `&teamId=${vercelTeamId}` : '';
      const listRes = await fetch(
        `https://api.vercel.com/v9/projects/${vercelProjectId}/env?${teamParam}`,
        { headers: { Authorization: `Bearer ${vercelToken}` }, cache: 'no-store' }
      );
      const listData = await listRes.json();
      const existing = listData.envs?.find((e: any) => e.key === 'GMAIL_REFRESH_TOKEN');

      if (existing) {
        // Update existing
        const updateRes = await fetch(
          `https://api.vercel.com/v9/projects/${vercelProjectId}/env/${existing.id}?${teamParam}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: data.refresh_token }),
          }
        );
        saved = updateRes.ok;
        if (!saved) saveError = await updateRes.text();
      } else {
        // Create new
        const createRes = await fetch(
          `https://api.vercel.com/v10/projects/${vercelProjectId}/env?${teamParam}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: 'GMAIL_REFRESH_TOKEN',
              value: data.refresh_token,
              type: 'encrypted',
              target: ['production'],
            }),
          }
        );
        saved = createRes.ok;
        if (!saved) saveError = await createRes.text();
      }
    } catch (e: any) {
      saveError = e.message;
    }
  } else {
    saveError = 'Missing VERCEL_API_TOKEN or VERCEL_PROJECT_ID env vars';
  }

  // Test the new token immediately
  let testResult = 'not tested';
  try {
    const testTokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID!,
        client_secret: process.env.GMAIL_CLIENT_SECRET!,
        refresh_token: data.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const testTokenData = await testTokenRes.json();
    if (testTokenData.access_token) {
      const gmailRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1',
        { headers: { Authorization: `Bearer ${testTokenData.access_token}` }, cache: 'no-store' }
      );
      testResult = gmailRes.ok ? `✅ Gmail API works (${gmailRes.status})` : `❌ Gmail API failed (${gmailRes.status})`;
    } else {
      testResult = `❌ Token refresh failed: ${testTokenData.error}`;
    }
  } catch (e: any) {
    testResult = `❌ Test error: ${e.message}`;
  }

  const savedMsg = saved
    ? '✅ Refresh token auto-saved to Vercel. Redeploy needed to take effect.'
    : `⚠️ Could not auto-save: ${saveError}`;

  return new NextResponse(
    `<html><body style="font-family:monospace;padding:40px;background:#111;color:#0f0">
      <h2>✅ Gmail Connected!</h2>
      <p><strong>Token test:</strong> ${testResult}</p>
      <p><strong>Auto-save:</strong> ${savedMsg}</p>
      <p style="margin-top:20px"><strong>Refresh Token (backup):</strong></p>
      <textarea readonly style="width:100%;height:60px;background:#222;color:#0f0;border:1px solid #333;padding:10px;font-size:12px">${data.refresh_token}</textarea>
      <p style="color:#666;font-size:12px;margin-top:20px">Access token expires in ${data.expires_in}s.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
