import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.whatsgps.com/web/api';
const ENT_ID = process.env.WHATSGPS_ENTITY_ID || '179007';

async function getToken() {
  const res = await fetch(`${BASE_URL}/user-service/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', clientType: 'pc', appVersion: '1.0.0', 'Accept-Language': 'en' },
    body: new URLSearchParams({ name: process.env.WHATSGPS_USER!, password: process.env.WHATSGPS_PASS!, timeZoneSecond: '-28800', lang: 'en' }),
  });
  const d = await res.json();
  return d.data?.token || d.token;
}

export async function GET(req: NextRequest) {
  const carId = req.nextUrl.searchParams.get('carId') || '2862785';
  const token = await getToken();

  // Try multiple endpoints to discover commands
  const endpoints = [
    '/device-service/remoteControl/getOrderParameterList',
    '/device-service/remoteControl/getOrderList', 
    '/device-service/remoteControl/getSupportOrders',
  ];
  
  const results: any = {};
  for (const ep of endpoints) {
    // Try with just carId, and also with known orderIds
    for (const body of [
      { carId },
      { carId, orderId: '7169971628812562432' }, // door lock
      { carId, orderId: '7161621819198304256' }, // engine
    ]) {
      const res = await fetch(`${BASE_URL}${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Token: token, clientType: 'pc', appVersion: '1.0.0', 'Accept-Language': 'en' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success !== false && data.status !== 404) {
        results[`${ep}|${JSON.stringify(body)}`] = data;
      }
    }
  }

  return NextResponse.json(results);
}
