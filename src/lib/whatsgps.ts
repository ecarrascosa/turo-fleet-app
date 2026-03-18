const BASE_URL = 'https://www.whatsgps.com/web/api';
const ENT_ID = process.env.WHATSGPS_ENT_ID!;
const CMD_PASSWORD = process.env.WHATSGPS_CMD_PASSWORD || '';
const WHATSGPS_USER = process.env.WHATSGPS_USER || '';
const WHATSGPS_PASS = process.env.WHATSGPS_PASS || '';

// Token cache (in-memory, refreshed on expiry)
let cachedToken = process.env.WHATSGPS_TOKEN || '';
let tokenExpiry = 0; // unix ms

function isTokenExpired(): boolean {
  if (!cachedToken) return true;
  // Decode JWT to check exp
  try {
    const payload = JSON.parse(Buffer.from(cachedToken.split('.')[1], 'base64').toString());
    // Refresh 1 hour before actual expiry
    return Date.now() >= (payload.exp * 1000) - 3600000;
  } catch {
    return true;
  }
}

async function login(): Promise<string> {
  if (!WHATSGPS_USER || !WHATSGPS_PASS) {
    throw new Error('WHATSGPS_USER and WHATSGPS_PASS env vars required for auto-login');
  }
  const body = new URLSearchParams({
    name: WHATSGPS_USER,
    password: WHATSGPS_PASS,
    timeZoneSecond: String(Math.round(new Date().getTimezoneOffset() / 60 * -1 * 3600)),
    lang: 'en',
  });
  const res = await fetch(`${BASE_URL}/user-service/user/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'clientType': 'pc',
      'appVersion': '1.0.0',
      'Accept-Language': 'en',
    },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.ret !== 1 || !data.data?.token) {
    throw new Error(`WhatsGPS login failed: ${data.msg || data.code || 'unknown error'}`);
  }
  cachedToken = data.data.token;
  console.log('[WhatsGPS] Token refreshed successfully');
  return cachedToken;
}

async function getToken(): Promise<string> {
  if (isTokenExpired()) {
    await login();
  }
  return cachedToken;
}

// In-memory state (best-effort, resets on cold start)
// TODO: replace with Upstash Redis or Vercel KV for persistence
interface DeviceState {
  [carId: string]: { locked: boolean; engineCut: boolean; updatedAt: string };
}

const memoryState: DeviceState = {};

export function setDeviceState(carId: string, locked?: boolean, engineCut?: boolean) {
  const prev = memoryState[carId] || { locked: false, engineCut: false, updatedAt: '' };
  memoryState[carId] = {
    locked: locked !== undefined ? locked : prev.locked,
    engineCut: engineCut !== undefined ? engineCut : prev.engineCut,
    updatedAt: new Date().toISOString(),
  };
}

export function getDeviceStates(): DeviceState {
  return memoryState;
}

// Command Order IDs (global for G21L devices)
export const COMMANDS = {
  DOOR: { orderId: '7169971628812562432', lock: '0', unlock: '1' },
  ENGINE: { orderId: '7161621819198304256', cut: '1', restore: '0' },
};

async function api(path: string, body?: any, method = 'POST', retry = true): Promise<any> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json',
    'Token': token,
    'clientType': 'pc',
    'appVersion': '1.0.0',
    'Accept-Language': 'en',
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: typeof body === 'object' ? JSON.stringify(body) : body,
  });
  const data = await res.json();
  // Auto-retry on token expiry (code C05002 = token expired)
  if (retry && (data.code === 'C05002' || data.msg?.includes('Token') || res.status === 401)) {
    console.log('[WhatsGPS] Token expired, refreshing...');
    cachedToken = ''; // force refresh
    return api(path, body, method, false);
  }
  return data;
}

export interface Car {
  carId: string;
  name: string;
  plate: string;
  imei: string;
  online: boolean;
  moving: boolean;
  speed: number;
  lat: number;
  lon: number;
  acc: string;
  locked: boolean;
  engineCut: boolean;
  voltage: string;
  active: boolean;
  staticTime?: number;
}

export async function getFleet(): Promise<Car[]> {
  const data = await api('/device-service/structure/v2/getMonitorCars', {
    subFlag: 0,
    targetEntId: ENT_ID,
    carGroupIds: '0',
    mapType: 2,
    isQueryDeviceImage: 1,
  });

  if (data.ret !== 1) throw new Error(data.msg || 'Failed to fetch fleet');

  const cars: Car[] = [];
  const deviceStates = getDeviceStates();
  for (const group of data.data) {
    for (const c of group.monitorCarsVoList || []) {
      const info = (c.customInfoList || []).reduce((acc: any, item: any) => {
        acc[item.id] = item.value;
        return acc;
      }, {});

      const status = c.carStatus || {};
      const tracked = deviceStates[c.carId];
      cars.push({
        carId: c.carId,
        name: c.machineName || '',
        plate: c.carNO || '',
        imei: c.imei || '',
        online: status.online === 1,
        moving: (status.runStatus === 2 || status.runStatus === 3) && ((status.speed || 0) * 0.621371) >= 5 && (!status.staticTime || (Date.now() - status.staticTime) < 120000),
        speed: Math.round((status.speed || 0) * 0.621371), // km/h to mph
        lat: status.lat || 0,
        lon: status.lon || 0,
        acc: info[17] || 'unknown',
        locked: tracked ? tracked.locked : false,
        engineCut: tracked ? tracked.engineCut : false,
        voltage: info[31] || '',
        active: c.active === 1,
        staticTime: status.staticTime,
      });
    }
  }
  // Exclude sold vehicles that still have telematics devices
  const EXCLUDED_CAR_IDS = new Set([
    '1990960516796776464', // Toyota Corolla 2017 (8FMU623) — sold
  ]);
  return cars.filter(c => c.active && !EXCLUDED_CAR_IDS.has(c.carId));
}

export async function sendCommand(carId: string, orderId: string, onOff: string, password?: string) {
  const parameterMap: Record<string, string> = { orderId, on_off: onOff };
  if (password) parameterMap.passwd = password;
  const data = await api('/device-service/remoteControl/sendOrder', {
    carId,
    orderId,
    parameterMap,
  });
  return data;
}

export async function checkCommandResult(serNO: string) {
  const data = await api('/device-service/remoteControl/getRes', `serNO=${serNO}&controlType=0`);
  return data;
}

export async function lockOnly(carId: string) {
  const lockResult = await sendCommand(carId, COMMANDS.DOOR.orderId, COMMANDS.DOOR.lock);
  setDeviceState(carId, true, undefined);
  return { lock: lockResult };
}

export async function lockAndKill(carId: string) {
  const lockResult = await sendCommand(carId, COMMANDS.DOOR.orderId, COMMANDS.DOOR.lock);
  const killResult = await sendCommand(carId, COMMANDS.ENGINE.orderId, COMMANDS.ENGINE.cut, CMD_PASSWORD);
  setDeviceState(carId, true, true);
  return { lock: lockResult, kill: killResult };
}

export async function unlockAndRestore(carId: string) {
  const unlockResult = await sendCommand(carId, COMMANDS.DOOR.orderId, COMMANDS.DOOR.unlock);
  const restoreResult = await sendCommand(carId, COMMANDS.ENGINE.orderId, COMMANDS.ENGINE.restore, CMD_PASSWORD);
  setDeviceState(carId, false, false);
  return { unlock: unlockResult, restore: restoreResult };
}
