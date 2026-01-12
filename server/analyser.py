"""
URL Analyser - orchestrates Scrapy crawler and LLM analysis.
"""
import asyncio
import subprocess
import sys
import json
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

from llm_service import analyse_content
from data_service import PriceInfo
from distance_from_home import calculate_distance, TravelTime


@dataclass
class CrawlResult:
    url: str
    available: bool
    status_code: Optional[int] = None
    error: Optional[str] = None
    # Analysis results
    category: Optional[str] = None
    open_hours: Optional[str] = None
    address: Optional[str] = None
    prices: list[PriceInfo] = field(default_factory=list)
    services: list[str] = field(default_factory=list)
    description: Optional[str] = None
    short_name: Optional[str] = None
    age_range: Optional[str] = None
    # Distance from home
    driving_minutes: Optional[int] = None
    transit_minutes: Optional[int] = None
    distance_km: Optional[float] = None


# Path to crawler script
CRAWLER_SCRIPT = Path(__file__).parent / "crawler.py"


async def run_scrapy_crawler(url: str) -> dict:
    """
    Run the Scrapy crawler as a subprocess.
    Returns the crawl result as a dict.
    """
    # Get the Python executable from the current environment
    python_executable = sys.executable
    
    # Run crawler as subprocess
    process = await asyncio.create_subprocess_exec(
        python_executable,
        str(CRAWLER_SCRIPT),
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    
    stdout, stderr = await process.communicate()
    
    if process.returncode != 0:
        error_msg = stderr.decode() if stderr else f"Crawler exited with code {process.returncode}"
        return {
            "url": url,
            "available": False,
            "error": error_msg,
            "pages": [],
        }
    
    try:
        return json.loads(stdout.decode())
    except json.JSONDecodeError as e:
        return {
            "url": url,
            "available": False,
            "error": f"Failed to parse crawler output: {e}",
            "pages": [],
        }


def combine_page_content(pages: list[dict]) -> str:
    """Combine content from multiple pages into a single string."""
    content_parts = []
    
    for page in pages:
        url = page.get("url", "Unknown")
        content = page.get("content", "")
        is_main = page.get("is_main", False)
        
        label = "Main Page" if is_main else url
        content_parts.append(f"=== {label} ({url}) ===\n{content}")
    
    combined = "\n\n".join(content_parts)
    
    # No limit here - LLM service will truncate if needed for API limits
    return combined


async def analyse_url(url: str) -> CrawlResult:
    """
    Main function to analyse a URL.
    Uses Scrapy crawler (subprocess) and LLM to extract structured information.
    """
    print(f"Analysing URL: {url}")
    
    # Run Scrapy crawler
    print("  Running Scrapy crawler...")
    crawl_data = await run_scrapy_crawler(url)
    
    # Check if crawl was successful
    if not crawl_data.get("available", False):
        return CrawlResult(
            url=url,
            available=False,
            status_code=crawl_data.get("status_code"),
            error=crawl_data.get("error", "Crawl failed"),
        )
    
    pages = crawl_data.get("pages", [])
    
    if not pages:
        # SPA or JavaScript-rendered site - can't extract content but still add the item
        print("  No content extracted (likely a JavaScript/SPA site)")
        return CrawlResult(
            url=url,
            available=True,
            status_code=crawl_data.get("status_code"),
            description="Website uses JavaScript rendering - automatic content extraction was not possible. Please visit the website directly for details.",
        )
    
    # Combine content from all pages
    combined_content = combine_page_content(pages)
    print(f"  Crawled {len(pages)} page(s), {len(combined_content)} chars of content")
    
    try:
        # Analyse with LLM
        print("  Analysing with LLM...")
        analysis = analyse_content(url, combined_content)
        
        # Calculate distance from home if address is available
        driving_minutes = None
        transit_minutes = None
        distance_km = None
        
        if analysis.address:
            print("  Calculating distance from home...")
            travel_time = await calculate_distance(analysis.address)
            if not travel_time.error:
                driving_minutes = travel_time.driving_minutes
                transit_minutes = travel_time.transit_minutes
                distance_km = travel_time.distance_km
                print(f"  Distance: {distance_km}km, driving: {driving_minutes}min, transit: {transit_minutes}min")
            else:
                print(f"  Distance calculation skipped: {travel_time.error}")
        
        return CrawlResult(
            url=url,
            available=True,
            status_code=crawl_data.get("status_code"),
            category=analysis.category,
            open_hours=analysis.open_hours,
            address=analysis.address,
            prices=analysis.prices,
            services=analysis.services,
            description=analysis.description,
            short_name=analysis.short_name,
            age_range=analysis.age_range,
            driving_minutes=driving_minutes,
            transit_minutes=transit_minutes,
            distance_km=distance_km,
        )
    except Exception as e:
        print(f"  LLM analysis error: {e}")
        return CrawlResult(
            url=url,
            available=True,
            status_code=crawl_data.get("status_code"),
            error=f"Analysis failed: {str(e)}",
        )


async def crawl_only(url: str) -> None:
    """Run only the Scrapy crawler and print raw output for debugging."""
    print(f"🕷️  Crawling: {url}\n")
    print("=" * 60)
    
    crawl_data = await run_scrapy_crawler(url)
    
    print(f"\n📊 Crawl Status:")
    print(f"   Available: {crawl_data.get('available')}")
    print(f"   Status Code: {crawl_data.get('status_code')}")
    
    if crawl_data.get("error"):
        print(f"   ❌ Error: {crawl_data.get('error')}")
    
    pages = crawl_data.get("pages", [])
    print(f"   Pages crawled: {len(pages)}")
    
    print("\n" + "=" * 60)
    print("📄 CRAWLED CONTENT:")
    print("=" * 60)
    
    for i, page in enumerate(pages, 1):
        page_url = page.get("url", "Unknown")
        content = page.get("content", "")
        is_main = page.get("is_main", False)
        
        print(f"\n{'🏠 MAIN PAGE' if is_main else f'📎 PAGE {i}'}: {page_url}")
        print("-" * 60)
        print(content)  # Full content, no truncation
        print(f"\n[Content length: {len(content)} chars]")
    
    print("\n" + "=" * 60)


# CLI entry point
if __name__ == "__main__":
    import argparse
    from dotenv import load_dotenv
    
    load_dotenv()
    
    parser = argparse.ArgumentParser(description="Analyse a URL for kids' activities")
    parser.add_argument("url", help="URL to analyse")
    parser.add_argument(
        "--crawl-only", "-c",
        action="store_true",
        help="Only run the Scrapy crawler (no LLM analysis) - for debugging"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show verbose output"
    )
    
    args = parser.parse_args()
    
    if args.crawl_only:
        # Debug mode: just show crawler output
        asyncio.run(crawl_only(args.url))
    else:
        # Full analysis
        result = asyncio.run(analyse_url(args.url))
        
        print("\n" + "=" * 60)
        print("📋 ANALYSIS RESULT:")
        print("=" * 60)
        print(f"  URL: {result.url}")
        print(f"  Available: {result.available}")
        print(f"  Status: {result.status_code}")
        
        if result.error:
            print(f"  ❌ Error: {result.error}")
        if result.short_name:
            print(f"  📛 Short Name: {result.short_name}")
        if result.category:
            print(f"  🏷️  Category: {result.category}")
        if result.description:
            print(f"  📝 Description: {result.description}")
        if result.address:
            print(f"  📍 Address: {result.address}")
        if result.open_hours:
            print(f"  🕐 Hours: {result.open_hours}")
        if result.prices:
            print(f"  💰 Prices:")
            for p in result.prices:
                print(f"       - {p.get('service', 'N/A')}: {p.get('price', 'N/A')}")
        if result.services:
            print(f"  🎯 Services:")
            for s in result.services:
                print(f"       - {s}")
        if result.distance_km:
            print(f"  📏 Distance: {result.distance_km} km")
        if result.driving_minutes:
            print(f"  🚗 Driving: {result.driving_minutes} min")
        if result.transit_minutes:
            print(f"  🚌 Transit: ~{result.transit_minutes} min (estimated)")
