"""SQLite-backed activities storage used by data_service.py."""
import json
import os
import sqlite3
from datetime import date
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / '.env')

_env_db_path = os.getenv('KINDER_DB_PATH')
if _env_db_path:
    _DB_PATH = Path(_env_db_path)
    if not _DB_PATH.is_absolute():
        _DB_PATH = (_REPO_ROOT / _DB_PATH).resolve()
else:
    _DB_PATH = _REPO_ROOT / 'data' / 'activities.db'

HEADER_ROW = [
    'url', 'shortName', 'alive', 'createdAt', 'lastUpdated', 'category', 'openHours',
    'address', 'googleMapsLink', 'services', 'description', 'userRating', 'drivingMinutes',
    'transitMinutes', 'distanceKm', 'userComment', 'price',
]

COLUMNS = {name: i for i, name in enumerate(HEADER_ROW)}

# createdAt must only be written on creation; never updated through the
# field-update path.
_NON_UPDATABLE_COLUMNS = frozenset({'url', 'createdAt'})

_OPTIONAL_STRING_FIELDS = {
    'category', 'openHours', 'address', 'googleMapsLink', 'description', 'userComment', 'price',
}

_conn: Optional[sqlite3.Connection] = None


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn

    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode = WAL')
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('''
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
        )
    ''')

    # Migrations — idempotent; safe on every connection.
    existing_cols = {row[1] for row in conn.execute("PRAGMA table_info('activities')")}

    # createdAt: backfill from lastUpdated for pre-existing rows.
    if 'createdAt' not in existing_cols:
        conn.execute("ALTER TABLE activities ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''")
        conn.execute("UPDATE activities SET createdAt = lastUpdated WHERE createdAt = ''")

    # googleMapsLink: nullable; defaults to NULL for existing rows.
    if 'googleMapsLink' not in existing_cols:
        conn.execute("ALTER TABLE activities ADD COLUMN googleMapsLink TEXT")

    conn.commit()
    _conn = conn
    return conn


def clear_cache():
    """Close and clear the cached connection (tests / long-running processes)."""
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None


def _row_to_activity(row: sqlite3.Row) -> Optional[dict]:
    if row is None or not row['url']:
        return None

    activity = {
        'url': row['url'],
        'shortName': row['shortName'] or '',
        'alive': bool(row['alive']),
        'createdAt': row['createdAt'] or '',
        'lastUpdated': row['lastUpdated'] or '',
    }

    for field in _OPTIONAL_STRING_FIELDS:
        value = row[field]
        if value:
            activity[field] = value

    services = row['services']
    if services:
        try:
            activity['services'] = json.loads(services)
        except (json.JSONDecodeError, TypeError):
            activity['services'] = [s.strip() for s in services.split(',')]

    if row['userRating'] is not None:
        activity['userRating'] = int(row['userRating'])
    if row['drivingMinutes'] is not None:
        activity['drivingMinutes'] = int(row['drivingMinutes'])
    if row['transitMinutes'] is not None:
        activity['transitMinutes'] = int(row['transitMinutes'])
    if row['distanceKm'] is not None:
        activity['distanceKm'] = float(row['distanceKm'])

    return activity


def _activity_to_params(activity: dict) -> dict:
    services = activity.get('services')
    if isinstance(services, list):
        services_value = json.dumps(services)
    elif services:
        services_value = str(services)
    else:
        services_value = None

    def opt(key):
        v = activity.get(key)
        return v if v not in (None, '') else None

    last_updated = activity.get('lastUpdated') or date.today().isoformat()
    # createdAt is filled here only as the desired value for *new* rows.
    # add_activity() will override this with the existing row's createdAt
    # if the URL is already known, so re-imports never overwrite it.
    created_at = activity.get('createdAt') or last_updated

    return {
        'url': activity.get('url', ''),
        'shortName': activity.get('shortName', '') or '',
        'alive': 0 if activity.get('alive') is False else 1,
        'createdAt': created_at,
        'lastUpdated': last_updated,
        'category': opt('category'),
        'openHours': opt('openHours'),
        'address': opt('address'),
        'googleMapsLink': opt('googleMapsLink'),
        'services': services_value,
        'description': opt('description'),
        'userRating': activity.get('userRating'),
        'drivingMinutes': activity.get('drivingMinutes'),
        'transitMinutes': activity.get('transitMinutes'),
        'distanceKm': activity.get('distanceKm'),
        'userComment': opt('userComment'),
        'price': opt('price'),
    }


def load_all_activities() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute('SELECT * FROM activities').fetchall()
    return [a for a in (_row_to_activity(r) for r in rows) if a]


def get_activity_by_url(url: str) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute('SELECT * FROM activities WHERE url = ?', (url,)).fetchone()
    return _row_to_activity(row) if row else None


def add_activity(activity: dict) -> dict:
    conn = _get_conn()
    params = _activity_to_params(activity)

    # INSERT OR REPLACE deletes and re-inserts, so we must preserve the
    # existing createdAt when the URL is already known. createdAt is only
    # written on creation.
    existing = conn.execute(
        'SELECT createdAt FROM activities WHERE url = ?', (params['url'],)
    ).fetchone()
    if existing and existing['createdAt']:
        params['createdAt'] = existing['createdAt']

    conn.execute(
        '''INSERT OR REPLACE INTO activities (
            url, shortName, alive, createdAt, lastUpdated, category, openHours, address,
            googleMapsLink, services, description, userRating, drivingMinutes, transitMinutes,
            distanceKm, userComment, price
        ) VALUES (
            :url, :shortName, :alive, :createdAt, :lastUpdated, :category, :openHours, :address,
            :googleMapsLink, :services, :description, :userRating, :drivingMinutes, :transitMinutes,
            :distanceKm, :userComment, :price
        )''',
        params,
    )
    conn.commit()
    if 'lastUpdated' not in activity:
        activity['lastUpdated'] = params['lastUpdated']
    if 'createdAt' not in activity:
        activity['createdAt'] = params['createdAt']
    return activity


def update_activity(url: str, updates: dict) -> Optional[dict]:
    current = get_activity_by_url(url)
    if current is None:
        return None
    merged = {**current, **updates, 'url': url}
    add_activity(merged)
    return get_activity_by_url(url)


def update_activity_field(url: str, field: str, value) -> Optional[dict]:
    if field not in COLUMNS or field in _NON_UPDATABLE_COLUMNS:
        raise ValueError(f"Unknown or non-updatable field: {field}")

    conn = _get_conn()

    if value is None:
        cell_value = None
    elif field == 'alive':
        cell_value = 1 if value else 0
    elif field == 'services' and isinstance(value, list):
        cell_value = json.dumps(value)
    elif isinstance(value, bool):
        cell_value = 1 if value else 0
    else:
        cell_value = value

    cursor = conn.execute(
        f'UPDATE activities SET {field} = ? WHERE url = ?',
        (cell_value, url),
    )
    conn.commit()
    if cursor.rowcount == 0:
        return None
    return get_activity_by_url(url)


def save_or_update_activity(activity: dict) -> tuple[bool, dict, bool]:
    """
    Save or update an activity. Returns (success, activity, is_update).
    """
    url = activity.get('url')
    if not url:
        return False, activity, False

    existing = get_activity_by_url(url)
    if existing:
        updated = update_activity(url, activity)
        return updated is not None, updated or activity, True

    added = add_activity(activity)
    return True, added, False


def ensure_header_row():
    """No-op retained for compatibility. Schema is created on first connection."""
    _get_conn()


def format_prices_text(prices: list[dict]) -> str:
    """Format a list of {service, price} dicts into a single text string."""
    if not prices:
        return ''
    parts = []
    for p in prices:
        service = p.get('service', '')
        price = p.get('price', '')
        if service and price:
            parts.append(f"{service}: {price}")
        elif price:
            parts.append(price)
    return '; '.join(parts)
