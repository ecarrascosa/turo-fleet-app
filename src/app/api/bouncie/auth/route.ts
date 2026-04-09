import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Step 1: Get transaction ID from Bouncie
  const clientId = process.env.BOUNCIE_CLIENT_ID;
  const redirectUri = process.env.BOUNCIE_REDIRECT_URI;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId!,
    redirect_uri: redirectUri!,
  });

  const res = await fetch(`https://auth.bouncie.com/api/oauth2?${params}`);
  const data = await res.json();

  // Return a simple HTML page with Google OAuth login
  const html = `
<!DOCTYPE html>
<html>
<head><title>Connect Bouncie</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
  .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
  h2 { margin-top: 0; }
  .btn { display: inline-block; padding: 12px 24px; background: #4285f4; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; text-decoration: none; }
  .btn:hover { background: #3367d6; }
  p { color: #666; }
</style>
</head>
<body>
<div class="card">
  <h2>Connect Bouncie</h2>
  <p>Click below to authorize with your Google account.</p>
  <p style="font-size:12px;color:#999;">Transaction: ${data.transactionID}</p>
  <a class="btn" href="https://accounts.google.com/o/oauth2/v2/auth?client_id=154479919985-47o86m89ht9mqddk0u1sqr8dske0b7d0.apps.googleusercontent.com&redirect_uri=${encodeURIComponent('https://auth.bouncie.com/dialog/authorize')}&response_type=token&scope=email%20profile&state=${data.transactionID}">
    Sign in with Google
  </a>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
