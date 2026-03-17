import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GMAIL_CLIENT_ID!;
  const redirectUri = process.env.GMAIL_REDIRECT_URI!;
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
