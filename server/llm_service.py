"""
LLM service for analyzing website content using OpenAI
"""
import os
import json
from openai import OpenAI
from typing import Optional
from data_service import PriceInfo

# Categories for activities
CATEGORIES = [
    "museum",
    "playground",
    "sports",
    "indoor",
    "outdoor",
    "zoo",
    "theater",
    "swimming",
    "climbing",
    "park",
    "cafe",
    "festival",
    "education",
    "other",
]


class AnalysisResult:
    def __init__(
        self,
        category: Optional[str] = None,
        open_hours: Optional[str] = None,
        address: Optional[str] = None,
        prices: Optional[list[PriceInfo]] = None,
        services: Optional[list[str]] = None,
        description: Optional[str] = None,
        short_name: Optional[str] = None,
        age_range: Optional[str] = None,
    ):
        self.category = category
        self.open_hours = open_hours
        self.address = address
        self.prices = prices or []
        self.services = services or []
        self.description = description
        self.short_name = short_name
        self.age_range = age_range


# Max content length for LLM (gpt-4o-mini has 128k context)
# ~100k chars ≈ 25k tokens - handles most large sites
MAX_CONTENT_LENGTH = 100000


def analyse_content(url: str, content: str) -> AnalysisResult:
    """
    Analyze website content using OpenAI to extract structured information.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")

    # Truncate content if too long (to save API costs)
    if len(content) > MAX_CONTENT_LENGTH:
        content = content[:MAX_CONTENT_LENGTH] + "\n\n[Content truncated...]"

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": f"""You analyze website content for kids' activities in Munich/Bavaria area.

Extract the following information from the provided website content:

1. **category**: Choose ONE from: {", ".join(CATEGORIES)}
2. **openHours**: Opening hours in format "Mon-Fri 9:00-18:00" or similar. Set to null if not found.
3. **address**: Full address including city. Set to null if not found.
4. **prices**: Array of {{"service": "...", "price": "..."}} objects. Include entry fees, course prices, etc. Empty array if none found.
5. **services**: Array of services/activities offered (e.g., "climbing wall", "swimming lessons")
6. **description**: 1-2 sentence description of what this place/activity is about.
7. **shortName**: A concise name for the place/activity (1-2 words preferred, max 5 words). Examples: "Kinderkunsthaus", "Tierpark Hellabrunn", "Boulderwelt München".
8. **ageRange**: Target age range for children (e.g., "0-3 years", "4-12 years", "from 6 years", "all ages"). Set to null if not mentioned on the website.

Respond with valid JSON only:
{{
  "category": "museum",
  "openHours": "Mon-Sun 10:00-18:00" or null,
  "address": "Musterstraße 1, 80331 München" or null,
  "prices": [{{"service": "Entry adults", "price": "12€"}}],
  "services": ["guided tours", "workshops"],
  "description": "A children's museum with interactive exhibits.",
  "shortName": "Kindermuseum",
  "ageRange": "4-12 years" or null
}}""",
            },
            {"role": "user", "content": f"Analyze this website: {url}\n\nContent:\n{content}"},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    content_str = response.choices[0].message.content
    if not content_str:
        raise ValueError("No response from LLM")

    parsed = json.loads(content_str)

    return AnalysisResult(
        category=parsed.get("category"),
        open_hours=parsed.get("openHours"),
        address=parsed.get("address"),
        prices=parsed.get("prices", []),
        services=parsed.get("services", []),
        description=parsed.get("description"),
        short_name=parsed.get("shortName"),
        age_range=parsed.get("ageRange"),
    )

