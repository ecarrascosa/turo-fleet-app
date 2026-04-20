/**
 * Gmail API integration using Service Account with domain-wide delegation.
 * No more expiring refresh tokens!
 */
import * as crypto from 'crypto';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const GMAIL_USER = process.env.GMAIL_USER_EMAIL!; // email to impersonate

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

let cachedAccessToken = '';
let tokenExpiry = 0;

function getServiceAccountKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY env var');
  const parsed = JSON.parse(raw);
  // Fix private key newlines that may get mangled in env vars
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed;
}

function createJWT(sa: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    sub: GMAIL_USER,
    scope: SCOPES.join(' '),
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const b64 = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, 'base64url');

  return `${unsigned}.${signature}`;
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry - 60000) {
    return cachedAccessToken;
  }

  const sa = getServiceAccountKey();
  const jwt = createJWT(sa);

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Service account token error: ${data.error} - ${data.error_description}`);
  }

  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

async function gmailApi(path: string): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return res.json();
}

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}

/**
 * Fetch Turo notification emails from Gmail.
 */
export async function fetchTuroEmails(maxResults = 20, afterDate?: string): Promise<GmailMessage[]> {
  const dateFilter = afterDate ? (() => {
    const d = new Date(afterDate);
    return ` after:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  })() : '';

  const queries = [
    `from:noreply@mail.turo.com subject:"is booked"${dateFilter}`,
    `from:noreply@mail.turo.com subject:"has cancelled"${dateFilter}`,
    `from:noreply@mail.turo.com subject:"has changed"${dateFilter}`,
  ];

  const allMessages: Array<{ id: string }> = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    const listRes = await gmailApi(
      `messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
    );
    console.log(`[gmail] query="${query.substring(30)}" results=${listRes.messages?.length || 0} error=${listRes.error?.message || 'none'}`);
    if (listRes.messages) {
      for (const msg of listRes.messages) {
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          allMessages.push(msg);
        }
      }
    }
  }

  if (allMessages.length === 0) return [];

  const messages: GmailMessage[] = [];
  for (const msg of allMessages) {
    const detail = await gmailApi(`messages/${msg.id}?format=full`);
    const headers = detail.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';
    const body = extractBody(detail.payload);
    messages.push({ id: msg.id, subject, from, date, body });
  }

  messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return messages;
}

function extractBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
    }
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
      return stripHtml(html);
    }
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
