#!/usr/bin/env python3
"""
Process a single URL through the full pipeline (same as the Telegram bot):
1. Check if URL exists in all-urls.json
2. Add URL to all-urls.json
3. Check if URL is alive
4. Run analyser to extract info
5. Save to Google Sheets

Usage:
    python process-one-item.py <URL>
"""

import sys
import json
import asyncio
import aiohttp
from pathlib import Path
from datetime import date

from dotenv import load_dotenv

load_dotenv()

from analyser import analyse_url
from data_service import normalize_url, save_or_update_activity
from db_service import format_prices_text

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
ALL_URLS_FILE = DATA_DIR / "all-urls.json"

# Request settings for alive check
TIMEOUT = 10
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


# ============================================================
# all-urls.json management
# ============================================================

def load_all_urls() -> list[dict]:
    try:
        with open(ALL_URLS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def save_all_urls(urls: list[dict]) -> None:
    with open(ALL_URLS_FILE, "w", encoding="utf-8") as f:
        json.dump(urls, f, indent=2, ensure_ascii=False)


def url_exists_in_all_urls(url: str) -> bool:
    all_urls = load_all_urls()
    normalized = normalize_url(url)
    for entry in all_urls:
        if normalize_url(entry.get("url", "")) == normalized:
            return True
    return False


def add_url_to_all_urls(url: str) -> None:
    all_urls = load_all_urls()
    new_entry = {
        "url": url,
        "source": "cli",
        "addedAt": date.today().isoformat(),
    }
    all_urls.append(new_entry)
    save_all_urls(all_urls)


def update_url_in_all_urls(url: str, alive: bool, content_type: str) -> None:
    all_urls = load_all_urls()
    normalized = normalize_url(url)
    for entry in all_urls:
        if normalize_url(entry.get("url", "")) == normalized:
            entry["alive"] = alive
            entry["contentType"] = content_type
            break
    save_all_urls(all_urls)


# ============================================================
# Alive check
# ============================================================

def get_content_type_label(content_type: str | None) -> str:
    if not content_type:
        return "unknown"
    content_type = content_type.lower().split(";")[0].strip()
    mappings = {
        "text/html": "website",
        "application/pdf": "pdf",
        "application/json": "json",
        "text/plain": "text",
        "image/": "image",
        "video/": "video",
        "audio/": "audio",
    }
    for pattern, label in mappings.items():
        if pattern in content_type:
            return label
    return "other"


async def check_url_alive(url: str) -> tuple[bool, str]:
    headers = {"User-Agent": USER_AGENT}
    timeout = aiohttp.ClientTimeout(total=TIMEOUT)
    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                async with session.head(url, timeout=timeout, allow_redirects=True, ssl=False) as response:
                    is_alive = response.status < 400
                    content_type = get_content_type_label(response.headers.get("Content-Type"))
                    return (is_alive, content_type)
            except aiohttp.ClientError:
                async with session.get(url, timeout=timeout, allow_redirects=True, ssl=False) as response:
                    is_alive = response.status < 400
                    content_type = get_content_type_label(response.headers.get("Content-Type"))
                    return (is_alive, content_type)
    except Exception:
        return (False, "unknown")


# ============================================================
# Save to Google Sheets
# ============================================================

def build_activity_dict(result) -> dict:
    activity = {
        "url": result.url,
        "shortName": result.short_name or result.url.split("/")[2].replace("www.", ""),
        "alive": result.available,
        "lastUpdated": date.today().isoformat(),
    }
    if result.category:
        activity["category"] = result.category
    if result.open_hours:
        activity["openHours"] = result.open_hours
    if result.address:
        activity["address"] = result.address
    if result.prices:
        activity["price"] = format_prices_text(result.prices)
    if result.services:
        activity["services"] = result.services
    if result.description:
        activity["description"] = result.description
    if result.age_range:
        activity["ageRange"] = result.age_range
    if result.driving_minutes is not None:
        activity["drivingMinutes"] = result.driving_minutes
    if result.transit_minutes is not None:
        activity["transitMinutes"] = result.transit_minutes
    if result.distance_km is not None:
        activity["distanceKm"] = result.distance_km
    return activity


# ============================================================
# Pipeline
# ============================================================

async def process_url(url: str) -> None:
    # Step 1: Check if URL exists in all-urls.json
    if url_exists_in_all_urls(url):
        print(f"ℹ️  URL already in database: {url}")
        print("    Re-analyzing and updating information.")
    else:
        # Step 2: Add to all-urls.json
        add_url_to_all_urls(url)
        print(f"📥 Added to URL database: {url}")

    # Step 3: Check if alive
    print(f"🔍 Checking if website is alive...")

    is_alive, content_type = await check_url_alive(url)
    update_url_in_all_urls(url, is_alive, content_type)

    if not is_alive:
        print(f"❌ Website is not accessible: {url}")
        print("   The URL has been saved but cannot be analyzed right now.")
        return

    if content_type != "website":
        print(f"⚠️  URL is not a website (type: {content_type}): {url}")
        print("   Only HTML websites can be analyzed.")
        return

    print(f"✅ Website is alive (type: {content_type})")

    # Step 4: Run analyser
    print(f"🤖 Analyzing website content...")

    try:
        analysis = await analyse_url(url)

        if not analysis.available or analysis.error:
            print(f"❌ Analysis failed: {url}")
            print(f"   Error: {analysis.error or 'Unknown error'}")
            return

        # Step 5: Save to Google Sheets
        activity = build_activity_dict(analysis)
        success, _, is_update = save_or_update_activity(activity)

        if success:
            action = "Updated" if is_update else "Saved"
            print(f"\n✅ {action} to Google Sheets!")
        else:
            print(f"\n❌ Failed to save to Google Sheets")
            return

        # Print result summary
        print(f"\n{'=' * 50}")
        print(f"📛 Name:        {analysis.short_name or 'N/A'}")
        print(f"🔗 URL:         {analysis.url}")
        if analysis.description:
            print(f"📝 Description: {analysis.description}")
        if analysis.category:
            print(f"🏷️  Category:    {analysis.category}")
        if analysis.address:
            print(f"📍 Address:     {analysis.address}")
        if analysis.open_hours:
            print(f"🕐 Hours:       {analysis.open_hours}")
        if analysis.driving_minutes or analysis.transit_minutes:
            print(f"🚗 Travel:      {analysis.driving_minutes or '?'} min driving, {analysis.transit_minutes or '?'} min transit ({analysis.distance_km or '?'} km)")
        if analysis.services:
            print(f"🎯 Services:    {', '.join(analysis.services[:5])}")
        if analysis.prices:
            for p in analysis.prices[:5]:
                print(f"💰 Price:       {p['service']}: {p['price']}")
        print(f"{'=' * 50}")

    except Exception as e:
        print(f"❌ Failed to analyze: {url}")
        print(f"   Error: {e}")


async def main():
    if len(sys.argv) < 2:
        print("Usage: python process-one-item.py <URL>")
        print("Example: python process-one-item.py https://www.kindermuseum-muenchen.de")
        sys.exit(1)

    url = sys.argv[1]

    if not url.startswith("http://") and not url.startswith("https://"):
        print(f"❌ Invalid URL: {url}")
        print("   URL must start with http:// or https://")
        sys.exit(1)

    print(f"🚀 Processing: {url}\n")
    await process_url(url)
    print(f"\n✅ Done!")


if __name__ == "__main__":
    asyncio.run(main())
