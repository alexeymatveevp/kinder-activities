#!/usr/bin/env python3
"""
Script to calculate distance from home for all items in data.json that have an address.
Updates data.json with drivingMinutes, transitMinutes, and distanceKm fields.
"""

import json
import asyncio
from pathlib import Path
from datetime import datetime

from distance_from_home import calculate_distance

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_FILE = SCRIPT_DIR.parent / "data" / "data.json"


def load_data() -> list[dict]:
    """Load activities from data.json"""
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data: list[dict]) -> None:
    """Save activities to data.json"""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


async def run_distance_calculations():
    """Calculate distances for all items with addresses."""
    print("🏠 Distance Calculator for All Items")
    print("=" * 60)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    data = load_data()
    
    # Filter items that have an address but no distance data
    items_to_process = []
    items_with_address = []
    
    for i, item in enumerate(data):
        if item.get("address"):
            items_with_address.append((i, item))
            # Only process if missing distance data
            if item.get("drivingMinutes") is None:
                items_to_process.append((i, item))
    
    print(f"\n📊 Statistics:")
    print(f"   Total items: {len(data)}")
    print(f"   Items with address: {len(items_with_address)}")
    print(f"   Items needing distance calculation: {len(items_to_process)}")
    
    if not items_to_process:
        print("\n✅ All items with addresses already have distance data!")
        return
    
    print(f"\n🚀 Processing {len(items_to_process)} items...")
    print("-" * 60)
    
    success_count = 0
    error_count = 0
    
    for idx, (data_index, item) in enumerate(items_to_process, 1):
        url = item.get("url", "Unknown")
        address = item.get("address", "")
        short_name = item.get("shortName", "")[:40]
        
        print(f"\n[{idx}/{len(items_to_process)}] {short_name}...")
        print(f"   Address: {address[:60]}...")
        
        try:
            result = await calculate_distance(address)
            
            if result.error:
                print(f"   ⚠️  Skipped: {result.error}")
                error_count += 1
            else:
                # Update the item in data
                data[data_index]["drivingMinutes"] = result.driving_minutes
                data[data_index]["transitMinutes"] = result.transit_minutes
                data[data_index]["distanceKm"] = result.distance_km
                
                print(f"   ✅ Distance: {result.distance_km}km, 🚗 {result.driving_minutes}min, 🚌 ~{result.transit_minutes}min")
                success_count += 1
                
                # Save after each successful calculation (in case of interruption)
                save_data(data)
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
            error_count += 1
        
        # Delay between requests to respect API rate limits
        if idx < len(items_to_process):
            await asyncio.sleep(1.5)
    
    # Final summary
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    print(f"   ✅ Successfully calculated: {success_count}")
    print(f"   ⚠️  Errors/Skipped: {error_count}")
    print(f"   Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


async def run_force_all():
    """Recalculate distances for ALL items with addresses (even if already have data)."""
    print("🏠 Distance Calculator - FORCE RECALCULATE ALL")
    print("=" * 60)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    data = load_data()
    
    # Get all items with addresses
    items_to_process = [(i, item) for i, item in enumerate(data) if item.get("address")]
    
    print(f"\n📊 Found {len(items_to_process)} items with addresses")
    
    if not items_to_process:
        print("\n⚠️  No items with addresses found!")
        return
    
    print(f"\n🚀 Processing {len(items_to_process)} items...")
    print("-" * 60)
    
    success_count = 0
    error_count = 0
    
    for idx, (data_index, item) in enumerate(items_to_process, 1):
        address = item.get("address", "")
        short_name = item.get("shortName", "")[:40]
        
        print(f"\n[{idx}/{len(items_to_process)}] {short_name}...")
        
        try:
            result = await calculate_distance(address)
            
            if result.error:
                print(f"   ⚠️  Skipped: {result.error}")
                error_count += 1
            else:
                data[data_index]["drivingMinutes"] = result.driving_minutes
                data[data_index]["transitMinutes"] = result.transit_minutes
                data[data_index]["distanceKm"] = result.distance_km
                
                print(f"   ✅ {result.distance_km}km, 🚗 {result.driving_minutes}min, 🚌 ~{result.transit_minutes}min")
                success_count += 1
                save_data(data)
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
            error_count += 1
        
        if idx < len(items_to_process):
            await asyncio.sleep(1.5)
    
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    print(f"   ✅ Successfully calculated: {success_count}")
    print(f"   ⚠️  Errors/Skipped: {error_count}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Calculate distances from home for all items in data.json")
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Recalculate distances for ALL items, even those that already have distance data"
    )
    
    args = parser.parse_args()
    
    if args.force:
        asyncio.run(run_force_all())
    else:
        asyncio.run(run_distance_calculations())

