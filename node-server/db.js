import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const DB_PATH = process.env.KINDER_DB_PATH
  ? path.resolve(REPO_ROOT, process.env.KINDER_DB_PATH)
  : path.join(REPO_ROOT, 'data', 'activities.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS activities (
    url             TEXT PRIMARY KEY,
    shortName       TEXT NOT NULL DEFAULT '',
    alive           INTEGER NOT NULL DEFAULT 1,
    createdAt       TEXT NOT NULL DEFAULT '',
    lastUpdated     TEXT NOT NULL DEFAULT '',
    category        TEXT,
    openHours       TEXT,
    address         TEXT,
    googleMapsLink  TEXT,
    services        TEXT,
    description     TEXT,
    userRating      INTEGER,
    drivingMinutes  INTEGER,
    transitMinutes  INTEGER,
    distanceKm      REAL,
    userComment     TEXT,
    price           TEXT
  );
`);

// Migrations — idempotent; safe to run on every server boot.
{
  const cols = db.prepare("PRAGMA table_info('activities')").all();
  const colNames = new Set(cols.map((c) => c.name));

  // createdAt: backfill from lastUpdated for pre-existing rows.
  if (!colNames.has('createdAt')) {
    db.exec("ALTER TABLE activities ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''");
    db.exec("UPDATE activities SET createdAt = lastUpdated WHERE createdAt = ''");
  }

  // googleMapsLink: nullable, no backfill — defaults to NULL for existing rows.
  if (!colNames.has('googleMapsLink')) {
    db.exec('ALTER TABLE activities ADD COLUMN googleMapsLink TEXT');
  }
}

const COLUMNS = [
  'url', 'shortName', 'alive', 'createdAt', 'lastUpdated', 'category', 'openHours',
  'address', 'googleMapsLink', 'services', 'description', 'userRating', 'drivingMinutes',
  'transitMinutes', 'distanceKm', 'userComment', 'price',
];

// createdAt is excluded — it must only be written on creation.
const UPDATABLE_COLUMNS = new Set(COLUMNS.filter(c => c !== 'url' && c !== 'createdAt'));

function rowToActivity(row) {
  if (!row || !row.url) return null;

  const activity = {
    url: row.url,
    shortName: row.shortName || '',
    alive: row.alive === 1,
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
  if (field === 'alive') return value ? 1 : 0;
  if (field === 'services') {
    return Array.isArray(value) ? JSON.stringify(value) : String(value);
  }
  return value;
}

const selectAllStmt = db.prepare('SELECT * FROM activities');
const selectByUrlStmt = db.prepare('SELECT * FROM activities WHERE url = ?');
const deleteByUrlStmt = db.prepare('DELETE FROM activities WHERE url = ?');

export function getAllActivities() {
  return selectAllStmt.all().map(rowToActivity).filter(Boolean);
}

export function getActivityByUrl(url) {
  const row = selectByUrlStmt.get(url);
  return row ? rowToActivity(row) : null;
}

const updateStmtCache = new Map();

export function updateActivityField(url, field, value) {
  if (!UPDATABLE_COLUMNS.has(field)) {
    throw new Error(`Unknown or non-updatable field: ${field}`);
  }

  let stmt = updateStmtCache.get(field);
  if (!stmt) {
    stmt = db.prepare(`UPDATE activities SET ${field} = ? WHERE url = ?`);
    updateStmtCache.set(field, stmt);
  }

  const result = stmt.run(encodeValue(field, value), url);
  if (result.changes === 0) return null;
  return getActivityByUrl(url);
}

export function deleteActivity(url) {
  const result = deleteByUrlStmt.run(url);
  return result.changes > 0;
}

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO activities (
    url, shortName, alive, createdAt, lastUpdated, category, openHours, address,
    googleMapsLink, services, description, userRating, drivingMinutes, transitMinutes,
    distanceKm, userComment, price
  ) VALUES (
    @url, @shortName, @alive, @createdAt, @lastUpdated, @category, @openHours, @address,
    @googleMapsLink, @services, @description, @userRating, @drivingMinutes, @transitMinutes,
    @distanceKm, @userComment, @price
  )
`);

const selectCreatedAtStmt = db.prepare('SELECT createdAt FROM activities WHERE url = ?');

export function addActivity(activity) {
  // INSERT OR REPLACE deletes and re-inserts, so we must preserve the existing
  // createdAt for known URLs. createdAt is only written on creation.
  const existing = selectCreatedAtStmt.get(activity.url);
  const lastUpdated = activity.lastUpdated || '';
  const createdAt = existing?.createdAt
    || activity.createdAt
    || lastUpdated;

  const params = {
    url: activity.url,
    shortName: activity.shortName || '',
    alive: activity.alive === false ? 0 : 1,
    createdAt,
    lastUpdated,
    category: activity.category ?? null,
    openHours: activity.openHours ?? null,
    address: activity.address ?? null,
    googleMapsLink: activity.googleMapsLink ?? null,
    services: activity.services ? JSON.stringify(activity.services) : null,
    description: activity.description ?? null,
    userRating: activity.userRating ?? null,
    drivingMinutes: activity.drivingMinutes ?? null,
    transitMinutes: activity.transitMinutes ?? null,
    distanceKm: activity.distanceKm ?? null,
    userComment: activity.userComment ?? null,
    price: activity.price ?? null,
  };
  insertStmt.run(params);
  return getActivityByUrl(activity.url);
}

export const insertManyActivities = db.transaction((activities) => {
  for (const a of activities) addActivity(a);
});

export { db };
