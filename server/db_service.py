"""PostgreSQL-backed activities storage used by data_service.py."""
import json
import os
from datetime import date
from pathlib import Path
from typing import Optional

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / '.env')

_DATABASE_URL = os.getenv('DATABASE_URL')
if not _DATABASE_URL:
    raise RuntimeError(
        'DATABASE_URL is not set. Add it to .env (e.g. '
        'postgresql://user:pass@localhost:5432/kinder_activities).'
    )

# Identifiers stay camelCase, double-quoted everywhere — matches the existing
# JSON shape exposed to the frontend.
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

_QUOTED_COLUMNS = ', '.join(f'"{c}"' for c in HEADER_ROW)
_NAMED_PLACEHOLDERS = ', '.join(f'%({c})s' for c in HEADER_ROW)
# On conflict, update every column except the primary key and createdAt.
_UPSERT_SET = ', '.join(
    f'"{c}" = EXCLUDED."{c}"'
    for c in HEADER_ROW
    if c not in _NON_UPDATABLE_COLUMNS
)
_UPSERT_SQL = (
    f'INSERT INTO activities ({_QUOTED_COLUMNS}) '
    f'VALUES ({_NAMED_PLACEHOLDERS}) '
    f'ON CONFLICT ("url") DO UPDATE SET {_UPSERT_SET}'
)

_conn: Optional[psycopg.Connection] = None
_schema_ready: bool = False


def _ensure_schema(conn: psycopg.Connection) -> None:
    global _schema_ready
    if _schema_ready:
        return
    with conn.cursor() as cur:
        cur.execute('''
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
        ''')
        # Forward-compatible additive migrations (Postgres supports
        # IF NOT EXISTS on ADD COLUMN).
        cur.execute('ALTER TABLE activities ADD COLUMN IF NOT EXISTS "createdAt" TEXT NOT NULL DEFAULT \'\'')
        cur.execute('ALTER TABLE activities ADD COLUMN IF NOT EXISTS "googleMapsLink" TEXT')
        # Backfill for rows imported from a pre-createdAt snapshot.
        cur.execute('UPDATE activities SET "createdAt" = "lastUpdated" WHERE "createdAt" = \'\'')
    conn.commit()
    _schema_ready = True


def _get_conn() -> psycopg.Connection:
    global _conn
    if _conn is not None and not _conn.closed:
        return _conn
    _conn = psycopg.connect(_DATABASE_URL, row_factory=dict_row)
    _ensure_schema(_conn)
    return _conn


def clear_cache():
    """Close and clear the cached connection (tests / long-running processes)."""
    global _conn, _schema_ready
    if _conn is not None and not _conn.closed:
        _conn.close()
    _conn = None
    _schema_ready = False


def _row_to_activity(row: Optional[dict]) -> Optional[dict]:
    if row is None or not row.get('url'):
        return None

    activity = {
        'url': row['url'],
        'shortName': row['shortName'] or '',
        'alive': bool(row['alive']),
        'createdAt': row['createdAt'] or '',
        'lastUpdated': row['lastUpdated'] or '',
    }

    for field in _OPTIONAL_STRING_FIELDS:
        value = row.get(field)
        if value:
            activity[field] = value

    services = row.get('services')
    if services:
        try:
            activity['services'] = json.loads(services)
        except (json.JSONDecodeError, TypeError):
            activity['services'] = [s.strip() for s in services.split(',')]

    if row.get('userRating') is not None:
        activity['userRating'] = int(row['userRating'])
    if row.get('drivingMinutes') is not None:
        activity['drivingMinutes'] = int(row['drivingMinutes'])
    if row.get('transitMinutes') is not None:
        activity['transitMinutes'] = int(row['transitMinutes'])
    if row.get('distanceKm') is not None:
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
        'alive': False if activity.get('alive') is False else True,
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
    with conn.cursor() as cur:
        cur.execute('SELECT * FROM activities')
        rows = cur.fetchall()
    return [a for a in (_row_to_activity(r) for r in rows) if a]


def get_activity_by_url(url: str) -> Optional[dict]:
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute('SELECT * FROM activities WHERE "url" = %s', (url,))
        row = cur.fetchone()
    return _row_to_activity(row) if row else None


def add_activity(activity: dict) -> dict:
    conn = _get_conn()
    params = _activity_to_params(activity)

    # Preserve existing createdAt for known URLs (write-once invariant).
    with conn.cursor() as cur:
        cur.execute(
            'SELECT "createdAt" FROM activities WHERE "url" = %s',
            (params['url'],),
        )
        existing = cur.fetchone()
    if existing and existing.get('createdAt'):
        params['createdAt'] = existing['createdAt']

    with conn.cursor() as cur:
        cur.execute(_UPSERT_SQL, params)
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
        cell_value = bool(value)
    elif field == 'services' and isinstance(value, list):
        cell_value = json.dumps(value)
    elif isinstance(value, bool):
        cell_value = bool(value)
    else:
        cell_value = value

    # Bump lastUpdated to today on every change so the user can track
    # recently-touched activities. Skip the bump if lastUpdated itself is the
    # field being set (so the explicit caller value isn't overwritten).
    with conn.cursor() as cur:
        if field == 'lastUpdated':
            cur.execute(
                'UPDATE activities SET "lastUpdated" = %s WHERE "url" = %s',
                (cell_value, url),
            )
        else:
            today = date.today().isoformat()
            cur.execute(
                f'UPDATE activities SET "{field}" = %s, "lastUpdated" = %s WHERE "url" = %s',
                (cell_value, today, url),
            )
        rowcount = cur.rowcount
    conn.commit()
    if rowcount == 0:
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
