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
  const tokenRes = await fetch('https://auth.bouncie.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.BOUNCIE_CLIENT_ID,
      client_secret: process.env.BOUNCIE_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `https://${req.nextUrl.host}/api/bouncie/auth/callback`,
    }),
  });

  const data = await tokenRes.json();

  if (data.error) {
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;background:#111;color:#f44">
        <h2>❌ Bouncie Auth Failed</h2>
        <p>${data.error}: ${data.error_description || ''}</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Persist tokens to Vercel env vars
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  let persistStatus = 'not configured';

  if (vercelToken && projectId) {
    try {
      const qs = teamId ? `?teamId=${teamId}` : '';
      const base = 'https://api.vercel.com';

      // Get existing env vars
      const listRes = await fetch(`${base}/v9/projects/${projectId}/env${qs}`, {
        headers: { Authorization: `Bearer ${vercelToken}` },
      });
      const { envs } = await listRes.json();

      // Update refresh token
      const rtEnv = envs?.find((e: any) => e.key === 'BOUNCIE_REFRESH_TOKEN');
      if (rtEnv && data.refresh_token) {
        await fetch(`${base}/v9/projects/${projectId}/env/${rtEnv.id}${qs}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: data.refresh_token }),
        });
      }

      // Update access token
      const atEnv = envs?.find((e: any) => e.key === 'BOUNCIE_ACCESS_TOKEN');
      if (atEnv && data.access_token) {
        await fetch(`${base}/v9/projects/${projectId}/env/${atEnv.id}${qs}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: data.access_token }),
        });
      }

      persistStatus = '✅ saved to Vercel';
    } catch (e: any) {
      persistStatus = `⚠️ failed: ${e.message}`;
    }
  }

  return new NextResponse(
    `<html><body style="font-family:monospace;padding:40px;background:#111;color:#0f0">
      <h2>✅ Bouncie Connected!</h2>
      <p>Tokens ${persistStatus}</p>
      <p style="color:#888">Access token expires in ${data.expires_in}s</p>
      <p style="color:#888">You can close this page.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
