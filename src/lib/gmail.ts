/**
 * Gmail API integration for fetching Turo emails.
 */

const CLIENT_ID = process.env.GMAIL_CLIENT_ID!;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN!;

let cachedAccessToken = '';
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry - 60000) {
    return cachedAccessToken;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Gmail token refresh failed: ${data.error}`);

  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

async function gmailApi(path: string): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
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
 * @param maxResults Number of emails to fetch (default 20)
 * @param afterDate Only fetch emails after this date (ISO string)
 */
export async function fetchTuroEmails(maxResults = 20, afterDate?: string): Promise<GmailMessage[]> {
  const dateFilter = afterDate ? (() => {
    const d = new Date(afterDate);
    return ` after:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  })() : '';

  // Fetch booking/modification emails first (they have the dates), then messages
  const queries = [
    `from:noreply@mail.turo.com subject:"is booked"${dateFilter}`,
    `from:noreply@mail.turo.com subject:"has changed"${dateFilter}`,
    `from:noreply@mail.turo.com subject:"has cancelled"${dateFilter}`,
    `from:noreply@mail.turo.com subject:"has sent you a message"${dateFilter}`,
  ];

  const allMessages: Array<{ id: string }> = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    const listRes = await gmailApi(
      `messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
    );
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

    // Extract body text
    const body = extractBody(detail.payload);

    messages.push({ id: msg.id, subject, from, date, body });
  }

  return messages;
}

/**
 * Extract plain text body from Gmail message payload.
 */
function extractBody(payload: any): string {
  if (!payload) return '';

  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  // Multipart — prefer text/plain, fall back to text/html
  if (payload.parts) {
    // Try text/plain first
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
    }

    // Try text/html and strip tags
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
      return stripHtml(html);
    }

    // Recurse into nested multipart
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }

  return '';
}

/**
 * Basic HTML to text conversion.
 */
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
