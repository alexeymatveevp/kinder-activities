#!/usr/bin/env python3
"""
Script to check if URLs in all-urls.json are alive or not.
Updates the 'alive' field and detects content type for each URL.
"""

import json
import asyncio
import aiohttp
from pathlib import Path
from datetime import datetime

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
ALL_URLS_FILE = DATA_DIR / "all-urls.json"

# Request settings
TIMEOUT = 10  # seconds
MAX_CONCURRENT = 10  # max concurrent requests
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

# Content type mapping
CONTENT_TYPES = {
    "text/html": "website",
    "application/pdf": "pdf",
    "application/json": "json",
    "text/plain": "text",
    "image/": "image",
    "video/": "video",
    "audio/": "audio",
    "application/xml": "xml",
    "text/xml": "xml",
}


def get_content_type_label(content_type: str | None) -> str:
    """Map Content-Type header to a simple label."""
    if not content_type:
        return "unknown"
    
    content_type = content_type.lower().split(";")[0].strip()
    
    for pattern, label in CONTENT_TYPES.items():
        if pattern in content_type:
            return label
    
    return "other"


def load_urls() -> list[dict]:
    """Load URLs from all-urls.json"""
    with open(ALL_URLS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_urls(urls: list[dict]) -> None:
    """Save URLs back to all-urls.json"""
    with open(ALL_URLS_FILE, "w", encoding="utf-8") as f:
        json.dump(urls, f, indent=2, ensure_ascii=False)


async def check_url(session: aiohttp.ClientSession, url: str) -> tuple[str, bool, int | None, str | None]:
    """
    Check if a URL is alive and get its content type.
    Returns: (url, is_alive, status_code, content_type)
    """
    try:
        async with session.head(
            url,
            timeout=aiohttp.ClientTimeout(total=TIMEOUT),
            allow_redirects=True,
            ssl=False
        ) as response:
            # Consider 2xx and 3xx as alive
            is_alive = response.status < 400
            content_type = response.headers.get("Content-Type")
            return (url, is_alive, response.status, content_type)
    except aiohttp.ClientError:
        # Try GET if HEAD fails (some servers don't support HEAD)
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=TIMEOUT),
                allow_redirects=True,
                ssl=False
            ) as response:
                is_alive = response.status < 400
                content_type = response.headers.get("Content-Type")
                return (url, is_alive, response.status, content_type)
        except Exception:
            return (url, False, None, None)
    except asyncio.TimeoutError:
        return (url, False, None, None)
    except Exception:
        return (url, False, None, None)


async def check_all_urls(urls: list[dict]) -> list[dict]:
    """Check all URLs concurrently with rate limiting."""
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    
    async def check_with_semaphore(session: aiohttp.ClientSession, url_entry: dict) -> dict:
        async with semaphore:
            url = url_entry["url"]
            print(f"Checking: {url[:60]}...")
            url, is_alive, status, content_type = await check_url(session, url)
            
            # Update the entry
            url_entry["alive"] = is_alive
            url_entry["contentType"] = get_content_type_label(content_type)
            
            status_str = f"({status})" if status else "(timeout/error)"
            status_icon = "✅" if is_alive else "❌"
            type_label = url_entry["contentType"]
            print(f"  {status_icon} {status_str} [{type_label}]")
            
            return url_entry
    
    headers = {"User-Agent": USER_AGENT}
    connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT, ssl=False)
    
    async with aiohttp.ClientSession(headers=headers, connector=connector) as session:
        tasks = [check_with_semaphore(session, entry) for entry in urls]
        results = await asyncio.gather(*tasks)
    
    return results


def print_summary(urls: list[dict]) -> None:
    """Print summary statistics."""
    total = len(urls)
    alive = sum(1 for u in urls if u.get("alive") is True)
    dead = sum(1 for u in urls if u.get("alive") is False)
    unknown = sum(1 for u in urls if u.get("alive") is None)
    
    # Count by content type
    type_counts = {}
    for u in urls:
        ct = u.get("contentType", "unknown")
        type_counts[ct] = type_counts.get(ct, 0) + 1
    
    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    print(f"Total URLs:   {total}")
    print(f"✅ Alive:     {alive}")
    print(f"❌ Dead:      {dead}")
    if unknown:
        print(f"❓ Unknown:   {unknown}")
    print("-" * 50)
    print("Content Types:")
    for ct, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {ct}: {count}")
    print("=" * 50)


async def main():
    print(f"Loading URLs from {ALL_URLS_FILE}...")
    urls = load_urls()
    print(f"Found {len(urls)} URLs to check\n")
    
    start_time = datetime.now()
    
    # Check all URLs
    updated_urls = await check_all_urls(urls)
    
    # Save results
    save_urls(updated_urls)
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    print_summary(updated_urls)
    print(f"\nCompleted in {elapsed:.1f} seconds")
    print(f"Results saved to {ALL_URLS_FILE}")


if __name__ == "__main__":
    asyncio.run(main())

