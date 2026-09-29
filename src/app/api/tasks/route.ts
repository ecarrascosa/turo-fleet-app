import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getWeekBounds(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (dt: Date) => dt.toISOString().split('T')[0];
  return { monday: fmt(mon), sunday: fmt(sun) };
}

export async function GET(req: NextRequest) {
  try {
    const weekParam = req.nextUrl.searchParams.get('week') ||
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const { monday, sunday } = getWeekBounds(weekParam);

    const { rows } = await sql`
      SELECT * FROM tasks
      WHERE start_date <= ${sunday}::date AND end_date >= ${monday}::date
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END,
        end_date ASC,
        created_at ASC
    `;

    return NextResponse.json({ tasks: rows, monday, sunday });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, vehicle, priority, start_date, end_date } = body;
    if (!title || !start_date || !end_date) {
      return NextResponse.json({ error: 'title, start_date, end_date required' }, { status: 400 });
    }
    const p = ['urgent', 'normal', 'low'].includes(priority) ? priority : 'normal';
    const { rows } = await sql`
      INSERT INTO tasks (title, description, vehicle, priority, start_date, end_date)
      VALUES (${title}, ${description || null}, ${vehicle || null}, ${p}, ${start_date}::date, ${end_date}::date)
      RETURNING *
    `;
    return NextResponse.json({ task: rows[0] }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
