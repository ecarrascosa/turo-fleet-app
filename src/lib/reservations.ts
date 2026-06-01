import { sql } from '@vercel/postgres';
import { randomBytes } from 'crypto';
import { TuroEmail } from './turo-emails';

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;

async function alertSlack(message: string) {
  if (!SLACK_WEBHOOK) return;
  try {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch (e) {
    console.error('Slack alert failed:', e);
  }
}

export interface GuestMessage {
  text: string;
  timestamp: string;
}

export interface Reservation {
  id: number;
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
  status: 'booked' | 'active' | 'completed' | 'cancelled';
  carId?: string; // WhatsGPS car ID
  renterToken: string; // unique token for shareable link
  messages: GuestMessage[];
  createdAt: string;
  updatedAt: string;
}

/** Initialize the database tables */
export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      reservation_id VARCHAR(50) UNIQUE NOT NULL,
      guest_name VARCHAR(100) NOT NULL,
      guest_phone VARCHAR(30),
      vehicle_year VARCHAR(4),
      vehicle_model VARCHAR(100),
      car_id VARCHAR(50),
      trip_start TIMESTAMPTZ NOT NULL,
      trip_end TIMESTAMPTZ NOT NULL,
      earnings DECIMAL(10,2),
      distance_included INTEGER,
      location TEXT,
      status VARCHAR(20) DEFAULT 'booked',
      renter_token VARCHAR(64) UNIQUE NOT NULL,
      messages JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_res_renter_token ON reservations(renter_token)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_res_status ON reservations(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_res_reservation_id ON reservations(reservation_id)`;
}

function generateToken(): string {
  return randomBytes(16).toString('hex'); // 32 char hex string
}

function rowToReservation(row: any): Reservation {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    guestName: row.guest_name,
    guestPhone: row.guest_phone || undefined,
    vehicleYear: row.vehicle_year,
    vehicleModel: row.vehicle_model,
    tripStart: row.trip_start,
    tripEnd: row.trip_end,
    earnings: row.earnings ? parseFloat(row.earnings) : undefined,
    distanceIncluded: row.distance_included || undefined,
    location: row.location || undefined,
    status: row.status,
    carId: row.car_id || undefined,
    renterToken: row.renter_token,
    messages: row.messages || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Auto-update statuses based on current time */
export async function refreshStatuses() {
  const now = new Date().toISOString();

  await sql`
    UPDATE reservations SET status = 'active', updated_at = NOW()
    WHERE status = 'booked' AND trip_start <= ${now} AND trip_end > ${now}
  `;

  // 30-min grace period after trip ends
  await sql`
    UPDATE reservations SET status = 'completed', updated_at = NOW()
    WHERE status = 'active' AND trip_end + INTERVAL '30 minutes' <= ${now}
  `;
}

export async function getReservations(): Promise<Reservation[]> {
  try { await refreshStatuses(); } catch (e) { /* ignore */ }
  const now = new Date().toISOString();
  const result = await sql`SELECT * FROM reservations WHERE updated_at <= ${now}::timestamptz OR TRUE ORDER BY id DESC`;
  return result.rows.map(rowToReservation);
}

export async function getActiveReservations(): Promise<Reservation[]> {
  try { await refreshStatuses(); } catch (e) { console.warn('refreshStatuses failed:', e); }
  const result = await sql`
    SELECT * FROM reservations WHERE status IN ('booked', 'active') ORDER BY id ASC
  `;
  return result.rows.map(rowToReservation);
}

export async function getReservationById(id: string): Promise<Reservation | undefined> {
  const result = await sql`SELECT * FROM reservations WHERE reservation_id = ${id}`;
  return result.rows[0] ? rowToReservation(result.rows[0]) : undefined;
}

export async function getReservationByToken(token: string): Promise<Reservation | undefined> {
  const result = await sql`SELECT * FROM reservations WHERE renter_token = ${token}`;
  return result.rows[0] ? rowToReservation(result.rows[0]) : undefined;
}

export async function getReservationsByStatus(status: string): Promise<Reservation[]> {
  const result = await sql`SELECT * FROM reservations WHERE status = ${status} ORDER BY id DESC`;
  return result.rows.map(rowToReservation);
}

/** Match vehicle from Turo email to WhatsGPS car ID via vehicle_mappings table */
export async function matchCarId(
  vehicleModel: string,
  vehicleYear: string,
  location?: string,
): Promise<string | undefined> {
  if (!vehicleModel || !vehicleYear) return undefined;
  const result = await sql`
    SELECT whatsgps_car_id, location, lat, lon FROM vehicle_mappings
    WHERE turo_model = ${vehicleModel} AND turo_year = ${vehicleYear}
  `;
  if (result.rows.length === 1) return result.rows[0].whatsgps_car_id;
  if (result.rows.length <= 1) return result.rows[0]?.whatsgps_car_id;

  // Multiple matches — try string-based location matching first
  if (location) {
    const locLower = location.toLowerCase();
    const match = result.rows.find(
      (r) => r.location && locLower.includes(r.location.toLowerCase())
    );
    if (match) return match.whatsgps_car_id;

    // String match failed — try GPS-based matching
    // Geocode the email's pickup address and find the closest car
    const coords = await geocodeAddress(location);
    if (coords) {
      const withCoords = result.rows.filter((r) => r.lat && r.lon);
      if (withCoords.length > 0) {
        let closest = withCoords[0];
        let minDist = haversineDistance(coords.lat, coords.lon, closest.lat, closest.lon);
        for (const r of withCoords.slice(1)) {
          const d = haversineDistance(coords.lat, coords.lon, r.lat, r.lon);
          if (d < minDist) { minDist = d; closest = r; }
        }
        // Only accept if within 2km — beyond that it's probably wrong
        if (minDist < 2000) return closest.whatsgps_car_id;
      }
    }
  }

  // Last resort: use live WhatsGPS GPS to find which duplicate is parked at its home location
  // A car near its mapped location is idle/available = the one being booked
  try {
    const { getFleet } = await import('./whatsgps');
    const fleet = await getFleet();
    const candidateIds = result.rows.map((r) => r.whatsgps_car_id);
    const candidates = fleet.filter((c) => candidateIds.includes(c.carId));
    const withMappingCoords = result.rows.filter((r) => r.lat && r.lon);

    if (candidates.length > 0 && withMappingCoords.length > 0) {
      // Find which cars are currently parked at their home location (within 500m)
      const idleCars: typeof result.rows = [];
      for (const mapping of withMappingCoords) {
        const car = candidates.find((c) => c.carId === mapping.whatsgps_car_id);
        if (car && haversineDistance(car.lat, car.lon, mapping.lat, mapping.lon) < 500) {
          idleCars.push(mapping);
        }
      }
      // If exactly one duplicate is at its home location, that's the one being booked
      if (idleCars.length === 1) {
        console.log(`GPS fallback matched: car ${idleCars[0].whatsgps_car_id} is at home location`);
        return idleCars[0].whatsgps_car_id;
      }

      // If we have the email location, match it to the closest idle car
      if (location && idleCars.length > 1) {
        const coords = await geocodeAddress(location);
        if (coords) {
          let closest = idleCars[0];
          let minDist = haversineDistance(coords.lat, coords.lon, closest.lat, closest.lon);
          for (const r of idleCars.slice(1)) {
            const d = haversineDistance(coords.lat, coords.lon, r.lat, r.lon);
            if (d < minDist) { minDist = d; closest = r; }
          }
          if (minDist < 2000) return closest.whatsgps_car_id;
        }
      }
    }
  } catch (e) {
    console.error('GPS fallback failed:', e);
  }

  return undefined; // truly ambiguous
}

/** Geocode an address using Nominatim (free, no API key) */
async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    // Add San Francisco context for better results
    const q = address.includes('San Francisco') ? address : `${address}, San Francisco, CA`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'TuroFleetApp/1.0' } }
    );
    const data = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch (e) {
    console.error('Geocoding failed:', e);
  }
  return null;
}

/** Haversine distance in meters between two coordinates */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Explain why car matching failed */
async function getMatchFailureReason(model: string, year: string, location?: string): Promise<string> {
  if (!model || !year) return 'Missing vehicle model or year';
  const result = await sql`
    SELECT whatsgps_car_id, plate, location FROM vehicle_mappings
    WHERE turo_model = ${model} AND turo_year = ${year}
  `;
  if (result.rows.length === 0) return `No mapping exists for ${year} ${model} — needs to be added to vehicle_mappings`;
  if (result.rows.length > 1) {
    const plates = result.rows.map(r => `${r.plate} (${r.location || 'no location'})`).join(', ');
    return `Multiple cars match: ${plates}. ${location ? `Email location "${location}" didn't match any.` : 'No location in email to disambiguate.'}`;
  }
  return 'Unknown';
}

/** Get all mapping options for a model+year (for duplicate resolution) */
export async function getDuplicateOptions(
  vehicleModel: string,
  vehicleYear: string
): Promise<Array<{ carId: string; plate: string }>> {
  const result = await sql`
    SELECT whatsgps_car_id, plate FROM vehicle_mappings
    WHERE turo_model = ${vehicleModel} AND turo_year = ${vehicleYear}
  `;
  return result.rows.map(r => ({ carId: r.whatsgps_car_id, plate: r.plate }));
}

/** Upsert a reservation from a parsed Turo email */
export async function upsertFromEmail(
  email: TuroEmail,
  fleetCars?: Array<{ carId: string; name: string }>
): Promise<Reservation> {
  const now = new Date().toISOString();

  // Handle cancellation
  if (email.type === 'cancelled') {
    const carId = email.vehicleModel
      ? await matchCarId(email.vehicleModel, email.vehicleYear, email.location)
      : undefined;
    const token = generateToken();
    await sql`
      INSERT INTO reservations (
        reservation_id, guest_name, vehicle_year, vehicle_model, car_id,
        trip_start, trip_end, earnings, distance_included,
        status, renter_token, messages
      ) VALUES (
        ${email.reservationId}, ${email.guestName}, ${email.vehicleYear}, ${email.vehicleModel},
        ${carId || null}, ${email.tripStart || null}, ${email.tripEnd || null},
        ${email.earnings ?? null}, ${email.distanceIncluded ?? null},
        'cancelled', ${token}, '[]'::jsonb
      )
      ON CONFLICT (reservation_id) DO UPDATE SET
        status = 'cancelled',
        updated_at = NOW()
    `;
    const res = await getReservationById(email.reservationId);
    return res!;
  }

  // Handle message
  if (email.type === 'message') {
    const existing = await getReservationById(email.reservationId);
    if (existing && email.guestMessage) {
      const msgs = [...existing.messages];
      if (!msgs.some(m => m.text === email.guestMessage)) {
        msgs.push({ text: email.guestMessage!, timestamp: now });
        await sql`
          UPDATE reservations SET messages = ${JSON.stringify(msgs)}::jsonb, updated_at = NOW()
          WHERE reservation_id = ${email.reservationId}
        `;
      }
    }
    return existing || ({} as Reservation);
  }

  // Handle modification — always try UPDATE first (don't rely on SELECT to find existing)
  if (email.type === 'modified') {
    const carId = email.vehicleModel
      ? await matchCarId(email.vehicleModel, email.vehicleYear, email.location)
      : undefined;

    const updateResult = await sql`
      UPDATE reservations SET
        trip_start = COALESCE(${email.tripStart || null}::timestamptz, trip_start),
        trip_end = COALESCE(${email.tripEnd || null}::timestamptz, trip_end),
        earnings = COALESCE(${email.earnings ?? null}, earnings),
        vehicle_model = COALESCE(${email.vehicleModel || null}, vehicle_model),
        vehicle_year = COALESCE(${email.vehicleYear || null}, vehicle_year),
        car_id = COALESCE(${carId || null}, car_id),
        updated_at = NOW()
      WHERE reservation_id = ${email.reservationId}
    `;
    if (updateResult.rowCount && updateResult.rowCount > 0) {
      return (await getReservationById(email.reservationId))!;
    }
    // If no existing record, fall through to create
  }

  // Upsert (new booking or update existing)
  const carId = await matchCarId(email.vehicleModel, email.vehicleYear, email.location);
  const token = generateToken();

  // Alert if car couldn't be matched (only if mappings exist — no device = no alert)
  if (!carId && email.type === 'booked') {
    const mappingCount = await sql`
      SELECT COUNT(*) as cnt FROM vehicle_mappings
      WHERE turo_model = ${email.vehicleModel} AND turo_year = ${email.vehicleYear}
    `;
    const hasMappings = parseInt(mappingCount.rows[0]?.cnt || '0') > 0;
    if (hasMappings) {
      const reason = await getMatchFailureReason(email.vehicleModel, email.vehicleYear, email.location);
      await alertSlack(
        `⚠️ Car Match Failed — Res #${email.reservationId} (${email.guestName})\n` +
        `Vehicle: ${email.vehicleYear} ${email.vehicleModel}\n` +
        `Location from email: ${email.location || 'NOT PARSED'}\n` +
        `Reason: ${reason}\n` +
        `Guest link will NOT have navigation or lock/unlock until manually assigned.`
      );
    }
  }

  const currentTime = new Date();
  const tripStart = new Date(email.tripStart);
  const tripEnd = new Date(email.tripEnd);
  let status: string = 'booked';
  if (currentTime >= tripStart && currentTime <= tripEnd) status = 'active';
  else if (currentTime > tripEnd) status = 'completed';

  const messagesJson = email.guestMessage
    ? JSON.stringify([{ text: email.guestMessage, timestamp: now }])
    : '[]';

  await sql`
    INSERT INTO reservations (
      reservation_id, guest_name, guest_phone, vehicle_year, vehicle_model,
      car_id, trip_start, trip_end, earnings, distance_included, location,
      status, renter_token, messages
    ) VALUES (
      ${email.reservationId}, ${email.guestName}, ${email.guestPhone || null},
      ${email.vehicleYear}, ${email.vehicleModel}, ${carId || null},
      ${email.tripStart}, ${email.tripEnd}, ${email.earnings ?? null},
      ${email.distanceIncluded ?? null}, ${email.location || null},
      ${status}, ${token}, ${messagesJson}::jsonb
    )
    ON CONFLICT (reservation_id) DO UPDATE SET
      guest_name = EXCLUDED.guest_name,
      guest_phone = COALESCE(EXCLUDED.guest_phone, reservations.guest_phone),
      trip_start = COALESCE(EXCLUDED.trip_start, reservations.trip_start),
      trip_end = COALESCE(EXCLUDED.trip_end, reservations.trip_end),
      earnings = COALESCE(EXCLUDED.earnings, reservations.earnings),
      distance_included = COALESCE(EXCLUDED.distance_included, reservations.distance_included),
      location = COALESCE(EXCLUDED.location, reservations.location),
      vehicle_model = COALESCE(EXCLUDED.vehicle_model, reservations.vehicle_model),
      vehicle_year = COALESCE(EXCLUDED.vehicle_year, reservations.vehicle_year),
      car_id = COALESCE(EXCLUDED.car_id, reservations.car_id),
      updated_at = NOW()
  `;

  return (await getReservationById(email.reservationId))!;
}
