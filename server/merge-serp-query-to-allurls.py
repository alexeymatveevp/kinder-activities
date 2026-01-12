"""
Merge SERP query results into all-urls.json.
- Adds new URLs if not already present
- Updates existing URLs with title and snippet metadata
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
SERP_DIR = os.path.join(DATA_DIR, "serp")
QUERY_FILE = os.path.join(SERP_DIR, "query.json")
ALL_URLS_FILE = os.path.join(DATA_DIR, "all-urls.json")


def main():
    # Load query.json
    if not os.path.exists(QUERY_FILE):
        print(f"Error: {QUERY_FILE} not found")
        return
    
    with open(QUERY_FILE, "r", encoding="utf-8") as f:
        query_results = json.load(f)
    
    print(f"Loaded {len(query_results)} results from query.json")
    
    # Load all-urls.json
    if os.path.exists(ALL_URLS_FILE):
        with open(ALL_URLS_FILE, "r", encoding="utf-8") as f:
            all_urls = json.load(f)
    else:
        all_urls = []
    
    print(f"Existing URLs in all-urls.json: {len(all_urls)}")
    
    # Build a lookup by URL
    url_index = {entry["url"]: entry for entry in all_urls}
    
    new_count = 0
    updated_count = 0
    
    for result in query_results:
        link = result.get("link")
        if not link:
            continue
        
        title = result.get("title")
        snippet = result.get("snippet")
        
        if link in url_index:
            # Update existing entry with metadata
            entry = url_index[link]
            if title:
                entry["title"] = title
            if snippet:
                entry["snippet"] = snippet
            updated_count += 1
        else:
            # Add new entry (alive left undefined)
            new_entry = {
                "url": link,
                "visited": False
            }
            if title:
                new_entry["title"] = title
            if snippet:
                new_entry["snippet"] = snippet
            
            all_urls.append(new_entry)
            url_index[link] = new_entry
            new_count += 1
    
    # Save updated all-urls.json
    with open(ALL_URLS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_urls, f, ensure_ascii=False, indent=2)
    
    print(f"Added {new_count} new URLs")
    print(f"Updated {updated_count} existing URLs with metadata")
    print(f"Total URLs in all-urls.json: {len(all_urls)}")


if __name__ == "__main__":
    main()

