/**
 * Turo Email Parser
 * Parses Turo notification emails into structured reservation data.
 */

export interface TuroEmail {
  type: 'booked' | 'cancelled' | 'modified' | 'message';
  reservationId: string;
  guestName: string;
  guestPhone?: string;
  vehicleYear: string;
  vehicleModel: string;
  tripStart: string; // ISO
  tripEnd: string; // ISO
  earnings?: number;
  distanceIncluded?: number;
  location?: string;
  guestMessage?: string;
  changes?: string;
}

/**
 * Parse raw Turo email text into structured data.
 */
export function parseTuroEmail(rawText: string): TuroEmail | null {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Determine email type from subject/content
  let type: TuroEmail['type'];
  if (/trip.*is booked/i.test(text) || /trip with your.*is booked/i.test(text)) {
    type = 'booked';
  } else if (/has cancelled their trip/i.test(text)) {
    type = 'cancelled';
  } else if (/has changed their trip/i.test(text)) {
    type = 'modified';
  } else if (/has sent you a message/i.test(text)) {
    type = 'message';
  } else {
    return null; // Unknown email type
  }

  // Extract reservation ID
  const resMatch = text.match(/Reservation ID\s*#?(\d+)/i);
  const reservationId = resMatch?.[1] || '';
  if (!reservationId) return null;

  // Extract guest name — patterns like "Isaac's trip" or "Isaac has cancelled" or "Isaac has sent"
  let guestName = '';
  const guestMatch = text.match(/^(\w+)(?:'s trip|'s trip| has cancelled| has changed| has sent)/m)
    || text.match(/Cha-ching!\s+(\w+)'s trip/i)
    || text.match(/(\w+)\s+has (?:cancelled|changed|sent)/i);
  if (guestMatch) guestName = guestMatch[1];

  // Extract guest phone
  const phoneMatch = text.match(/\((\d{3})\)\s*(\d{3})-(\d{4})/);
  const guestPhone = phoneMatch ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}` : undefined;

  // Extract vehicle year and model
  let vehicleYear = '';
  let vehicleModel = '';
  // Pattern: "Toyota Corolla 2022\nToyota Corolla" or "Jeep Cherokee 2016\nJeep Cherokee"
  const vehicleMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(20\d{2})\n/);
  if (vehicleMatch) {
    vehicleModel = vehicleMatch[1];
    vehicleYear = vehicleMatch[2];
  }

  // Extract trip start/end
  const tripStart = parseTrip(text, 'Trip start');
  const tripEnd = parseTrip(text, 'Trip end');

  // Extract earnings
  let earnings: number | undefined;
  const earnMatch = text.match(/You earn\s*\n?\s*\$?([\d,.]+)/i)
    || text.match(/You'll earn\s+\$?([\d,.]+)/i);
  if (earnMatch) {
    earnings = parseFloat(earnMatch[1].replace(/,/g, ''));
  }

  // Extract distance included
  let distanceIncluded: number | undefined;
  const distMatch = text.match(/(\d+)\s*miles/i);
  if (distMatch) distanceIncluded = parseInt(distMatch[1]);

  // Extract location
  let location: string | undefined;
  const locMatch = text.match(/Location\s*\n\s*(.+)\n\s*(.+(?:CA|California)\s*\d*)/i);
  if (locMatch) location = `${locMatch[1].trim()}, ${locMatch[2].trim()}`;

  // Extract guest message (for message type)
  let guestMessage: string | undefined;
  if (type === 'message') {
    // Message appears between "has sent you a message" intro and "Reply" button
    const msgMatch = text.match(/about your .+\.\s*\n+([\s\S]+?)\n+Reply/);
    if (msgMatch) {
      guestMessage = msgMatch[1].trim();
      // Handle photo messages
      if (/Contains photo/i.test(guestMessage)) {
        guestMessage = '[Photo]';
      }
    }
  }

  // Extract changes (for modified type)
  let changes: string | undefined;
  if (type === 'modified') {
    const changeMatch = text.match(/Here's what .+ changed:\s*\n+[–-]\s*\n([\s\S]+?)(?:\n\n|Your earnings)/);
    if (changeMatch) changes = changeMatch[1].trim();
  }

  return {
    type,
    reservationId,
    guestName,
    guestPhone,
    vehicleYear,
    vehicleModel,
    tripStart: tripStart || '',
    tripEnd: tripEnd || '',
    earnings,
    distanceIncluded,
    location,
    guestMessage,
    changes,
  };
}

/**
 * Parse a trip date from email text.
 * Looks for patterns like:
 *   Trip start
 *   3/30/26
 *   7:30 am
 */
function parseTrip(text: string, label: string): string | undefined {
  const pattern = new RegExp(label + '\\s*\\n\\s*(\\d{1,2}/\\d{1,2}/\\d{2,4})\\s*\\n\\s*(\\d{1,2}:\\d{2}\\s*(?:AM|PM|am|pm))', 'i');
  const match = text.match(pattern);
  if (!match) return undefined;

  const [, dateStr, timeStr] = match;
  const [month, day, year] = dateStr.split('/').map(Number);
  const fullYear = year < 100 ? 2000 + year : year;

  const timeParts = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeParts) return undefined;

  let hours = parseInt(timeParts[1]);
  const minutes = parseInt(timeParts[2]);
  const ampm = timeParts[3].toUpperCase();

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  // Create date in PST (America/Los_Angeles)
  const date = new Date(fullYear, month - 1, day, hours, minutes);
  return date.toISOString();
}

/**
 * Parse multiple emails from a raw text dump (e.g., forwarded email thread).
 */
export function parseTuroEmails(rawText: string): TuroEmail[] {
  // Split on Turo email headers
  const parts = rawText.split(/Turo <noreply@mail\.turo\.com>/);
  const results: TuroEmail[] = [];

  for (const part of parts) {
    if (!part.trim()) continue;
    const parsed = parseTuroEmail(part);
    if (parsed) results.push(parsed);
  }

  return results;
}
