import json
import os
import random
from datetime import datetime
from serpapi import GoogleSearch

SERPAPI_KEY = "bb7b0c3730ecde332ad2654204e1eec103a7b4fa53280fd94ff2323a959402d3"

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "serp")
QUERY_FILE = os.path.join(DATA_DIR, "query.json")
METADATA_FILE = os.path.join(DATA_DIR, "last-serp-requests.json")

BASE_QUERY = "Kinder Aktivitäten München und Umgebung"

KEYWORDS_A = [
    "Kinder", "mit Kindern", "Familie"
]

KEYWORDS_B = [
    "Aktivitäten", "Freizeit", "Ausflüge", "Tipps"
]

KEYWORDS_C = [
    "München", "Umgebung München", "Bayern"
]

EXTRA_FILTERS = [
    "Indoor",
    "Geheimtipps",
    "Wochenende",
    "Kleinkinder",
    "kostenlos"
]

SITE_FILTERS = [
    "site:.de",
    # "site:.bayern",
    "site:.muenchen.de",
    ""
]


def generate_query():
    return " ".join([
        random.choice(KEYWORDS_A),
        random.choice(KEYWORDS_B),
        random.choice(KEYWORDS_C),
        random.choice(EXTRA_FILTERS),
        # random.choice(SITE_FILTERS)
    ])


def run_search(query, pages=10):
    """
    Run search and return full organic results from specified number of pages.
    Default: 10 pages = ~100 results per query.
    Returns list of dicts with title, link, snippet.
    """
    all_results = []

    for page in range(pages):
        params = {
            "engine": "google",
            "location": "Vaterstetten, Bavaria, Germany",
            "q": query,
            "hl": "de",
            "gl": "de",
            "num": 10,
            "start": page * 10,
            "api_key": SERPAPI_KEY
        }

        search = GoogleSearch(params)
        results = search.get_dict()

        page_results = results.get("organic_results", [])
        for r in page_results:
            all_results.append({
                "title": r.get("title"),
                "link": r.get("link"),
                "snippet": r.get("snippet")
            })

        # Stop if no more results
        if not page_results:
            break

    return all_results


def weekly_job(existing_urls: set):
    collected_urls = set()

    # 1. базовый запрос
    results = run_search(BASE_QUERY)
    collected_urls.update(r["link"] for r in results)

    # 2. вариативные запросы
    for _ in range(3):
        q = generate_query()
        results = run_search(q)
        collected_urls.update(r["link"] for r in results)

    # 3. оставляем только новые ссылки
    new_urls = collected_urls - existing_urls
    return new_urls


def main():
    """Run a single search with a random query and save results."""
    query = generate_query()
    print(f"Running search for: {query}")
    
    results = run_search(query)
    print(f"Found {len(results)} results")
    
    # Save full results to query.json
    with open(QUERY_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Results saved to {QUERY_FILE}")
    
    # Update metadata
    metadata = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "query": query,
        "results_count": len(results)
    }
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    print(f"Metadata saved to {METADATA_FILE}")


if __name__ == "__main__":
    main()
