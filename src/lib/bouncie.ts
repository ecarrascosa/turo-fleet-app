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

// In-memory token cache (refreshes when expired)
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function refreshAccessToken(): Promise<string> {
  const res = await fetch(BOUNCIE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.BOUNCIE_CLIENT_ID,
      client_secret: process.env.BOUNCIE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: process.env.BOUNCIE_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    throw new Error(`Bouncie token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 60s early
  
  // Note: In production, you'd want to store the new refresh_token
  // data.refresh_token replaces the old one
  
  return data.access_token;
}

async function getAccessToken(): Promise<string> {
  // Use cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // Try env token first
  const envToken = process.env.BOUNCIE_ACCESS_TOKEN;
  if (envToken && !cachedToken) {
    // Test if env token still works
    const testRes = await fetch(`${BOUNCIE_API_BASE}/vehicles?limit=1`, {
      headers: { Authorization: envToken },
    });
    if (testRes.ok) {
      cachedToken = envToken;
      tokenExpiry = Date.now() + 30 * 60 * 1000; // Assume 30min left
      return envToken;
    }
  }

  // Refresh
  return refreshAccessToken();
}

export async function getBouncieVehicles(): Promise<BouncieVehicle[]> {
  const token = await getAccessToken();

  const res = await fetch(`${BOUNCIE_API_BASE}/vehicles`, {
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 401) {
    // Token expired, force refresh and retry
    cachedToken = null;
    const newToken = await refreshAccessToken();
    const retry = await fetch(`${BOUNCIE_API_BASE}/vehicles`, {
      headers: {
        Authorization: newToken,
        'Content-Type': 'application/json',
      },
    });
    if (!retry.ok) {
      throw new Error(`Bouncie API error: ${retry.status}`);
    }
    return retry.json();
  }

  if (!res.ok) {
    throw new Error(`Bouncie API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
