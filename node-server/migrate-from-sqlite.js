#!/usr/bin/env node
/**
 * One-shot migrator: copies every row from a SQLite `activities.db` into
 * the Postgres database pointed to by `DATABASE_URL`.
 *
 * Usage (run on the VPS once after Postgres is up):
 *   node node-server/migrate-from-sqlite.js
 *
 * Optional env:
 *   KINDER_SQLITE_PATH  Path to the source SQLite file. Defaults to
 *                       `data/activities.db` relative to the repo root.
 *
 * The destination Postgres connection comes from `DATABASE_URL` (same as the
 * server). Inserts use `ON CONFLICT ("url") DO NOTHING`, so re-running is
 * always safe — already-imported rows are skipped, never overwritten.
 */
import process from 'node:process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const { Pool } = pg;

const SQLITE_PATH = process.env.KINDER_SQLITE_PATH
  ? path.resolve(REPO_ROOT, process.env.KINDER_SQLITE_PATH)
  : path.join(REPO_ROOT, 'data', 'activities.db');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FAIL: DATABASE_URL is not set in .env.');
  process.exit(1);
}

if (!fs.existsSync(SQLITE_PATH)) {
  console.error(`FAIL: SQLite file not found at ${SQLITE_PATH}`);
  process.exit(1);
}

console.log(`Source : ${SQLITE_PATH}`);
console.log(`Target : ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const pool = new Pool({ connectionString: DATABASE_URL });

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS activities (
    "url"             TEXT PRIMARY KEY,
    "shortName"       TEXT NOT NULL DEFAULT '',
    "alive"           BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"       TEXT NOT NULL DEFAULT '',
    "lastUpdated"     TEXT NOT NULL DEFAULT '',
    "category"        TEXT,
    "openHours"       TEXT,
    "address"         TEXT,
    "googleMapsLink"  TEXT,
    "services"        TEXT,
    "description"     TEXT,
    "userRating"      INTEGER,
    "drivingMinutes"  INTEGER,
    "transitMinutes"  INTEGER,
    "distanceKm"      DOUBLE PRECISION,
    "userComment"     TEXT,
    "price"           TEXT
  )
`;

const COLUMNS = [
  'url', 'shortName', 'alive', 'createdAt', 'lastUpdated', 'category', 'openHours',
  'address', 'googleMapsLink', 'services', 'description', 'userRating', 'drivingMinutes',
  'transitMinutes', 'distanceKm', 'userComment', 'price',
];
const QUOTED = COLUMNS.map((c) => `"${c}"`).join(', ');
const PLACEHOLDERS = COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
const INSERT_SQL = `
  INSERT INTO activities (${QUOTED})
  VALUES (${PLACEHOLDERS})
  ON CONFLICT ("url") DO NOTHING
`;

async function main() {
  await pool.query(SCHEMA_SQL);
  // Forward-compat: if the schema was created by an older version of db.js,
  // make sure the recently-added columns exist before we copy rows into them.
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS "createdAt" TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS "googleMapsLink" TEXT`);

  // Pull all rows from SQLite. The SQLite schema may pre-date createdAt and
  // googleMapsLink, so we check the columns and synthesize sensible values.
  const sqliteCols = new Set(
    sqlite.prepare("PRAGMA table_info('activities')").all().map((c) => c.name)
  );
  const hasCreatedAt = sqliteCols.has('createdAt');
  const hasMaps = sqliteCols.has('googleMapsLink');

  const rows = sqlite.prepare('SELECT * FROM activities').all();
  console.log(`Read ${rows.length} rows from SQLite.`);

  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const lastUpdated = row.lastUpdated || '';
    const createdAt = (hasCreatedAt && row.createdAt) || lastUpdated;

    const params = [
      row.url,
      row.shortName || '',
      row.alive === 1 || row.alive === true,        // SQLite stored 0/1 as INTEGER
      createdAt,
      lastUpdated,
      row.category ?? null,
      row.openHours ?? null,
      row.address ?? null,
      hasMaps ? (row.googleMapsLink ?? null) : null,
      row.services ?? null,
      row.description ?? null,
      row.userRating ?? null,
      row.drivingMinutes ?? null,
      row.transitMinutes ?? null,
      row.distanceKm ?? null,
      row.userComment ?? null,
      row.price ?? null,
    ];

    const result = await pool.query(INSERT_SQL, params);
    if (result.rowCount === 1) inserted += 1;
    else skipped += 1;
  }

  console.log(`Done. inserted: ${inserted}, skipped: ${skipped}, total: ${rows.length}.`);
  if (skipped > 0) {
    console.log('(Skipped rows were already present in Postgres — re-running is safe.)');
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await pool.end();
  });
