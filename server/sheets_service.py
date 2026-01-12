"""
Google Sheets service for managing activities data.
This module provides read/write access to Google Sheets as a database.
"""
import json
import os
from datetime import date
from typing import Optional
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Column mapping (0-indexed)
COLUMNS = {
    'url': 0,
    'shortName': 1,
    'alive': 2,
    'lastUpdated': 3,
    'category': 4,
    'openHours': 5,
    'address': 6,
    'services': 7,
    'description': 8,
    'userRating': 9,
    'drivingMinutes': 10,
    'transitMinutes': 11,
    'distanceKm': 12,
    'userComment': 13,
    'userRemoved': 14,
}

HEADER_ROW = [
    'url', 'shortName', 'alive', 'lastUpdated', 'category', 'openHours',
    'address', 'services', 'description', 'userRating', 'drivingMinutes',
    'transitMinutes', 'distanceKm', 'userComment', 'userRemoved'
]

# Cached worksheet connection
_worksheet: Optional[gspread.Worksheet] = None


def get_worksheet() -> gspread.Worksheet:
    """Get the Google Sheets worksheet, with caching."""
    global _worksheet
    
    if _worksheet is not None:
        return _worksheet
    
    # Build credentials from environment variables
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    
    # Get credentials from environment
    service_account_email = os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    private_key = os.getenv('GOOGLE_PRIVATE_KEY', '').replace('\\n', '\n')
    spreadsheet_id = os.getenv('GOOGLE_SHEETS_ID')
    
    if not all([service_account_email, private_key, spreadsheet_id]):
        raise ValueError(
            "Missing required environment variables: "
            "GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEETS_ID"
        )
    
    # Create credentials from service account info
    credentials_info = {
        'type': 'service_account',
        'client_email': service_account_email,
        'private_key': private_key,
        'token_uri': 'https://oauth2.googleapis.com/token',
    }
    
    credentials = Credentials.from_service_account_info(
        credentials_info,
        scopes=scopes
    )
    
    client = gspread.authorize(credentials)
    spreadsheet = client.open_by_key(spreadsheet_id)
    _worksheet = spreadsheet.sheet1
    
    return _worksheet


def clear_cache():
    """Clear the cached worksheet connection."""
    global _worksheet
    _worksheet = None


def row_to_activity(row: list) -> Optional[dict]:
    """Convert a row list to an activity dictionary."""
    if not row or not row[COLUMNS['url']]:
        return None
    
    def safe_get(idx):
        return row[idx] if idx < len(row) else ''
    
    activity = {
        'url': safe_get(COLUMNS['url']),
        'shortName': safe_get(COLUMNS['shortName']),
        'alive': safe_get(COLUMNS['alive']).lower() == 'true',
        'lastUpdated': safe_get(COLUMNS['lastUpdated']),
    }
    
    # Optional fields
    if safe_get(COLUMNS['category']):
        activity['category'] = safe_get(COLUMNS['category'])
    if safe_get(COLUMNS['openHours']):
        activity['openHours'] = safe_get(COLUMNS['openHours'])
    if safe_get(COLUMNS['address']):
        activity['address'] = safe_get(COLUMNS['address'])
    if safe_get(COLUMNS['services']):
        try:
            activity['services'] = json.loads(safe_get(COLUMNS['services']))
        except json.JSONDecodeError:
            activity['services'] = [s.strip() for s in safe_get(COLUMNS['services']).split(',')]
    if safe_get(COLUMNS['description']):
        activity['description'] = safe_get(COLUMNS['description'])
    if safe_get(COLUMNS['userRating']):
        try:
            activity['userRating'] = int(safe_get(COLUMNS['userRating']))
        except ValueError:
            pass
    if safe_get(COLUMNS['drivingMinutes']):
        try:
            activity['drivingMinutes'] = int(safe_get(COLUMNS['drivingMinutes']))
        except ValueError:
            pass
    if safe_get(COLUMNS['transitMinutes']):
        try:
            activity['transitMinutes'] = int(safe_get(COLUMNS['transitMinutes']))
        except ValueError:
            pass
    if safe_get(COLUMNS['distanceKm']):
        try:
            activity['distanceKm'] = float(safe_get(COLUMNS['distanceKm']))
        except ValueError:
            pass
    if safe_get(COLUMNS['userComment']):
        activity['userComment'] = safe_get(COLUMNS['userComment'])
    if safe_get(COLUMNS['userRemoved']).lower() == 'true':
        activity['userRemoved'] = True
    
    return activity


def activity_to_row(activity: dict) -> list:
    """Convert an activity dictionary to a row list."""
    row = [''] * len(HEADER_ROW)
    
    row[COLUMNS['url']] = activity.get('url', '')
    row[COLUMNS['shortName']] = activity.get('shortName', '')
    row[COLUMNS['alive']] = 'true' if activity.get('alive', True) else 'false'
    row[COLUMNS['lastUpdated']] = activity.get('lastUpdated', date.today().isoformat())
    row[COLUMNS['category']] = activity.get('category', '')
    row[COLUMNS['openHours']] = activity.get('openHours', '')
    row[COLUMNS['address']] = activity.get('address', '')
    row[COLUMNS['services']] = json.dumps(activity.get('services', [])) if activity.get('services') else ''
    row[COLUMNS['description']] = activity.get('description', '')
    row[COLUMNS['userRating']] = str(activity['userRating']) if activity.get('userRating') is not None else ''
    row[COLUMNS['drivingMinutes']] = str(activity['drivingMinutes']) if activity.get('drivingMinutes') is not None else ''
    row[COLUMNS['transitMinutes']] = str(activity['transitMinutes']) if activity.get('transitMinutes') is not None else ''
    row[COLUMNS['distanceKm']] = str(activity['distanceKm']) if activity.get('distanceKm') is not None else ''
    row[COLUMNS['userComment']] = activity.get('userComment', '')
    row[COLUMNS['userRemoved']] = 'true' if activity.get('userRemoved') else ''
    
    return row


def load_all_activities(include_removed: bool = False) -> list[dict]:
    """Load all activities from Google Sheets."""
    worksheet = get_worksheet()
    all_values = worksheet.get_all_values()
    
    # Skip header row
    activities = []
    for row in all_values[1:]:
        activity = row_to_activity(row)
        if activity:
            if include_removed or not activity.get('userRemoved'):
                activities.append(activity)
    
    return activities


def find_activity_row_index(url: str) -> Optional[int]:
    """Find the row index (1-based) for an activity by URL."""
    worksheet = get_worksheet()
    all_values = worksheet.get_all_values()
    
    for i, row in enumerate(all_values):
        if i == 0:  # Skip header
            continue
        if row and row[COLUMNS['url']] == url:
            return i + 1  # 1-based index for gspread
    
    return None


def get_activity_by_url(url: str) -> Optional[dict]:
    """Get a single activity by URL."""
    row_idx = find_activity_row_index(url)
    if not row_idx:
        return None
    
    worksheet = get_worksheet()
    row = worksheet.row_values(row_idx)
    return row_to_activity(row)


def add_activity(activity: dict) -> dict:
    """Add a new activity to Google Sheets."""
    worksheet = get_worksheet()
    
    # Set lastUpdated if not present
    if 'lastUpdated' not in activity:
        activity['lastUpdated'] = date.today().isoformat()
    
    row = activity_to_row(activity)
    worksheet.append_row(row, value_input_option='RAW')
    
    return activity


def update_activity(url: str, updates: dict) -> Optional[dict]:
    """Update an activity in Google Sheets."""
    row_idx = find_activity_row_index(url)
    if not row_idx:
        return None
    
    worksheet = get_worksheet()
    current_row = worksheet.row_values(row_idx)
    current_activity = row_to_activity(current_row)
    
    if not current_activity:
        return None
    
    # Merge updates
    updated_activity = {**current_activity, **updates}
    new_row = activity_to_row(updated_activity)
    
    # Update the row
    worksheet.update(f'A{row_idx}:O{row_idx}', [new_row], value_input_option='RAW')
    
    return updated_activity


def update_activity_field(url: str, field: str, value) -> Optional[dict]:
    """Update a single field for an activity."""
    row_idx = find_activity_row_index(url)
    if not row_idx:
        return None
    
    if field not in COLUMNS:
        raise ValueError(f"Unknown field: {field}")
    
    worksheet = get_worksheet()
    col_idx = COLUMNS[field] + 1  # 1-based for gspread
    
    # Format value for sheets
    if value is None:
        cell_value = ''
    elif isinstance(value, bool):
        cell_value = 'true' if value else 'false'
    elif isinstance(value, list):
        cell_value = json.dumps(value)
    else:
        cell_value = str(value)
    
    worksheet.update_cell(row_idx, col_idx, cell_value)
    
    # Return the updated activity
    return get_activity_by_url(url)


def mark_activity_removed(url: str) -> Optional[dict]:
    """Mark an activity as removed."""
    return update_activity_field(url, 'userRemoved', True)


def save_or_update_activity(activity: dict) -> tuple[bool, dict, bool]:
    """
    Save or update an activity in Google Sheets.
    Returns (success, activity, is_update)
    """
    url = activity.get('url')
    if not url:
        return False, activity, False
    
    existing = get_activity_by_url(url)
    
    if existing:
        # Update existing
        updated = update_activity(url, activity)
        return updated is not None, updated or activity, True
    else:
        # Add new
        added = add_activity(activity)
        return True, added, False


def ensure_header_row():
    """Ensure the header row exists in the spreadsheet."""
    worksheet = get_worksheet()
    first_row = worksheet.row_values(1)
    
    if not first_row or first_row != HEADER_ROW:
        worksheet.update('A1:O1', [HEADER_ROW], value_input_option='RAW')
        print("Header row created/updated in Google Sheets")
