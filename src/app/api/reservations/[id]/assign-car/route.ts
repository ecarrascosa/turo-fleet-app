import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { carId } = await request.json();

    if (!carId) {
      return NextResponse.json({ error: 'carId is required' }, { status: 400 });
    }

    const result = await sql`
      UPDATE reservations SET car_id = ${carId}, updated_at = NOW()
      WHERE reservation_id = ${id}
      RETURNING reservation_id
    `;

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, reservationId: id, carId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
