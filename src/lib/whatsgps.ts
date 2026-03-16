import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://www.whatsgps.com/web/api';
const TOKEN = process.env.WHATSGPS_TOKEN!;
const ENT_ID = process.env.WHATSGPS_ENT_ID!;
const CMD_PASSWORD = process.env.WHATSGPS_CMD_PASSWORD || '';

// Persistent lock/kill state tracking
const STATE_FILE = path.join(process.cwd(), 'device-state.json');

interface DeviceState {
  [carId: string]: { locked: boolean; engineCut: boolean; updatedAt: string };
}

function loadState(): DeviceState {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return {}; }
}

function saveState(state: DeviceState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function setDeviceState(carId: string, locked?: boolean, engineCut?: boolean) {
  const state = loadState();
  const prev = state[carId] || { locked: false, engineCut: false, updatedAt: '' };
  state[carId] = {
    locked: locked !== undefined ? locked : prev.locked,
    engineCut: engineCut !== undefined ? engineCut : prev.engineCut,
    updatedAt: new Date().toISOString(),
  };
  saveState(state);
}

export function getDeviceStates(): DeviceState {
  return loadState();
}

// Command Order IDs (global for G21L devices)
export const COMMANDS = {
  DOOR: { orderId: '7169971628812562432', lock: '0', unlock: '1' },
  ENGINE: { orderId: '7161621819198304256', cut: '1', restore: '0' },
};

async function api(path: string, body?: any, method = 'POST') {
  const headers: Record<string, string> = {
    'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json',
    'Token': TOKEN,
    'clientType': 'pc',
    'appVersion': '1.0.0',
    'Accept-Language': 'en',
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: typeof body === 'object' ? JSON.stringify(body) : body,
  });
  return res.json();
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
  return cars.filter(c => c.active);
}

export async function sendCommand(carId: string, orderId: string, onOff: string, password?: string) {
  const parameterMap: Record<string, string> = { orderId, on_off: onOff };
  if (password) parameterMap.password = password;
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
