import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || 'from:noreply@mail.turo.com';
  const max = parseInt(req.nextUrl.searchParams.get('max') || '500', 10);

  // Refresh token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return NextResponse.json({ error: 'Token refresh failed', detail: tokenData });
  }
  const token = tokenData.access_token;

  // Paginate through ALL message IDs
  const allIds: string[] = [];
  let pageToken: string | undefined;

  while (allIds.length < max) {
    const pageSize = Math.min(100, max - allIds.length);
    let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${pageSize}`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const listRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const listData = await listRes.json();

    if (!listData.messages?.length) break;

    for (const msg of listData.messages) {
      allIds.push(msg.id);
    }

    pageToken = listData.nextPageToken;
    if (!pageToken) break;
  }

  return NextResponse.json({ query: q, count: allIds.length, allIds });
}
