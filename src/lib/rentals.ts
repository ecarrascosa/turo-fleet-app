import { readFileSync } from 'fs';
import { join } from 'path';

export interface Rental {
  resId: string;
  status: string;
  vehicle: string;
  plate: string;
  guest: string;
}

interface TuroData {
  scrapedAt: string;
  activeRentals: Rental[];
  activePlates: string[];
}

function loadTuroData(): TuroData {
  const jsonPath = join(process.cwd(), 'turo-rentals.json');
  try {
    return JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch {
    return { scrapedAt: '', activeRentals: [], activePlates: [] };
  }
}

export function getActiveRentals(): Rental[] {
  return loadTuroData().activeRentals;
}

export function isCarRented(plate: string): boolean {
  return loadTuroData().activePlates.includes(plate);
}

export function getScrapedAt(): string {
  return loadTuroData().scrapedAt;
}
