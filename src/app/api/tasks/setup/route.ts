import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        vehicle VARCHAR(255),
        priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','normal','low')),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    return NextResponse.json({ success: true, message: 'tasks table created' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
