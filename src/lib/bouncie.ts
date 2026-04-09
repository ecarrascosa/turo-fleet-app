const BOUNCIE_API_BASE = 'https://api.bouncie.dev/v1';
const BOUNCIE_TOKEN_URL = 'https://auth.bouncie.com/oauth/token';

export interface BouncieVehicle {
  vin: string;
  imei: string;
  nickName?: string;
  standardEngine?: string;
  model: {
    make: string;
    name: string;
    year: number;
  };
  stats: {
    localTimeZone?: string;
    lastUpdated: string;
    odometer?: number;
    location?: {
      lat: number;
      lon: number;
      heading: number;
      address: string | null;
    };
    fuelLevel?: number;
    isRunning: boolean;
    speed: number;
    mil?: {
      milOn: boolean;
      lastUpdated: string;
      qualifiedDtcList: Array<{ code: string; name: string[] }>;
    };
    battery?: {
      status: string;
      lastUpdated: string;
    };
  };
}

// In-memory token cache — survives across warm invocations on Vercel
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let tokenExpiry: number = 0;

/** Fetch the latest BOUNCIE_REFRESH_TOKEN from Vercel env vars API (cold start recovery) */
async function fetchRefreshTokenFromVercel(): Promise<string | null> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) return null;

  try {
    const qs = teamId ? `?teamId=${teamId}` : '';
    const listRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) return null;
    const { envs } = await listRes.json();
    const existing = envs?.find((e: any) => e.key === 'BOUNCIE_REFRESH_TOKEN');
    if (!existing?.id) return null;

    // Fetch the decrypted value
    const detailRes = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}${qs}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!detailRes.ok) return null;
    const detail = await detailRes.json();
    return detail.value || null;
  } catch (e) {
    console.warn('[Bouncie] Failed to fetch refresh token from Vercel API:', e);
    return null;
  }
}

async function refreshAccessToken(): Promise<string> {
  // Try cached → Vercel API (latest) → process.env (deploy-time fallback)
  let refreshToken = cachedRefreshToken;
  if (!refreshToken) {
    console.log('[Bouncie] No cached refresh token, fetching from Vercel API...');
    refreshToken = await fetchRefreshTokenFromVercel();
  }
  if (!refreshToken) {
    refreshToken = process.env.BOUNCIE_REFRESH_TOKEN || null;
  }
  if (!refreshToken) throw new Error('No Bouncie refresh token available');

  const res = await fetch(BOUNCIE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.BOUNCIE_CLIENT_ID,
      client_secret: process.env.BOUNCIE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    // If refresh fails, clear cached token so next cold start uses env var
    cachedRefreshToken = null;
    throw new Error(`Bouncie token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  // CRITICAL: Bouncie rotates refresh tokens — cache the new one in memory
  if (data.refresh_token) {
    cachedRefreshToken = data.refresh_token;
    // Also update Vercel env var so cold starts get the latest token
    updateVercelEnv(data.refresh_token).catch(e =>
      console.warn('[Bouncie] Failed to persist refresh token to Vercel:', e.message)
    );
  }

  return data.access_token;
}

/** Best-effort update of the Vercel env var for cold start resilience */
async function updateVercelEnv(newRefreshToken: string) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) return; // Skip if not configured

  const base = 'https://api.vercel.com';
  const qs = teamId ? `?teamId=${teamId}` : '';

  // List env vars to find the one to update
  const listRes = await fetch(`${base}/v9/projects/${projectId}/env${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) return;
  const { envs } = await listRes.json();
  const existing = envs?.find((e: any) => e.key === 'BOUNCIE_REFRESH_TOKEN');
  if (!existing) return;

  // Patch it
  await fetch(`${base}/v9/projects/${projectId}/env/${existing.id}${qs}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: newRefreshToken }),
  });
  console.log('[Bouncie] Refresh token persisted to Vercel env');
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  // On cold start, try env access token before refreshing
  const envAccessToken = process.env.BOUNCIE_ACCESS_TOKEN;
  if (envAccessToken && !cachedAccessToken) {
    cachedAccessToken = envAccessToken;
    tokenExpiry = Date.now() + 30 * 60 * 1000; // Assume some time left
    return envAccessToken;
  }

  return refreshAccessToken();
}

export async function getBouncieVehicles(): Promise<BouncieVehicle[]> {
  const token = await getAccessToken();

  const res = await fetch(`${BOUNCIE_API_BASE}/vehicles`, {
    headers: { Authorization: token },
  });

  if (res.status === 401) {
    // Token expired, force refresh and retry
    cachedAccessToken = null;
    const newToken = await refreshAccessToken();
    const retry = await fetch(`${BOUNCIE_API_BASE}/vehicles`, {
      headers: { Authorization: newToken },
    });
    if (!retry.ok) throw new Error(`Bouncie API error: ${retry.status}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`Bouncie API error: ${res.status} ${res.statusText}`);
  return res.json();
}
