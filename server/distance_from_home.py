"""
Distance calculator - calculates travel time from home to a destination address.
Uses free APIs: OSRM for driving, and geocoding via Nominatim.
"""
import asyncio
import aiohttp
from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote

# Home address
HOME_ADDRESS = "Nuss-Anger 8, 85591 Vaterstetten, Germany"

# API endpoints (free, no API key required)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "http://router.project-osrm.org/route/v1"


@dataclass
class TravelTime:
    """Travel time results"""
    driving_minutes: Optional[int] = None
    transit_minutes: Optional[int] = None
    distance_km: Optional[float] = None
    error: Optional[str] = None


async def geocode_address(session: aiohttp.ClientSession, address: str) -> Optional[tuple[float, float]]:
    """
    Convert an address to coordinates using Nominatim (OpenStreetMap).
    Returns (latitude, longitude) or None if not found.
    """
    params = {
        "q": address,
        "format": "json",
        "limit": 1,
    }
    headers = {
        "User-Agent": "KinderActivities/1.0"  # Required by Nominatim
    }
    
    try:
        async with session.get(NOMINATIM_URL, params=params, headers=headers) as response:
            if response.status != 200:
                return None
            
            data = await response.json()
            if not data:
                return None
            
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            return (lat, lon)
    except Exception as e:
        print(f"  Geocoding error: {e}")
        return None


async def get_driving_time(
    session: aiohttp.ClientSession,
    origin: tuple[float, float],
    destination: tuple[float, float]
) -> Optional[tuple[int, float]]:
    """
    Get driving time using OSRM (free, no API key).
    Returns (duration_minutes, distance_km) or None.
    """
    # OSRM uses lon,lat format
    origin_str = f"{origin[1]},{origin[0]}"
    dest_str = f"{destination[1]},{destination[0]}"
    
    url = f"{OSRM_URL}/driving/{origin_str};{dest_str}"
    params = {
        "overview": "false",
    }
    
    try:
        async with session.get(url, params=params) as response:
            if response.status != 200:
                return None
            
            data = await response.json()
            if data.get("code") != "Ok" or not data.get("routes"):
                return None
            
            route = data["routes"][0]
            duration_seconds = route["duration"]
            distance_meters = route["distance"]
            
            duration_minutes = round(duration_seconds / 60)
            distance_km = round(distance_meters / 1000, 1)
            
            return (duration_minutes, distance_km)
    except Exception as e:
        print(f"  OSRM error: {e}")
        return None


async def estimate_transit_time(driving_minutes: int) -> int:
    """
    Estimate public transit time based on driving time.
    This is a rough estimate - typically transit takes 1.5-2.5x driving time
    depending on the area and connections.
    
    For Munich area, we use a factor of ~1.8 for suburban destinations.
    """
    # Base multiplier for transit vs driving
    multiplier = 1.8
    
    # Add some fixed overhead for waiting/transfers (10-15 min typical)
    overhead_minutes = 12
    
    return round(driving_minutes * multiplier + overhead_minutes)


async def calculate_distance(destination_address: str) -> TravelTime:
    """
    Calculate travel time from home to destination.
    
    Args:
        destination_address: The destination address string
        
    Returns:
        TravelTime with driving and estimated transit times
    """
    if not destination_address or not destination_address.strip():
        return TravelTime(error="No address provided")
    
    async with aiohttp.ClientSession() as session:
        # Geocode home address
        print(f"  Geocoding home address...")
        home_coords = await geocode_address(session, HOME_ADDRESS)
        if not home_coords:
            return TravelTime(error="Could not geocode home address")
        
        # Small delay to respect Nominatim rate limits (1 req/sec)
        await asyncio.sleep(1.1)
        
        # Geocode destination
        print(f"  Geocoding destination: {destination_address[:50]}...")
        dest_coords = await geocode_address(session, destination_address)
        if not dest_coords:
            return TravelTime(error="Could not geocode destination address")
        
        # Get driving time
        print(f"  Calculating driving route...")
        driving_result = await get_driving_time(session, home_coords, dest_coords)
        if not driving_result:
            return TravelTime(error="Could not calculate driving route")
        
        driving_minutes, distance_km = driving_result
        
        # Estimate transit time
        transit_minutes = await estimate_transit_time(driving_minutes)
        
        return TravelTime(
            driving_minutes=driving_minutes,
            transit_minutes=transit_minutes,
            distance_km=distance_km,
        )


def format_travel_time(minutes: int) -> str:
    """Format minutes into a human-readable string."""
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes // 60
    mins = minutes % 60
    if mins == 0:
        return f"{hours}h"
    return f"{hours}h {mins}min"


# CLI for testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python distance_from_home.py <address>")
        print(f"\nHome address: {HOME_ADDRESS}")
        sys.exit(1)
    
    address = " ".join(sys.argv[1:])
    print(f"Calculating distance from home to: {address}")
    print(f"Home: {HOME_ADDRESS}\n")
    
    result = asyncio.run(calculate_distance(address))
    
    if result.error:
        print(f"❌ Error: {result.error}")
    else:
        print(f"📍 Distance: {result.distance_km} km")
        print(f"🚗 Driving: {format_travel_time(result.driving_minutes)}")
        print(f"🚌 Transit: ~{format_travel_time(result.transit_minutes)} (estimated)")

