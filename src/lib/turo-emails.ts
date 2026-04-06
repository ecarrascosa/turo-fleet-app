/**
 * Turo Email Parser
 * Parses Turo notification emails (plain text from Gmail) into structured data.
 *
 * Gmail text format:
 *   Trip start: 3/17/26 6:30 pm
 *   Trip end: 3/18/26 10:00 am
 *   You earn: $34.54
 *   Mileage included: 200 miles
 *   Reservation ID #55225404
 *   Vehicle line: "Hyundai Elantra 2016"
 *   Guest phone: (415) 793-2361
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

export function parseTuroEmail(text: string): TuroEmail | null {
  if (!text) return null;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Determine type
  let type: TuroEmail['type'];
  if (/trip is booked/i.test(text)) {
    type = 'booked';
  } else if (/has cancelled their trip/i.test(text)) {
    type = 'cancelled';
  } else if (/has changed their trip/i.test(text)) {
    type = 'modified';
  } else if (/has sent you a message/i.test(text)) {
    type = 'message';
  } else {
    return null;
  }

  // Reservation ID
  const resMatch = text.match(/Reservation ID\s*#(\d+)/i);
  const reservationId = resMatch?.[1] || '';
  if (!reservationId) return null;

  // Guest name
  let guestName = '';
  const guestPatterns = [
    /(\w+)'s trip is booked/i,
    /(\w+) has cancelled/i,
    /(\w+) has changed/i,
    /(\w+) has sent you/i,
    /booked by (\w+)/i,
    /requested by (\w+)/i,
  ];
  for (const p of guestPatterns) {
    const m = text.match(p);
    if (m) { guestName = m[1]; break; }
  }

  // Guest phone
  const phoneMatch = text.match(/\((\d{3})\)\s*(\d{3})-(\d{4})/);
  const guestPhone = phoneMatch ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}` : undefined;

  // Vehicle — standalone line like "Toyota Corolla 2022" or "Jeep Cherokee 2016"
  let vehicleYear = '';
  let vehicleModel = '';
  // Look for "Make Model Year" on its own line
  const vMatch = text.match(/^\s+((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+\d)?)\s+(20\d{2}))\s*$/m);
  if (vMatch) {
    vehicleModel = vMatch[1].replace(/\s+20\d{2}$/, '').trim();
    vehicleYear = vMatch[2];
  }

  // Trip dates — "Trip start: 3/17/26 6:30 pm"
  const tripStart = parseTripDate(text, 'Trip start');
  const tripEnd = parseTripDate(text, 'Trip end');

  // Earnings — "You earn: $34.54" or "You'll earn $34.54"
  let earnings: number | undefined;
  const earnMatch = text.match(/You(?:'ll)? earn:?\s*\$?([\d,.]+)/i);
  if (earnMatch) earnings = parseFloat(earnMatch[1].replace(/,/g, ''));

  // Distance — "Mileage included: 200 miles"
  let distanceIncluded: number | undefined;
  const distMatch = text.match(/(?:Mileage|distance) included:?\s*(\d+)\s*miles/i);
  if (distMatch) distanceIncluded = parseInt(distMatch[1]);

  // Guest message (for message type)
  let guestMessage: string | undefined;
  if (type === 'message') {
    // Message is between "about your [Vehicle]." and "Reply https://"
    const msgMatch = text.match(/about your .+\.\s*\n+([\s\S]+?)\n\s*Reply\s+https/i);
    if (msgMatch) {
      guestMessage = msgMatch[1].trim();
      if (/contains? photo/i.test(guestMessage)) guestMessage = '[Photo]';
    }
  }

  // Changes (for modified type)
  let changes: string | undefined;
  if (type === 'modified') {
    const changeMatch = text.match(/Here's what .+ changed:\s*\n+[\s\S]*?-\s*\n\s*(.*?)(?:\n\n|\n\s*Your earnings)/);
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
    guestMessage,
    changes,
  };
}

function parseTripDate(text: string, label: string): string | undefined {
  // Pattern 1: "Trip start: 3/17/26 6:30 pm" (US format M/D/YY)
  const usPattern = new RegExp(label + ':?\\s*(\\d{1,2})/(\\d{1,2})/(\\d{2,4})\\s+(\\d{1,2}:\\d{2}\\s*(?:AM|PM|am|pm))', 'i');
  const usMatch = text.match(usPattern);
  if (usMatch) {
    const month = parseInt(usMatch[1]);
    const day = parseInt(usMatch[2]);
    let year = parseInt(usMatch[3]);
    if (year < 100) year += 2000;

    const timeParts = usMatch[4].match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeParts) return undefined;

    let hours = parseInt(timeParts[1]);
    const minutes = parseInt(timeParts[2]);
    const ampm = timeParts[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const date = new Date(year, month - 1, day, hours, minutes);
    return date.toISOString();
  }

  // Pattern 2: "Trip start: 07/04/2026 07:00" (DD/MM/YYYY HH:MM - international format)
  const intlPattern = new RegExp(label + ':?\\s*(\\d{2})/(\\d{2})/(\\d{4})\\s+(\\d{1,2}):(\\d{2})', 'i');
  const intlMatch = text.match(intlPattern);
  if (intlMatch) {
    const day = parseInt(intlMatch[1]);
    const month = parseInt(intlMatch[2]);
    const year = parseInt(intlMatch[3]);
    const hours = parseInt(intlMatch[4]);
    const minutes = parseInt(intlMatch[5]);

    const date = new Date(year, month - 1, day, hours, minutes);
    return date.toISOString();
  }

  return undefined;
}

export function parseTuroEmails(rawText: string): TuroEmail[] {
  const parts = rawText.split(/Turo <noreply@mail\.turo\.com>/);
  const results: TuroEmail[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    const parsed = parseTuroEmail(part);
    if (parsed) results.push(parsed);
  }
  return results;
}
