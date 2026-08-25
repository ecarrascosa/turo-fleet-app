import { NextResponse } from 'next/server';
import { sendCommand, COMMANDS } from '@/lib/whatsgps';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const JEEP_CHEROKEE_CAR_ID = '2848014';

export async function GET() {
  try {
    const passwd = process.env.WHATSGPS_CMD_PASSWORD || '';
    const result = await sendCommand(
      JEEP_CHEROKEE_CAR_ID,
      COMMANDS.ENGINE.orderId,
      COMMANDS.ENGINE.restore,
      passwd
    );
    return NextResponse.json({
      success: true,
      car: '2016 Cherokee',
      carId: JEEP_CHEROKEE_CAR_ID,
      action: 'restore-engine',
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
