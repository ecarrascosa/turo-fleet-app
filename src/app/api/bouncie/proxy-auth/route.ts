import { NextRequest, NextResponse } from 'next/server';

// This proxies the Bouncie OAuth flow for when their auth page won't render
// Step 1: GET - returns a login page
// Step 2: POST - authenticates with Bouncie and returns the auth code

export async function GET() {
  const clientId = process.env.BOUNCIE_CLIENT_ID;
  const redirectUri = process.env.BOUNCIE_REDIRECT_URI;

  // Get transaction ID
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId!,
    redirect_uri: redirectUri!,
  });

  const txRes = await fetch(`https://auth.bouncie.com/api/oauth2?${params}`);
  const txData = await txRes.json();

  const html = `
<!DOCTYPE html>
<html>
<head><title>Connect Bouncie</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
  .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; width: 100%; }
  h2 { margin-top: 0; text-align: center; }
  input { width: 100%; padding: 10px; margin: 8px 0; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
  .btn { width: 100%; padding: 12px; background: #acc640; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; margin-top: 12px; }
  .btn:hover { background: #8ca71d; }
  .google-btn { background: #4285f4; margin-top: 16px; }
  .google-btn:hover { background: #3367d6; }
  .divider { text-align: center; color: #999; margin: 16px 0; }
  .status { text-align: center; color: #666; margin-top: 12px; }
  .error { color: red; }
</style>
</head>
<body>
<div class="card">
  <h2>🔗 Connect Bouncie</h2>
  
  <form id="loginForm">
    <input type="hidden" id="transactionID" value="${txData.transactionID}" />
    <input type="email" id="email" placeholder="Email Address" required />
    <input type="password" id="password" placeholder="Password" required />
    <button type="submit" class="btn">Sign In</button>
  </form>

  <div class="divider">— or —</div>

  <p style="text-align:center; color:#666; font-size:13px;">
    If you use Google/Facebook/Apple to sign in, you'll need to 
    <a href="https://www.bouncie.app/reset-password" target="_blank">set a password</a> 
    on your Bouncie account first, then sign in with email above.
  </p>

  <div id="status" class="status"></div>
</div>

<script>
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('status');
  status.textContent = 'Signing in...';
  status.className = 'status';
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const transactionID = document.getElementById('transactionID').value;
  
  try {
    const res = await fetch('/api/bouncie/proxy-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, transactionID })
    });
    const data = await res.json();
    if (data.access_token) {
      status.textContent = 'Connected! Token received.';
      document.querySelector('.card').innerHTML = '<h2>✅ Bouncie Connected!</h2><p style="text-align:center">Access token saved. You can close this page.</p><pre style="word-break:break-all;font-size:11px;background:#f5f5f5;padding:10px;border-radius:6px;">' + data.access_token + '</pre>';
    } else {
      status.textContent = data.error || 'Authentication failed';
      status.className = 'status error';
    }
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    status.className = 'status error';
  }
});
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

export async function POST(req: NextRequest) {
  const { email, password, transactionID } = await req.json();
  const clientId = process.env.BOUNCIE_CLIENT_ID;
  const redirectUri = process.env.BOUNCIE_REDIRECT_URI;

  try {
    // Step 1: Authenticate with Bouncie
    const authRes = await fetch('https://auth.bouncie.com/api/authenticate/local', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'appId': 'bouncie',
      },
      body: JSON.stringify({
        username: email,
        password: password,
        clientId: clientId,
      }),
    });

    if (!authRes.ok) {
      const err = await authRes.text();
      return NextResponse.json({ error: 'Login failed. Check email/password.', details: err }, { status: 401 });
    }

    const authData = await authRes.json();
    const { token, user } = authData;

    // Step 2: Grant authorization (bypass or decision)
    const grantRes = await fetch(`https://auth.bouncie.com/api/oauth2/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        transaction_id: transactionID,
        allow: true,
      }),
      redirect: 'manual', // Don't follow redirects
    });

    // The grant endpoint redirects to our callback with the code
    const location = grantRes.headers.get('location');
    
    if (location) {
      const url = new URL(location);
      const code = url.searchParams.get('code');
      
      if (code) {
        // Step 3: Exchange code for token
        const tokenRes = await fetch('https://auth.bouncie.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: process.env.BOUNCIE_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenRes.ok) {
          const err = await tokenRes.text();
          return NextResponse.json({ error: 'Token exchange failed', details: err }, { status: 500 });
        }

        const tokenData = await tokenRes.json();
        return NextResponse.json({
          message: 'Bouncie connected!',
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in,
        });
      }
    }

    // If no redirect, try bypass grant for authorized apps
    const bypassRes = await fetch(
      `https://auth.bouncie.com/oauth2/decision/bypass?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri!)}&userId=${user._id}`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
        redirect: 'manual',
      }
    );

    const bypassLocation = bypassRes.headers.get('location');
    if (bypassLocation) {
      const url = new URL(bypassLocation);
      const code = url.searchParams.get('code');
      
      if (code) {
        const tokenRes = await fetch('https://auth.bouncie.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: process.env.BOUNCIE_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }),
        });

        const tokenData = await tokenRes.json();
        return NextResponse.json({
          message: 'Bouncie connected!',
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in,
        });
      }
    }

    return NextResponse.json({ 
      error: 'Could not complete authorization flow',
      authData: { token: token ? 'received' : 'missing', userId: user?._id },
    }, { status: 500 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
