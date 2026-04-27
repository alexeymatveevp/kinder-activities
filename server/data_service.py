"""
Data service for managing activities.

Thin wrapper over db_service (SQLite). Kept as a compatibility layer so callers
don't need to change their import paths.
"""
from typing import TypedDict, Optional
from urllib.parse import urlparse

from db_service import (
    load_all_activities,
    get_activity_by_url,
    save_or_update_activity as sheets_save_or_update,
    update_activity,
    add_activity,
    ensure_header_row,
    format_prices_text,
)


class PriceInfo(TypedDict):
    service: str
    price: str


class Activity(TypedDict, total=False):
    url: str
    shortName: str
    alive: bool
    createdAt: str
    lastUpdated: str
    category: Optional[str]
    openHours: Optional[str]
    address: Optional[str]
    googleMapsLink: Optional[str]
    prices: Optional[list[PriceInfo]]
    services: Optional[list[str]]
    description: Optional[str]
    userRating: Optional[int]
    drivingMinutes: Optional[int]
    transitMinutes: Optional[int]
    distanceKm: Optional[float]
    userComment: Optional[str]
    price: Optional[str]


def normalize_url(url: str) -> str:
    """Normalize URL for comparison (remove trailing slashes, lowercase)"""
    try:
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        return f"{parsed.scheme}://{parsed.hostname.lower()}{path}{parsed.query}"
    except Exception:
        return url.lower().rstrip("/")


def load_activities() -> list[Activity]:
    try:
        return load_all_activities()
    except Exception as e:
        print(f"Error loading activities: {e}")
        return []


def save_activities(activities: list[Activity]) -> None:
    ensure_header_row()
    for activity in activities:
        try:
            sheets_save_or_update(activity)
        except Exception as e:
            print(f"Error saving activity {activity.get('url')}: {e}")


def is_duplicate(url: str) -> bool:
    """Check if an activity with the given URL already exists"""
    activity = get_activity_by_url(url)
    return activity is not None


def save_or_update_activity(activity: Activity) -> tuple[bool, Activity, bool]:
    """Save or update an activity. Returns (success, activity, is_update)."""
    try:
        if 'alive' not in activity:
            activity['alive'] = True
        return sheets_save_or_update(activity)
    except Exception as e:
        print(f"Error saving activity: {e}")
        return False, activity, False
