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

  // Get order list for this car
  const res = await fetch(`${BASE_URL}/device-service/remoteControl/getOrderList`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token, clientType: 'pc', appVersion: '1.0.0', 'Accept-Language': 'en' },
    body: JSON.stringify({ carId }),
  });
  const data = await res.json();

  return NextResponse.json(data);
}
