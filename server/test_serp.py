"""
Test script to preview SERP queries without making actual API calls.
"""

from serp import BASE_QUERY, generate_query

PAGES_PER_QUERY = 10
RESULTS_PER_PAGE = 10


def main():
    print("=" * 60)
    print("SERP Query Preview (no API calls)")
    print("=" * 60)
    
    print("\n1. Base query:")
    print(f"   {BASE_QUERY}")
    
    print("\n2. Generated random queries (3 samples):")
    for i in range(3):
        q = generate_query()
        print(f"   [{i+1}] {q}")
    
    print("\n" + "=" * 60)
    print("Estimated results per weekly_job() run:")
    print(f"  - 1 base query × {PAGES_PER_QUERY} pages × {RESULTS_PER_PAGE} results = ~{PAGES_PER_QUERY * RESULTS_PER_PAGE} URLs")
    print(f"  - 3 random queries × {PAGES_PER_QUERY} pages × {RESULTS_PER_PAGE} results = ~{3 * PAGES_PER_QUERY * RESULTS_PER_PAGE} URLs")
    print(f"  - Total: ~{4 * PAGES_PER_QUERY * RESULTS_PER_PAGE} URLs (before dedup)")
    print(f"  - API calls: {4 * PAGES_PER_QUERY} credits")
    print("=" * 60)


if __name__ == "__main__":
    main()

