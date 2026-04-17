import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || 'from:noreply@mail.turo.com';
  const max = req.nextUrl.searchParams.get('max') || '10';

  const token = await getToken();
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const listData = await listRes.json();

  if (!listData.messages?.length) {
    return NextResponse.json({ query: q, count: 0, messages: [], raw: listData, tokenPrefix: token?.substring(0, 20) });
  }

  const results = [];
  for (const msg of listData.messages.slice(0, 5)) {
    const detail = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await detail.json();
    const headers = d.payload?.headers || [];
    results.push({
      id: msg.id,
      subject: headers.find((h: any) => h.name === 'Subject')?.value,
      date: headers.find((h: any) => h.name === 'Date')?.value,
      labels: d.labelIds,
    });
  }

  return NextResponse.json({ query: q, total: listData.resultSizeEstimate, count: listData.messages.length, messages: results });
}
