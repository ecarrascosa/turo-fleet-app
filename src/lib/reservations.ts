import fs from 'fs';
import path from 'path';
import { TuroEmail } from './turo-emails';

const DATA_DIR = path.join(process.cwd(), 'data');
const RESERVATIONS_FILE = path.join(DATA_DIR, 'reservations.json');

export interface GuestMessage {
  text: string;
  timestamp: string;
}

export interface Reservation {
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
  messages: GuestMessage[];
  createdAt: string;
  updatedAt: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadReservations(): Reservation[] {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(RESERVATIONS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveReservations(reservations: Reservation[]) {
  ensureDataDir();
  fs.writeFileSync(RESERVATIONS_FILE, JSON.stringify(reservations, null, 2));
}

export function getReservations(): Reservation[] {
  const reservations = loadReservations();
  // Auto-update statuses based on current time
  const now = new Date();
  let changed = false;
  for (const r of reservations) {
    if (r.status === 'cancelled') continue;
    const start = new Date(r.tripStart);
    const end = new Date(r.tripEnd);
    if (r.status === 'booked' && now >= start && now <= end) {
      r.status = 'active';
      r.updatedAt = now.toISOString();
      changed = true;
    } else if ((r.status === 'booked' || r.status === 'active') && now > end) {
      r.status = 'completed';
      r.updatedAt = now.toISOString();
      changed = true;
    }
  }
  if (changed) saveReservations(reservations);
  return reservations;
}

export function getActiveReservations(): Reservation[] {
  return getReservations().filter(r => r.status === 'booked' || r.status === 'active');
}

export function getReservationById(id: string): Reservation | undefined {
  return getReservations().find(r => r.reservationId === id);
}

export function getReservationsByStatus(status: string): Reservation[] {
  return getReservations().filter(r => r.status === status);
}

/**
 * Match a vehicle from a Turo email to a WhatsGPS car ID.
 * Compares "Model Year" against WhatsGPS car names.
 */
export function matchCarId(vehicleModel: string, vehicleYear: string, fleetCars: Array<{ carId: string; name: string }>): string | undefined {
  const target = `${vehicleModel} ${vehicleYear}`.toLowerCase();
  // Try exact match first
  const exact = fleetCars.find(c => c.name.toLowerCase() === target);
  if (exact) return exact.carId;
  // Try contains match
  const partial = fleetCars.find(c =>
    c.name.toLowerCase().includes(vehicleModel.toLowerCase()) &&
    c.name.includes(vehicleYear)
  );
  return partial?.carId;
}

/**
 * Upsert a reservation from parsed Turo email data.
 */
export function upsertFromEmail(email: TuroEmail, fleetCars?: Array<{ carId: string; name: string }>): Reservation {
  const reservations = loadReservations();
  const now = new Date().toISOString();
  const existing = reservations.find(r => r.reservationId === email.reservationId);

  if (email.type === 'cancelled' && existing) {
    existing.status = 'cancelled';
    existing.updatedAt = now;
    saveReservations(reservations);
    return existing;
  }

  if (email.type === 'message' && existing) {
    if (email.guestMessage) {
      existing.messages.push({ text: email.guestMessage, timestamp: now });
    }
    existing.updatedAt = now;
    saveReservations(reservations);
    return existing;
  }

  if (email.type === 'modified' && existing) {
    if (email.tripStart) existing.tripStart = email.tripStart;
    if (email.tripEnd) existing.tripEnd = email.tripEnd;
    if (email.earnings !== undefined) existing.earnings = email.earnings;
    existing.updatedAt = now;
    // Re-match car if fleet data provided
    if (fleetCars) {
      existing.carId = matchCarId(existing.vehicleModel, existing.vehicleYear, fleetCars) || existing.carId;
    }
    saveReservations(reservations);
    return existing;
  }

  if (existing) {
    // Update existing booked reservation
    if (email.tripStart) existing.tripStart = email.tripStart;
    if (email.tripEnd) existing.tripEnd = email.tripEnd;
    if (email.earnings !== undefined) existing.earnings = email.earnings;
    if (email.guestPhone) existing.guestPhone = email.guestPhone;
    if (email.location) existing.location = email.location;
    if (email.distanceIncluded !== undefined) existing.distanceIncluded = email.distanceIncluded;
    existing.updatedAt = now;
    if (fleetCars) {
      existing.carId = matchCarId(existing.vehicleModel, existing.vehicleYear, fleetCars) || existing.carId;
    }
    saveReservations(reservations);
    return existing;
  }

  // New reservation
  const carId = fleetCars ? matchCarId(email.vehicleModel, email.vehicleYear, fleetCars) : undefined;
  const currentTime = new Date();
  const tripStart = new Date(email.tripStart);
  const tripEnd = new Date(email.tripEnd);

  let status: Reservation['status'] = 'booked';
  if (currentTime >= tripStart && currentTime <= tripEnd) status = 'active';
  else if (currentTime > tripEnd) status = 'completed';

  const reservation: Reservation = {
    reservationId: email.reservationId,
    guestName: email.guestName,
    guestPhone: email.guestPhone,
    vehicleYear: email.vehicleYear,
    vehicleModel: email.vehicleModel,
    tripStart: email.tripStart,
    tripEnd: email.tripEnd,
    earnings: email.earnings,
    distanceIncluded: email.distanceIncluded,
    location: email.location,
    status,
    carId,
    messages: email.guestMessage ? [{ text: email.guestMessage, timestamp: now }] : [],
    createdAt: now,
    updatedAt: now,
  };

  reservations.push(reservation);
  saveReservations(reservations);
  return reservation;
}
