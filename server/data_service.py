"""
Data service for managing activities in Google Sheets.

This module provides a compatibility layer that maintains the same interface
as the original file-based data_service, but uses Google Sheets as the backend.
"""
from typing import TypedDict, Optional
from urllib.parse import urlparse

# Import Google Sheets service
from sheets_service import (
    load_all_activities,
    get_activity_by_url,
    save_or_update_activity as sheets_save_or_update,
    update_activity,
    add_activity,
    ensure_header_row,
)


class PriceInfo(TypedDict):
    service: str
    price: str


class Activity(TypedDict, total=False):
    url: str
    shortName: str
    alive: bool
    lastUpdated: str
    category: Optional[str]
    openHours: Optional[str]
    address: Optional[str]
    prices: Optional[list[PriceInfo]]
    services: Optional[list[str]]
    description: Optional[str]
    userRating: Optional[int]
    drivingMinutes: Optional[int]
    transitMinutes: Optional[int]
    distanceKm: Optional[float]
    userComment: Optional[str]


def normalize_url(url: str) -> str:
    """Normalize URL for comparison (remove trailing slashes, lowercase)"""
    try:
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        return f"{parsed.scheme}://{parsed.hostname.lower()}{path}{parsed.query}"
    except Exception:
        return url.lower().rstrip("/")


def load_activities() -> list[Activity]:
    """Load all activities from Google Sheets."""
    try:
        return load_all_activities(include_removed=False)
    except Exception as e:
        print(f"Error loading activities from Google Sheets: {e}")
        return []


def save_activities(activities: list[Activity]) -> None:
    """
    Save activities array to Google Sheets.
    
    Note: This method is less efficient than individual updates.
    Consider using save_or_update_activity for single activity operations.
    """
    # Ensure header row exists
    ensure_header_row()
    
    # For bulk operations, we'd need to clear and re-add all data
    # This is not recommended for large datasets
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
    """
    Save or update an activity in Google Sheets.
    Returns (success, activity, is_update)
    """
    try:
        # Ensure required fields
        if 'alive' not in activity:
            activity['alive'] = True
        
        return sheets_save_or_update(activity)
    except Exception as e:
        print(f"Error saving activity: {e}")
        return False, activity, False
