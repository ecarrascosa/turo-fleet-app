import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envFile = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
const envVars = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)="?([^"]*)"?$/);
  if (m) envVars[m[1].trim()] = m[2].trim();
}

const client = new pg.Client({ connectionString: envVars.DATABASE_URL_UNPOOLED || envVars.DATABASE_URL });
await client.connect();

// Step 1: Create table
await client.query(`
  CREATE TABLE IF NOT EXISTS vehicle_mappings (
    id SERIAL PRIMARY KEY,
    turo_model VARCHAR(100) NOT NULL,
    turo_year VARCHAR(4) NOT NULL,
    whatsgps_car_id VARCHAR(50) NOT NULL,
    plate VARCHAR(20),
    vin VARCHAR(20),
    notes TEXT,
    UNIQUE(turo_model, turo_year, whatsgps_car_id)
  )
`);
console.log('✅ vehicle_mappings table created');

// Step 2: Seed
const mappings = [
  ['Kia Forte', '2023', '2862776', '9EKF941'],
  ['Audi A4', '2014', '1990960516796776469', '7EHU865'],
  ['BMW X5', '2013', '2848062', '9LJD332'],
  ['Hyundai Elantra', '2013', '1990960516796776462', '6WEK555'],
  ['Hyundai Elantra', '2016', '1990960516796776460', '8EVL825'],
  ['Hyundai Veloster', '2017', '1990960516796776459', '9BBD813'],
  ['Jeep Cherokee', '2016', '2848014', '7RXF934'],
  ['Jeep Wrangler Unlimited', '2016', '2862747', '8HJR881'],
  ['Kia Sportage', '2014', '1990960516796776465', '7JAF140'],
  ['Mazda CX-30', '2022', '2862706', '9DCW334'],
  ['Toyota Camry', '2013', '1990960516796776470', '7BXV391'],
  ['Toyota Corolla', '2015', '2862696', '8NNH938'],
  ['Toyota Corolla', '2019', '2862785', '8UXU000'],
  ['Toyota Corolla', '2022', '2862756', '9BPX540'],
  ['Toyota Corolla Cross', '2026', '1990960516796776461', '9XBP640'],
  ['Toyota RAV4', '2025', '1990960516796776466', '9WUA725'],
  ['Toyota Yaris', '2013', '1990960516796776467', '8VLS461'],
  ['Volkswagen Jetta', '2013', '2848037', '9FVF046'],
  ['Volkswagen Tiguan', '2019', '2862765', '8JVX476'],
  ['Chevrolet Cruze', '2012', '2862716', '8GOF095'],
  // Duplicates
  ['Toyota Corolla', '2025', '2862736', '9RPA138'],
  ['Toyota Corolla', '2025', '2848045', '9UOC437'],
  ['Volkswagen Jetta', '2016', '2862726', '7RBK253'],
  ['Volkswagen Jetta', '2016', '2848030', '7NRH469'],
];

for (const [model, year, carId, plate] of mappings) {
  await client.query(
    `INSERT INTO vehicle_mappings (turo_model, turo_year, whatsgps_car_id, plate)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (turo_model, turo_year, whatsgps_car_id) DO NOTHING`,
    [model, year, carId, plate]
  );
}
console.log(`✅ Seeded ${mappings.length} vehicle mappings`);

// Step 6: Backfill existing reservations
const { rows: nullCarRows } = await client.query(
  `SELECT id, vehicle_model, vehicle_year, reservation_id FROM reservations WHERE car_id IS NULL`
);
console.log(`\nBackfilling ${nullCarRows.length} reservations with null car_id...`);

let assigned = 0;
let skipped = [];
for (const row of nullCarRows) {
  if (!row.vehicle_model || !row.vehicle_year) {
    skipped.push(`${row.reservation_id}: no model/year`);
    continue;
  }
  const { rows: matches } = await client.query(
    `SELECT whatsgps_car_id, plate FROM vehicle_mappings WHERE turo_model = $1 AND turo_year = $2`,
    [row.vehicle_model, row.vehicle_year]
  );
  if (matches.length === 1) {
    await client.query(`UPDATE reservations SET car_id = $1, updated_at = NOW() WHERE id = $2`, [matches[0].whatsgps_car_id, row.id]);
    assigned++;
    console.log(`  ✅ ${row.reservation_id} → ${matches[0].whatsgps_car_id} (${row.vehicle_model} ${row.vehicle_year})`);
  } else if (matches.length > 1) {
    skipped.push(`${row.reservation_id}: ${row.vehicle_model} ${row.vehicle_year} has ${matches.length} options (${matches.map(m => m.plate).join(', ')})`);
  } else {
    skipped.push(`${row.reservation_id}: no mapping for ${row.vehicle_model} ${row.vehicle_year}`);
  }
}

console.log(`\n✅ Backfilled ${assigned} reservations`);
if (skipped.length) {
  console.log(`⚠️  Could not auto-assign ${skipped.length}:`);
  skipped.forEach(s => console.log(`  - ${s}`));
}

await client.end();
