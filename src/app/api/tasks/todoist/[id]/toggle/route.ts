import { NextRequest, NextResponse } from 'next/server';

const TODOIST_TOKEN = process.env.TODOIST_API_TOKEN!;
const API_BASE = 'https://api.todoist.com/api/v1';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.done ? 'reopen' : 'close'; // if currently done, reopen; else close

  const res = await fetch(`${API_BASE}/tasks/${id}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    return NextResponse.json({ error: `Todoist ${action} failed: ${res.status} ${txt}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, action });
}
