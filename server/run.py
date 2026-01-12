#!/usr/bin/env python3
"""
Main orchestration script that runs the full pipeline:
1. serp.py - Search for new URLs via Google
2. merge-serp-query-to-allurls.py - Merge search results into all-urls.json
3. check-alive.py - Check which URLs are alive and get content types
4. run_analyser_for_all_urls.py - Analyse new URLs and save to data.json
"""

import subprocess
import sys
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = Path(__file__).parent

# Scripts to run in order
SCRIPTS = [
    ("serp.py", "🔍 Step 1/4: Searching for new URLs via Google..."),
    ("merge-serp-query-to-allurls.py", "📥 Step 2/4: Merging search results into all-urls.json..."),
    ("check-alive.py", "🏥 Step 3/4: Checking which URLs are alive..."),
    ("run_analyser_for_all_urls.py", "🤖 Step 4/4: Analysing new URLs with LLM..."),
]


def run_script(script_name: str, description: str) -> bool:
    """Run a Python script and return True if successful."""
    script_path = SCRIPT_DIR / script_name
    
    print("\n" + "=" * 70)
    print(description)
    print("=" * 70 + "\n")
    
    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=SCRIPT_DIR,
            check=False
        )
        
        if result.returncode != 0:
            print(f"\n⚠️  {script_name} exited with code {result.returncode}")
            return False
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error running {script_name}: {e}")
        return False


def main():
    print("\n" + "=" * 70)
    print("🚀 KINDER ACTIVITIES - FULL PIPELINE")
    print("=" * 70)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    start_time = datetime.now()
    results = []
    
    for script_name, description in SCRIPTS:
        success = run_script(script_name, description)
        results.append((script_name, success))
        
        if not success:
            print(f"\n⚠️  Warning: {script_name} had issues, but continuing...")
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    # Summary
    print("\n" + "=" * 70)
    print("📊 PIPELINE SUMMARY")
    print("=" * 70)
    
    for script_name, success in results:
        icon = "✅" if success else "⚠️"
        print(f"  {icon} {script_name}")
    
    print(f"\nTotal time: {elapsed:.1f} seconds")
    print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()

