const BOUNCIE_API_BASE = 'https://api.bouncie.dev/v1';

export interface BouncieVehicle {
  vin: string;
  imei: string;
  nickName: string;
  model: {
    make: string;
    name: string;
    year: number;
  };
  stats: {
    location: {
      lat: number;
      lon: number;
      heading: number;
      address: string;
    };
    lastUpdated: string;
    speed: number;
    isRunning: boolean;
  };
}

export async function getBouncieVehicles(accessToken: string): Promise<BouncieVehicle[]> {
  const res = await fetch(`${BOUNCIE_API_BASE}/vehicles`, {
    headers: {
      Authorization: accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Bouncie API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
