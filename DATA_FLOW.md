# Data Flow Documentation

## Overview

**Kinder Activities** discovers and catalogues kid-friendly activities in Munich and Bavaria. It combines Google search, web crawling, and LLM analysis. Google Sheets serves as the primary database, with a React frontend deployed on Netlify.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GOOGLE SHEETS (Database)                        │
│  Columns: url | shortName | alive | lastUpdated | category | openHours │
│           | address | services | description | userRating | drivingMin │
│           | transitMin | distanceKm | userComment | userRemoved        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
        ┌─────────────────┐  ┌─────────────┐  ┌──────────────┐
        │  Netlify         │  │  Python      │  │  Telegram    │
        │  Functions (JS)  │  │  Scripts     │  │  Bot         │
        │                  │  │              │  │              │
        │  activities.js   │  │  run.py      │  │  bot.py      │
        │  update-*.js     │  │  serp.py     │  │              │
        │  delete-*.js     │  │  analyser    │  │              │
        └────────┬─────────┘  │  crawler     │  └──────────────┘
                 ▲            │  distance    │
                 │            └──────────────┘
              (API)                │
                 │         ┌──────┴───────┐
                 │         ▼              ▼
        ┌──────────────────────┐  ┌──────────────────┐
        │  React Frontend      │  │  Data Files       │
        │  (src/App.jsx)       │  │  data.json        │
        │                      │  │  all-urls.json    │
        │  Displays:           │  │  serp/query.json  │
        │  - Activities list   │  │  serp/last-...    │
        │  - Filter/search     │  └──────────────────┘
        │  - Edit/rate         │
        └──────────────────────┘
```

---

## Full Pipeline (run.py)

Execute `npm run run` or `python run.py` to run steps 1-4 in sequence:

```
Step 1: serp.py              → data/serp/query.json
Step 2: merge-serp-query-to-allurls.py → updates data/all-urls.json
Step 3: check-alive.py       → updates data/all-urls.json (alive + contentType)
Step 4: run_analyser_for_all_urls.py   → saves to Google Sheets
```

---

## Step 1: SERP Search (`serp.py`)

**Purpose:** Find new activity URLs via Google Search using SerpAPI.

**Process:**
- Generates random queries combining keyword groups:
  - **A:** "Kinder", "mit Kindern", "Familie"
  - **B:** "Aktivitäten", "Freizeit", "Ausflüge", "Tipps"
  - **C:** "München", "Umgebung München", "Bayern"
  - **Extra filters:** "Indoor", "Geheimtipps", "Wochenende", "Kleinkinder", "kostenlos"
  - **Site filters:** `site:.de`, `site:.muenchen.de`, or none
- Runs 4 queries x 10 pages x 10 results = ~400 URLs per run (after dedup)

**Output:**
- `data/serp/query.json` — list of `{title, link, snippet}`
- `data/serp/last-serp-requests.json` — metadata (date, query, count)

---

## Step 2: Merge SERP Results (`merge-serp-query-to-allurls.py`)

**Purpose:** Add new URLs from SERP to the all-urls database.

**Process:**
1. Loads `data/serp/query.json`
2. Loads `data/all-urls.json`
3. Adds new URLs with title/snippet, updates existing entries

**Output:** Updates `data/all-urls.json`

**Entry schema:**
```json
{
  "url": "https://example.com",
  "visited": false,
  "title": "Google Search Title",
  "snippet": "Snippet text",
  "alive": true,
  "contentType": "website",
  "userRemoved": false
}
```

---

## Step 3: Check Alive (`check-alive.py`)

**Purpose:** Verify which URLs are reachable and determine content type.

**Process:**
1. Loads all URLs from `data/all-urls.json`
2. Makes concurrent HEAD/GET requests (max 10 concurrent via aiohttp)
3. Sets `alive` (status < 400) and `contentType` (website, pdf, json, text, image, video, audio, xml, other, unknown)

**Output:** Updates `data/all-urls.json` with `alive` and `contentType` fields

**Important:** Only URLs with `contentType === "website"` and `alive === true` proceed to Step 4.

---

## Step 4: Analyse & Extract (`run_analyser_for_all_urls.py`)

**Purpose:** Crawl websites and use LLM to extract structured activity data, then save to Google Sheets.

**Filters:** Only processes URLs that are alive websites, not already in Google Sheets, and not user-removed.

### 4a. Web Crawling (`crawler.py` — Scrapy)

- Crawls up to 10 pages per site (main + 9 linked)
- Prioritizes links with keywords: kontakt, preise, öffnungszeiten, anfahrt, angebot, about, etc.
- Strips scripts, styles, navigation, footers
- Returns structured page content

### 4b. LLM Analysis (`llm_service.py` — OpenAI gpt-4o-mini)

- Truncates content to max 100,000 chars
- Extracts: **category**, **openHours**, **address**, **prices**, **services**, **description**, **shortName**, **ageRange**
- Categories from predefined list (museum, playground, sports, zoo, etc.)

### 4c. Distance Calculation (`distance_from_home.py`)

If address is found:
1. Geocodes via **Nominatim** (OpenStreetMap — free)
2. Calculates driving time via **OSRM** (free routing engine)
3. Estimates transit time: `driving_time * 1.8 + 12 min`

**Home location:** Nuss-Anger 8, 85591 Vaterstetten, Germany

### Output

New row in Google Sheets with all extracted fields.

---

## Step 5 (Manual): Distance Backfill (`run_distance_for_all.py`)

**Purpose:** Calculate/recalculate distance for all activities with addresses.

**Run:** `python run_distance_for_all.py` (default: only missing) or `python run_distance_for_all.py --force` (all)

---

## Data Files

| File | Purpose | Status |
|------|---------|--------|
| `data/all-urls.json` | URL database with alive/contentType metadata | **Active** — updated by pipeline |
| `data/serp/query.json` | Latest SERP search results | **Active** — overwritten each run |
| `data/serp/last-serp-requests.json` | SERP run metadata | **Active** |
| `data/data.json` | Legacy activity data | **Deprecated** — Google Sheets is now the source of truth; still read by bot.py for backward compat |

---

## Google Sheets Schema

**Columns (A-O):**

| Col | Field | Type | Example |
|-----|-------|------|---------|
| A | url | string | `https://kinderkunsthaus.de/` |
| B | shortName | string | `Kinderkunsthaus` |
| C | alive | boolean | `true` |
| D | lastUpdated | date | `2025-12-29` |
| E | category | string | `arts-crafts` |
| F | openHours | string | `Mon-Fri 9:00-18:00` |
| G | address | string | `Römerstr. 21, 80801 München` |
| H | services | JSON array | `["workshops", "open program"]` |
| I | description | string | `A creative workshop for children...` |
| J | userRating | int (1-5) | `4` |
| K | drivingMinutes | int | `22` |
| L | transitMinutes | int | `52` |
| M | distanceKm | float | `20.9` |
| N | userComment | string | `Great place` |
| O | userRemoved | boolean | `true` |

**Access:** Service account `kinder-activities-sheets@kinder-activities.iam.gserviceaccount.com` via gspread (Python) and googleapis (Node.js).

---

## Frontend Data Consumption

### React App (`src/App.jsx`)

1. On mount, calls `GET /.netlify/functions/activities`
2. Netlify function reads Google Sheets, filters out `userRemoved` items, returns JSON
3. User interactions write back to Google Sheets via Netlify functions:
   - **Rate:** `PUT /.netlify/functions/update-rating`
   - **Comment:** `PUT /.netlify/functions/update-comment`
   - **Category:** `PUT /.netlify/functions/update-category`
   - **Name:** `PUT /.netlify/functions/update-name`
   - **Delete:** `DELETE /.netlify/functions/delete-activity` (sets `userRemoved=true`)

All Netlify functions use `netlify/lib/sheets.js` for Google Sheets auth and read/write.

---

## Telegram Bot (`bot.py`)

Alternative input method — submit a single URL for analysis on demand.

Uses the same `analyser.py` → `crawler.py` + `llm_service.py` + `distance_from_home.py` pipeline, saves directly to Google Sheets.

---

## Module Dependency Map

```
run.py (orchestrator)
├── serp.py (SerpAPI search)
├── merge-serp-query-to-allurls.py (JSON merge)
├── check-alive.py (aiohttp concurrent checks)
└── run_analyser_for_all_urls.py
    ├── analyser.py
    │   ├── crawler.py (Scrapy spider)
    │   ├── llm_service.py (OpenAI gpt-4o-mini)
    │   └── distance_from_home.py (OSRM + Nominatim)
    ├── data_service.py
    │   └── sheets_service.py (Google Sheets API)
    └── writes to Google Sheets

bot.py (Telegram bot)
├── analyser.py (same pipeline)
├── data_service.py
└── writes to Google Sheets

run_distance_for_all.py (standalone)
├── distance_from_home.py
└── updates Google Sheets
```

---

## Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `GOOGLE_SHEETS_ID` | Python + Netlify | Spreadsheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Python + Netlify | Service account auth |
| `GOOGLE_PRIVATE_KEY` | Python + Netlify | Service account auth |
| `OPENAI_API_KEY` | `llm_service.py` | LLM analysis |
| `TELEGRAM_BOT_TOKEN` | `bot.py` | Telegram bot (optional) |

SerpAPI key is hardcoded in `serp.py`.

Alternative: place a `google-credentials.json` file for local development instead of env vars.

---

## Data Flow Summary

```
Google Search (SerpAPI)
    ↓  serp.py
data/serp/query.json
    ↓  merge-serp-query-to-allurls.py
data/all-urls.json  (new URLs added)
    ↓  check-alive.py
data/all-urls.json  (with alive + contentType)
    ↓  run_analyser_for_all_urls.py (crawl → LLM → distance)
Google Sheets  (new activities added)
    ↓  Netlify functions (sheets.js)
React Frontend  (display + edit)
    ↓  User interactions (rate, comment, delete)
Google Sheets  (updated)
```
