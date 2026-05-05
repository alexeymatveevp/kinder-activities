import process from 'node:process';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Add it to .env (e.g. ' +
    'postgresql://user:pass@localhost:5432/kinder_activities).'
  );
}

const pool = new Pool({ connectionString: DATABASE_URL });

// Identifiers stay camelCase, double-quoted everywhere — matches the existing
// JSON shape exposed to the frontend.
const COLUMNS = [
  'url', 'shortName', 'alive', 'createdAt', 'lastUpdated', 'category', 'openHours',
  'address', 'googleMapsLink', 'services', 'description', 'userRating', 'drivingMinutes',
  'transitMinutes', 'distanceKm', 'userComment', 'price',
];

// createdAt is excluded — written once at row creation, never updated.
const UPDATABLE_COLUMNS = new Set(COLUMNS.filter(c => c !== 'url' && c !== 'createdAt'));

async function ensureSchema() {
  await pool.query(`
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
  `);

  // Forward-compatible additive migrations — kept idempotent so restarts and
  // schema-drift scenarios stay safe.
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS "createdAt" TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS "googleMapsLink" TEXT`);
  // Backfill createdAt from lastUpdated for any pre-migration rows still empty.
  await pool.query(`UPDATE activities SET "createdAt" = "lastUpdated" WHERE "createdAt" = ''`);
}

// Schema is created lazily on first query; track the in-flight promise so
// concurrent callers share the same bootstrap.
let schemaReadyPromise = null;
function schemaReady() {
  if (!schemaReadyPromise) schemaReadyPromise = ensureSchema();
  return schemaReadyPromise;
}

function rowToActivity(row) {
  if (!row || !row.url) return null;

  const activity = {
    url: row.url,
    shortName: row.shortName || '',
    alive: row.alive === true,
    createdAt: row.createdAt || '',
    lastUpdated: row.lastUpdated || '',
  };

  if (row.category) activity.category = row.category;
  if (row.openHours) activity.openHours = row.openHours;
  if (row.address) activity.address = row.address;
  if (row.googleMapsLink) activity.googleMapsLink = row.googleMapsLink;
  if (row.services) {
    try {
      activity.services = JSON.parse(row.services);
    } catch {
      activity.services = row.services.split(',').map(s => s.trim());
    }
  }
  if (row.description) activity.description = row.description;
  if (row.userRating != null) activity.userRating = row.userRating;
  if (row.drivingMinutes != null) activity.drivingMinutes = row.drivingMinutes;
  if (row.transitMinutes != null) activity.transitMinutes = row.transitMinutes;
  if (row.distanceKm != null) activity.distanceKm = row.distanceKm;
  if (row.userComment) activity.userComment = row.userComment;
  if (row.price) activity.price = row.price;

  return activity;
}

function encodeValue(field, value) {
  if (value === undefined || value === null) return null;
  if (field === 'alive') return Boolean(value);
  if (field === 'services') {
    return Array.isArray(value) ? JSON.stringify(value) : String(value);
  }
  return value;
}

export async function getAllActivities() {
  await schemaReady();
  const { rows } = await pool.query('SELECT * FROM activities');
  return rows.map(rowToActivity).filter(Boolean);
}

export async function getActivityByUrl(url) {
  await schemaReady();
  const { rows } = await pool.query('SELECT * FROM activities WHERE "url" = $1', [url]);
  return rows.length ? rowToActivity(rows[0]) : null;
}

export async function updateActivityField(url, field, value) {
  if (!UPDATABLE_COLUMNS.has(field)) {
    throw new Error(`Unknown or non-updatable field: ${field}`);
  }
  await schemaReady();
  const sql = `UPDATE activities SET "${field}" = $1 WHERE "url" = $2`;
  const result = await pool.query(sql, [encodeValue(field, value), url]);
  if (result.rowCount === 0) return null;
  return getActivityByUrl(url);
}

export async function deleteActivity(url) {
  await schemaReady();
  const result = await pool.query('DELETE FROM activities WHERE "url" = $1', [url]);
  return result.rowCount > 0;
}

const QUOTED_COLUMNS = COLUMNS.map((c) => `"${c}"`).join(', ');
const PLACEHOLDERS = COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
// On conflict, update every column except the primary key and createdAt.
const UPDATE_SET = COLUMNS
  .filter((c) => c !== 'url' && c !== 'createdAt')
  .map((c) => `"${c}" = EXCLUDED."${c}"`)
  .join(', ');

const UPSERT_SQL = `
  INSERT INTO activities (${QUOTED_COLUMNS})
  VALUES (${PLACEHOLDERS})
  ON CONFLICT ("url") DO UPDATE SET ${UPDATE_SET}
`;

export async function addActivity(activity) {
  await schemaReady();

  // ON CONFLICT preserves the existing row's createdAt by default (we don't
  // include it in UPDATE_SET), but we still want createdAt to be set sensibly
  // for *new* rows. Prefer any value already stored, then any value provided
  // on the activity, finally fall back to lastUpdated.
  const existingRes = await pool.query(
    'SELECT "createdAt" FROM activities WHERE "url" = $1',
    [activity.url]
  );
  const existingCreatedAt = existingRes.rows[0]?.createdAt || '';
  const lastUpdated = activity.lastUpdated || '';
  const createdAt = existingCreatedAt
    || activity.createdAt
    || lastUpdated;

  const params = [
    activity.url,
    activity.shortName || '',
    activity.alive === false ? false : true,
    createdAt,
    lastUpdated,
    activity.category ?? null,
    activity.openHours ?? null,
    activity.address ?? null,
    activity.googleMapsLink ?? null,
    activity.services ? JSON.stringify(activity.services) : null,
    activity.description ?? null,
    activity.userRating ?? null,
    activity.drivingMinutes ?? null,
    activity.transitMinutes ?? null,
    activity.distanceKm ?? null,
    activity.userComment ?? null,
    activity.price ?? null,
  ];
  await pool.query(UPSERT_SQL, params);
  return getActivityByUrl(activity.url);
}

export async function insertManyActivities(activities) {
  await schemaReady();
  // Sequential loop — each row is an idempotent UPSERT, so per-row failures
  // don't poison the rest. Volume is low (single-VPS, ~hundreds of rows).
  for (const a of activities) {
    await addActivity(a);
  }
}

export { pool, ensureSchema, COLUMNS };
