import { sql } from '@vercel/postgres';
import { randomBytes } from 'crypto';
import { TuroEmail } from './turo-emails';

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
  const result = await sql`SELECT * FROM reservations WHERE updated_at <= ${now}::timestamptz OR TRUE ORDER BY id DESC LIMIT 500`;
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

/** Match vehicle from Turo email to WhatsGPS car ID */
export function matchCarId(
  vehicleModel: string,
  vehicleYear: string,
  fleetCars: Array<{ carId: string; name: string }>
): string | undefined {
  const target = `${vehicleModel} ${vehicleYear}`.toLowerCase();
  const exact = fleetCars.find(c => c.name.toLowerCase() === target);
  if (exact) return exact.carId;
  const partial = fleetCars.find(c =>
    c.name.toLowerCase().includes(vehicleModel.toLowerCase()) &&
    c.name.includes(vehicleYear)
  );
  return partial?.carId;
}

/** Upsert a reservation from a parsed Turo email */
export async function upsertFromEmail(
  email: TuroEmail,
  fleetCars?: Array<{ carId: string; name: string }>
): Promise<Reservation> {
  const now = new Date().toISOString();

  // Handle cancellation
  if (email.type === 'cancelled') {
    await sql`
      UPDATE reservations SET status = 'cancelled', updated_at = NOW()
      WHERE reservation_id = ${email.reservationId}
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
    const carId = fleetCars && email.vehicleModel
      ? matchCarId(email.vehicleModel, email.vehicleYear, fleetCars)
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
  const carId = fleetCars ? matchCarId(email.vehicleModel, email.vehicleYear, fleetCars) : undefined;
  const token = generateToken();

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
