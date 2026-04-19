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
    lastUpdated     TEXT NOT NULL DEFAULT '',
    category        TEXT,
    openHours       TEXT,
    address         TEXT,
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

const COLUMNS = [
  'url', 'shortName', 'alive', 'lastUpdated', 'category', 'openHours',
  'address', 'services', 'description', 'userRating', 'drivingMinutes',
  'transitMinutes', 'distanceKm', 'userComment', 'price',
];

const UPDATABLE_COLUMNS = new Set(COLUMNS.filter(c => c !== 'url'));

function rowToActivity(row) {
  if (!row || !row.url) return null;

  const activity = {
    url: row.url,
    shortName: row.shortName || '',
    alive: row.alive === 1,
    lastUpdated: row.lastUpdated || '',
  };

  if (row.category) activity.category = row.category;
  if (row.openHours) activity.openHours = row.openHours;
  if (row.address) activity.address = row.address;
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
    url, shortName, alive, lastUpdated, category, openHours, address,
    services, description, userRating, drivingMinutes, transitMinutes,
    distanceKm, userComment, price
  ) VALUES (
    @url, @shortName, @alive, @lastUpdated, @category, @openHours, @address,
    @services, @description, @userRating, @drivingMinutes, @transitMinutes,
    @distanceKm, @userComment, @price
  )
`);

export function addActivity(activity) {
  const params = {
    url: activity.url,
    shortName: activity.shortName || '',
    alive: activity.alive === false ? 0 : 1,
    lastUpdated: activity.lastUpdated || '',
    category: activity.category ?? null,
    openHours: activity.openHours ?? null,
    address: activity.address ?? null,
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
