import { NextRequest, NextResponse } from 'next/server';
import { parseTuroEmail } from '@/lib/turo-emails';

export const dynamic = 'force-dynamic';

async function getToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

function extractText(payload: any): string {
  if (!payload) return '';
  // text/plain part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  // multipart
  if (payload.parts) {
    for (const part of payload.parts) {
      const t = extractText(part);
      if (t) return t;
    }
  }
  // fallback: html
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  }
  return '';
}

export async function GET(req: NextRequest) {
  const msgId = req.nextUrl.searchParams.get('id');
  const q = req.nextUrl.searchParams.get('q');
  const token = await getToken();

  let targetId = msgId;
  if (!targetId && q) {
    const list = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const ld = await list.json();
    targetId = ld.messages?.[0]?.id;
  }

  if (!targetId) return NextResponse.json({ error: 'provide ?id= or ?q=' });

  const detail = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${targetId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = await detail.json();
  const headers = d.payload?.headers || [];
  const subject = headers.find((h: any) => h.name === 'Subject')?.value;
  const body = extractText(d.payload);
  const parsed = parseTuroEmail(body);

  return NextResponse.json({
    subject,
    bodyLength: body.length,
    bodyPreview: body.substring(0, 2000),
    parsed,
  });
}
