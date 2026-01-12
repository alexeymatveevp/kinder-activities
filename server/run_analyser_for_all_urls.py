#!/usr/bin/env python3
"""
Script to run the analyser for all URLs in all-urls.json that:
1. Are not yet in data.json
2. Have contentType == "website"
3. Are alive
"""

import json
import asyncio
from pathlib import Path
from datetime import date
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()

from analyser import analyse_url
from data_service import load_activities, save_activities, normalize_url

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
ALL_URLS_FILE = DATA_DIR / "all-urls.json"
DATA_FILE = DATA_DIR / "data.json"


def load_all_urls() -> list[dict]:
    """Load URLs from all-urls.json"""
    with open(ALL_URLS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_urls_to_analyse() -> list[dict]:
    """
    Find URLs that need to be analysed:
    - Present in all-urls.json
    - NOT present in data.json
    - contentType == "website"
    - alive == True
    - userRemoved != True (skip user-removed items)
    """
    all_urls = load_all_urls()
    existing_activities = load_activities()
    
    # Get normalized URLs from data.json
    existing_normalized = {normalize_url(a["url"]) for a in existing_activities}
    
    # Filter URLs to analyse
    urls_to_analyse = []
    for entry in all_urls:
        url = entry.get("url", "")
        content_type = entry.get("contentType", "unknown")
        alive = entry.get("alive", False)
        user_removed = entry.get("userRemoved", False)
        
        # Skip if user has removed this item
        if user_removed:
            continue
        
        # Skip if not a website
        if content_type != "website":
            continue
        
        # Skip if not alive
        if not alive:
            continue
        
        # Skip if already in data.json
        if normalize_url(url) in existing_normalized:
            continue
        
        urls_to_analyse.append(entry)
    
    return urls_to_analyse


def save_analysis_result(result, url_entry: dict) -> None:
    """Save the analysis result to data.json"""
    activities = load_activities()
    
    # Create new activity entry
    new_activity = {
        "url": result.url,
        "shortName": result.short_name or url_entry.get("title", ""),
        "alive": result.available,
        "lastUpdated": date.today().isoformat(),
    }
    
    # Add optional fields if available
    if result.category:
        new_activity["category"] = result.category
    if result.open_hours:
        new_activity["openHours"] = result.open_hours
    if result.address:
        new_activity["address"] = result.address
    if result.prices:
        new_activity["prices"] = result.prices
    if result.services:
        new_activity["services"] = result.services
    if result.description:
        new_activity["description"] = result.description
    if result.age_range:
        new_activity["ageRange"] = result.age_range
    # Distance from home
    if result.driving_minutes is not None:
        new_activity["drivingMinutes"] = result.driving_minutes
    if result.transit_minutes is not None:
        new_activity["transitMinutes"] = result.transit_minutes
    if result.distance_km is not None:
        new_activity["distanceKm"] = result.distance_km
    
    activities.append(new_activity)
    save_activities(activities)


def mark_as_visited(url: str) -> None:
    """Mark a URL as visited in all-urls.json"""
    all_urls = load_all_urls()
    
    for entry in all_urls:
        if entry.get("url") == url:
            entry["visited"] = True
            break
    
    with open(ALL_URLS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_urls, f, indent=2, ensure_ascii=False)


async def run_analysis_batch(urls_to_analyse: list[dict], batch_size: int = 5) -> None:
    """Run analysis for all URLs, with a pause between batches."""
    total = len(urls_to_analyse)
    success_count = 0
    error_count = 0
    
    for i, url_entry in enumerate(urls_to_analyse, 1):
        url = url_entry["url"]
        title = url_entry.get("title", "")[:50]
        
        print(f"\n[{i}/{total}] Analysing: {url}")
        if title:
            print(f"         Title: {title}...")
        
        try:
            result = await analyse_url(url)
            
            if result.available and not result.error:
                save_analysis_result(result, url_entry)
                mark_as_visited(url)
                success_count += 1
                print(f"  ✅ Saved: {result.category or 'unknown'} - {result.description[:60] if result.description else 'No description'}...")
            else:
                mark_as_visited(url)
                error_msg = result.error or "Not available"
                print(f"  ⚠️  Skipped: {error_msg}")
                
        except Exception as e:
            error_count += 1
            print(f"  ❌ Error: {e}")
        
        # Small delay between requests to be nice to servers
        if i < total:
            await asyncio.sleep(2)
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total processed: {total}")
    print(f"✅ Successfully saved: {success_count}")
    print(f"❌ Errors: {error_count}")
    print(f"⚠️  Skipped: {total - success_count - error_count}")


async def main():
    print("🔍 Finding URLs to analyse...")
    
    urls_to_analyse = get_urls_to_analyse()
    
    if not urls_to_analyse:
        print("✅ No new URLs to analyse. All websites from all-urls.json are already in data.json.")
        return
    
    print(f"\n📋 Found {len(urls_to_analyse)} URLs to analyse:")
    for entry in urls_to_analyse[:10]:
        print(f"   - {entry['url'][:60]}...")
    if len(urls_to_analyse) > 10:
        print(f"   ... and {len(urls_to_analyse) - 10} more")
    
    print("\n🚀 Starting analysis...")
    await run_analysis_batch(urls_to_analyse)
    
    print("\n✅ Done!")


if __name__ == "__main__":
    asyncio.run(main())

