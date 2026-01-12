import { google } from 'googleapis';

// Column mapping for Google Sheets
const COLUMNS = {
  url: 0,
  shortName: 1,
  alive: 2,
  lastUpdated: 3,
  category: 4,
  openHours: 5,
  address: 6,
  services: 7,
  description: 8,
  userRating: 9,
  drivingMinutes: 10,
  transitMinutes: 11,
  distanceKm: 12,
  userComment: 13,
  userRemoved: 14,
};

const HEADER_ROW = [
  'url', 'shortName', 'alive', 'lastUpdated', 'category', 'openHours',
  'address', 'services', 'description', 'userRating', 'drivingMinutes',
  'transitMinutes', 'distanceKm', 'userComment', 'userRemoved'
];

/**
 * Get authenticated Google Sheets client
 */
function getAuthClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  }

  // Parse private key - handle escaped newlines
  privateKey = privateKey.replace(/\\n/g, '\n');

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Get Google Sheets API instance
 */
async function getSheetsApi() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Convert a row array to an activity object
 */
function rowToActivity(row) {
  if (!row || !row[COLUMNS.url]) return null;
  
  const activity = {
    url: row[COLUMNS.url] || '',
    shortName: row[COLUMNS.shortName] || '',
    alive: row[COLUMNS.alive] === 'true' || row[COLUMNS.alive] === true,
    lastUpdated: row[COLUMNS.lastUpdated] || '',
  };

  // Optional fields
  if (row[COLUMNS.category]) activity.category = row[COLUMNS.category];
  if (row[COLUMNS.openHours]) activity.openHours = row[COLUMNS.openHours];
  if (row[COLUMNS.address]) activity.address = row[COLUMNS.address];
  if (row[COLUMNS.services]) {
    try {
      activity.services = JSON.parse(row[COLUMNS.services]);
    } catch {
      activity.services = row[COLUMNS.services].split(',').map(s => s.trim());
    }
  }
  if (row[COLUMNS.description]) activity.description = row[COLUMNS.description];
  if (row[COLUMNS.userRating]) activity.userRating = parseInt(row[COLUMNS.userRating], 10);
  if (row[COLUMNS.drivingMinutes]) activity.drivingMinutes = parseInt(row[COLUMNS.drivingMinutes], 10);
  if (row[COLUMNS.transitMinutes]) activity.transitMinutes = parseInt(row[COLUMNS.transitMinutes], 10);
  if (row[COLUMNS.distanceKm]) activity.distanceKm = parseFloat(row[COLUMNS.distanceKm]);
  if (row[COLUMNS.userComment]) activity.userComment = row[COLUMNS.userComment];
  if (row[COLUMNS.userRemoved] === 'true' || row[COLUMNS.userRemoved] === true) {
    activity.userRemoved = true;
  }

  return activity;
}

/**
 * Convert an activity object to a row array
 */
function activityToRow(activity) {
  const row = new Array(HEADER_ROW.length).fill('');
  
  row[COLUMNS.url] = activity.url || '';
  row[COLUMNS.shortName] = activity.shortName || '';
  row[COLUMNS.alive] = activity.alive ? 'true' : 'false';
  row[COLUMNS.lastUpdated] = activity.lastUpdated || '';
  row[COLUMNS.category] = activity.category || '';
  row[COLUMNS.openHours] = activity.openHours || '';
  row[COLUMNS.address] = activity.address || '';
  row[COLUMNS.services] = activity.services ? JSON.stringify(activity.services) : '';
  row[COLUMNS.description] = activity.description || '';
  row[COLUMNS.userRating] = activity.userRating != null ? String(activity.userRating) : '';
  row[COLUMNS.drivingMinutes] = activity.drivingMinutes != null ? String(activity.drivingMinutes) : '';
  row[COLUMNS.transitMinutes] = activity.transitMinutes != null ? String(activity.transitMinutes) : '';
  row[COLUMNS.distanceKm] = activity.distanceKm != null ? String(activity.distanceKm) : '';
  row[COLUMNS.userComment] = activity.userComment || '';
  row[COLUMNS.userRemoved] = activity.userRemoved ? 'true' : '';

  return row;
}

/**
 * Get all activities from Google Sheets
 */
export async function getAllActivities() {
  const sheets = await getSheetsApi();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A2:O', // Skip header row
  });

  const rows = response.data.values || [];
  return rows
    .map(rowToActivity)
    .filter(a => a && !a.userRemoved); // Filter out null and removed items
}

/**
 * Find activity row index by URL (1-indexed, including header)
 */
async function findActivityRowIndex(url) {
  const sheets = await getSheetsApi();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A:A',
  });

  const rows = response.data.values || [];
  for (let i = 1; i < rows.length; i++) { // Start at 1 to skip header
    if (rows[i][0] === url) {
      return i + 1; // 1-indexed for Sheets API
    }
  }
  return null;
}

/**
 * Update a specific field for an activity
 */
export async function updateActivityField(url, field, value) {
  const sheets = await getSheetsApi();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  const rowIndex = await findActivityRowIndex(url);
  if (!rowIndex) {
    throw new Error('Activity not found');
  }

  const columnIndex = COLUMNS[field];
  if (columnIndex === undefined) {
    throw new Error(`Unknown field: ${field}`);
  }

  // Convert column index to letter (A, B, C, ...)
  const columnLetter = String.fromCharCode(65 + columnIndex);
  const range = `Sheet1!${columnLetter}${rowIndex}`;

  // Format value for sheets
  let cellValue = value;
  if (value === null || value === undefined) {
    cellValue = '';
  } else if (typeof value === 'boolean') {
    cellValue = value ? 'true' : 'false';
  } else if (Array.isArray(value)) {
    cellValue = JSON.stringify(value);
  } else {
    cellValue = String(value);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[cellValue]],
    },
  });

  // Return the updated activity
  const allActivities = await getAllActivities();
  return allActivities.find(a => a.url === url);
}

/**
 * Mark an activity as removed
 */
export async function markActivityRemoved(url) {
  return updateActivityField(url, 'userRemoved', true);
}

/**
 * Get a single activity by URL
 */
export async function getActivityByUrl(url) {
  const activities = await getAllActivities();
  return activities.find(a => a.url === url);
}

/**
 * Add a new activity
 */
export async function addActivity(activity) {
  const sheets = await getSheetsApi();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  const row = activityToRow(activity);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:O',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  });

  return activity;
}

/**
 * Update an entire activity row
 */
export async function updateActivity(url, updates) {
  const sheets = await getSheetsApi();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  const rowIndex = await findActivityRowIndex(url);
  if (!rowIndex) {
    throw new Error('Activity not found');
  }

  // Get current activity
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Sheet1!A${rowIndex}:O${rowIndex}`,
  });

  const currentRow = response.data.values?.[0] || [];
  const currentActivity = rowToActivity(currentRow);

  // Merge updates
  const updatedActivity = { ...currentActivity, ...updates };
  const newRow = activityToRow(updatedActivity);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Sheet1!A${rowIndex}:O${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [newRow],
    },
  });

  return updatedActivity;
}

export { HEADER_ROW, COLUMNS };
