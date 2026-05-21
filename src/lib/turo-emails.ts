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

export function parseTuroEmail(text: string, htmlBody?: string): TuroEmail | null {
  if (!text) return null;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Determine type
  let type: TuroEmail['type'];
  if (/trip is booked/i.test(text)) {
    type = 'booked';
  } else if (/has cancelled their trip/i.test(text) || /Turo (?:has )?cancelled/i.test(text) || /You['']ve cancelled/i.test(text)) {
    type = 'cancelled';
  } else if (/has changed their trip/i.test(text) || /confirmed .+['\u2018\u2019]s change request/i.test(text) || /has requested a change to their trip/i.test(text)) {
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
    /cancelled (\w+)[''']s trip/i,
    /(\w+) has changed/i,
    /confirmed (.+?)['\u2018\u2019]s change request/i,
    /(\w[\w ]+?) has requested a change to their trip/i,
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

  // Vehicle — try multiple patterns
  let vehicleYear = '';
  let vehicleModel = '';

  // Pattern 1 (PRIMARY): "Make Model Year" on its own line (e.g. "  Volkswagen Jetta 2013", "BMW X3 2016")
  // Allows uppercase words (BMW), mixed case (Volkswagen), alphanumeric model names (X3, RAV4)
  const vMatch = text.match(/^\s+((?:[A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)*)\s+((?:19|20)\d{2}))\s*$/m);
  if (vMatch) {
    vehicleModel = vMatch[1].replace(/\s+(?:19|20)\d{2}$/, '').trim();
    vehicleYear = vMatch[2];
  }

  // Pattern 2: "trip with your [Vehicle] is booked" or "change request with your [Vehicle]"
  // Also handles cancellations: "trip with your Toyota Corolla Cross We're sorry"
  if (!vehicleModel) {
    const subjectMatch = text.match(/(?:trip with your|change request with your)\s+(.+?)\s+(?:is\s+booked|is now confirmed)/i)
      || text.match(/trip with your\s+(.+?)\s+is\s+booked/i)
      || text.match(/trip with your\s+([A-Za-z][\w\s-]+?)(?:\s+is\b|\s+We\b|\s*$)/im)
      || text.match(/change request with your\s+(.+?)(?:\s+is\b|\s*$)/im);
    if (subjectMatch) {
      const vehicleStr = subjectMatch[1].trim();
      // Try to extract year from the vehicle string
      const yearInStr = vehicleStr.match(/\s+((?:19|20)\d{2})$/);
      if (yearInStr) {
        vehicleYear = yearInStr[1];
        vehicleModel = vehicleStr.replace(/\s+(?:19|20)\d{2}$/, '').trim();
      } else {
        vehicleModel = vehicleStr;
      }
    }
  }

  // Pattern 2.5: Inline "Booked trip Model Year Model" or "Cancelled trip Model Year Model"
  // Gmail often strips newlines so we get: "...Booked trip Toyota Corolla 2025 Toyota Corolla Trip start..."
  if (!vehicleYear && vehicleModel) {
    const inlineMatch = text.match(new RegExp(
      '(?:Booked|Cancelled|Modified)\\s+trip\\s+' +
      vehicleModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s+((?:19|20)\\d{2})\\s+' +
      vehicleModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    ));
    if (inlineMatch) {
      vehicleYear = inlineMatch[1];
    }
  }

  // Pattern 3: "your [Year Make Model]" — "your 2025 Toyota RAV4"
  if (!vehicleModel) {
    const yourMatch = text.match(/your\s+((?:19|20)\d{2})\s+([A-Za-z][\w\s-]+?)(?:\s+is\b|\s+on\b|\s*[.!,]|\s*$)/im);
    if (yourMatch) {
      vehicleYear = yourMatch[1];
      vehicleModel = yourMatch[2].trim();
    }
  }

  // Trip dates — "Trip start: 3/17/26 6:30 pm"
  // Also handle "New trip start on Wednesday, May 13, 2026, 5:30 AM" from change requests
  let tripStart = parseTripDate(text, 'Trip start');
  let tripEnd = parseTripDate(text, 'Trip end');

  if (!tripStart) tripStart = parseNewTripDate(text, 'start');
  if (!tripEnd) tripEnd = parseNewTripDate(text, 'end');

  // Earnings — "You earn: $34.54" or "You'll earn $34.54"
  let earnings: number | undefined;
  const earnMatch = text.match(/You(?:'ll)? earn:?\s*(?:US)?\$?([\d,.]+)/i);
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

  // Location — check htmlBody first (has location data), then fall back to text
  let location: string | undefined;
  const locSource = htmlBody || text;
  // HTML-stripped body may have blank lines between "Location" and address
  const locMatch = locSource.match(/Location\s*[\n\s]*?(\d+\s+.+?)[\n\s]*(?:San Francisco|SF|Oakland|Berkeley|Daly City|South San Francisco)/i);
  if (locMatch) {
    location = locMatch[1].trim();
  }
  // Also try plain text format
  if (!location) {
    const locMatch2 = text.match(/Location\s*\n\s*(.+?)\n\s*(?:San Francisco|SF|Oakland|Berkeley|Daly City|South San Francisco)/i);
    if (locMatch2) {
      location = locMatch2[1].trim();
    }
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
 * Convert a local Pacific time to an ISO string.
 * Determines PDT vs PST offset by checking if the date falls in DST.
 */
function toPacificISO(year: number, month: number, day: number, hours: number, minutes: number): string {
  // Build a Date object using UTC values, then check Pacific offset
  // Use Intl to determine if this date is PDT (-7) or PST (-8)
  const roughly = new Date(Date.UTC(year, month - 1, day, hours + 8, minutes)); // assume PST first
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'short' });
  const parts = fmt.format(roughly);
  const isPDT = parts.includes('PDT');
  const offsetHours = isPDT ? 7 : 8;
  const utc = new Date(Date.UTC(year, month - 1, day, hours + offsetHours, minutes));
  return utc.toISOString();
}

function parseTripDate(text: string, label: string): string | undefined {
  // Pattern 0: Multi-line format: "Trip start\n4/18/26\n11:00 AM"
  const multiLinePattern = new RegExp(label + '\\s*\\n\\s*(\\d{1,2}/\\d{1,2}/\\d{2,4})\\s*\\n\\s*(\\d{1,2}:\\d{2}\\s*(?:AM|PM|a\\.?m\\.?|p\\.?m\\.?))', 'i');
  const multiMatch = text.match(multiLinePattern);
  if (multiMatch) {
    const dateParts = multiMatch[1].split('/');
    const month = parseInt(dateParts[0]);
    const day = parseInt(dateParts[1]);
    let year = parseInt(dateParts[2]);
    if (year < 100) year += 2000;

    const timeParts = multiMatch[2].match(/(\d{1,2}):(\d{2})\s*([APap]\.?[Mm]\.?)/);
    if (timeParts) {
      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const ampm = timeParts[3].replace(/\./g, '').toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      return toPacificISO(year, month, day, hours, minutes);
    }
  }

  // Pattern 1: "Trip start: 2026-04-28 8:00 a.m." (ISO-ish with a.m./p.m.)
  const isoPattern = new RegExp(label + ':?\\s*(\\d{4})-(\\d{2})-(\\d{2})\\s+(\\d{1,2}):(\\d{2})\\s*([ap]\\.?m\\.?)', 'i');
  const isoMatch = text.match(isoPattern);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]);
    const day = parseInt(isoMatch[3]);
    let hours = parseInt(isoMatch[4]);
    const minutes = parseInt(isoMatch[5]);
    const ampm = isoMatch[6].replace(/\./g, '').toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    return toPacificISO(year, month, day, hours, minutes);
  }

  // Pattern 2: "Trip start: 3/17/26 6:30 pm" (US format M/D/YY)
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

    return toPacificISO(year, month, day, hours, minutes);
  }

  // Pattern 3: "Trip start: 07/04/2026 07:00" (DD/MM/YYYY HH:MM - international format)
  const intlPattern = new RegExp(label + ':?\\s*(\\d{2})/(\\d{2})/(\\d{4})\\s+(\\d{1,2}):(\\d{2})', 'i');
  const intlMatch = text.match(intlPattern);
  if (intlMatch) {
    const day = parseInt(intlMatch[1]);
    const month = parseInt(intlMatch[2]);
    const year = parseInt(intlMatch[3]);
    const hours = parseInt(intlMatch[4]);
    const minutes = parseInt(intlMatch[5]);

    return toPacificISO(year, month, day, hours, minutes);
  }

  return undefined;
}

/**
 * Parse "New trip start on Wednesday, May 13, 2026, 5:30 AM" format
 * from change request emails.
 */
const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function parseNewTripDate(text: string, which: 'start' | 'end'): string | undefined {
  // Format 1: "New trip start on Wednesday, May 13, 2026, 5:30 AM"
  const pattern1 = new RegExp(
    `New trip ${which} on \\w+,\\s*(\\w+)\\s+(\\d{1,2}),\\s*(\\d{4}),\\s*(\\d{1,2}):(\\d{2})\\s*(AM|PM)`,
    'i'
  );
  const m1 = text.match(pattern1);
  if (m1) {
    const month = MONTH_MAP[m1[1].toLowerCase()];
    if (!month) return undefined;
    const day = parseInt(m1[2]);
    const year = parseInt(m1[3]);
    let hours = parseInt(m1[4]);
    const minutes = parseInt(m1[5]);
    const ampm = m1[6].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return toPacificISO(year, month, day, hours, minutes);
  }

  // Format 2: "New trip start on Tue 19 May 7:00 a.m." (abbreviated, no year — assume current year)
  const pattern2 = new RegExp(
    `New trip ${which} on \\w+\\s+(\\d{1,2})\\s+(\\w+)\\s+(\\d{1,2}):(\\d{2})\\s*([ap]\\.?m\\.?)`,
    'i'
  );
  const m2 = text.match(pattern2);
  if (m2) {
    const day = parseInt(m2[1]);
    const month = MONTH_MAP[m2[2].toLowerCase()];
    if (!month) return undefined;
    const year = new Date().getFullYear();
    let hours = parseInt(m2[3]);
    const minutes = parseInt(m2[4]);
    const ampm = m2[5].replace(/\./g, '').toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return toPacificISO(year, month, day, hours, minutes);
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
