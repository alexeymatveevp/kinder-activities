# Data Flow Documentation

## Overview

**Kinder Activities** discovers and catalogues kid-friendly activities in Munich and Bavaria. It combines Google search, web crawling, and LLM analysis. A local **SQLite** database is the source of truth; a small **Express** server (Node) serves the React frontend; Python scripts enrich the database.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                       SQLite (data/activities.db)                      │
│  activities table:                                                     │
│   url | shortName | alive | lastUpdated | category | openHours |       │
│   address | services | description | userRating | drivingMinutes |     │
│   transitMinutes | distanceKm | userComment | price                    │
└────────────────────────────────────────────────────────────────────────┘
                                   ▲
                   ┌───────────────┼───────────────┐
                   │               │               │
                   ▼               ▼               ▼
      ┌─────────────────────┐  ┌─────────────┐  ┌──────────────┐
      │  Express API (Node) │  │  Python     │  │  Telegram    │
      │  node-server/       │  │  Scripts    │  │  Bot         │
      │                     │  │             │  │              │
      │  db.js (SQLite)     │  │  run.py     │  │  bot.py      │
      │  server.js (:3002)  │  │  serp.py    │  │              │
      │                     │  │  analyser   │  │              │
      └──────────┬──────────┘  │  crawler    │  └──────────────┘
                 ▲             │  distance   │
                 │             └─────────────┘
             /api/* (via Vite proxy in dev)
                 │
      ┌────────────────────────┐
      │  React Frontend        │
      │  (src/App.jsx)         │
      │                        │
      │  - Activities list     │
      │  - Filter/search       │
      │  - Edit/rate           │
      └────────────────────────┘
```

All processes (Express server, Python scripts, Telegram bot) open the same `activities.db` file directly via their respective SQLite libraries (`better-sqlite3` for Node, `sqlite3` stdlib for Python). WAL mode is enabled so concurrent reads/writes are safe.

---

## Full Pipeline (`run.py`)

Execute `npm run run` to run steps 1–4 in sequence:

```
Step 1: serp.py                        → data/serp/query.json
Step 2: merge-serp-query-to-allurls.py → updates data/all-urls.json
Step 3: check-alive.py                 → updates data/all-urls.json (alive + contentType)
Step 4: run_analyser_for_all_urls.py   → writes to SQLite (activities table)
```

---

## Step 1: SERP Search (`serp.py`)

**Purpose:** Find new activity URLs via Google Search using SerpAPI.

- Generates random queries combining keyword groups:
  - **A:** "Kinder", "mit Kindern", "Familie"
  - **B:** "Aktivitäten", "Freizeit", "Ausflüge", "Tipps"
  - **C:** "München", "Umgebung München", "Bayern"
  - **Extra filters:** "Indoor", "Geheimtipps", "Wochenende", "Kleinkinder", "kostenlos"
  - **Site filters:** `site:.de`, `site:.muenchen.de`, or none
- Runs 4 queries × 10 pages × 10 results ≈ 400 URLs per run (after dedup)

**Output:**
- `data/serp/query.json` — list of `{title, link, snippet}`
- `data/serp/last-serp-requests.json` — metadata

---

## Step 2: Merge SERP Results (`merge-serp-query-to-allurls.py`)

Adds new URLs from `data/serp/query.json` into `data/all-urls.json`.

**Entry schema:**
```json
{
  "url": "https://example.com",
  "visited": false,
  "title": "Google Search Title",
  "snippet": "Snippet text",
  "alive": true,
  "contentType": "website"
}
```

---

## Step 3: Check Alive (`check-alive.py`)

Verifies which URLs are reachable and determines content type.

- Concurrent HEAD/GET requests via aiohttp (max 10 concurrent)
- Sets `alive` (status < 400) and `contentType` (website, pdf, json, …)

Only URLs with `contentType === "website"` and `alive === true` proceed to Step 4.

---

## Step 4: Analyse & Extract (`run_analyser_for_all_urls.py`)

Crawls websites, extracts structured activity data with an LLM, and writes to SQLite.

**Filter:** only alive website URLs that aren't already in the `activities` table.

### 4a. Web Crawling (`crawler.py` — Scrapy)
- Crawls up to 10 pages per site (main + 9 linked)
- Prioritizes links with keywords: kontakt, preise, öffnungszeiten, anfahrt, angebot, about, etc.
- Strips scripts, styles, navigation, footers

### 4b. LLM Analysis (`llm_service.py` — OpenAI gpt-4o-mini)
- Truncates content to 100,000 chars
- Extracts: **category**, **openHours**, **address**, **prices**, **services**, **description**, **shortName**, **ageRange**

### 4c. Distance Calculation (`distance_from_home.py`)
If address is found:
1. Geocode via Nominatim (OpenStreetMap — free)
2. Driving time via OSRM (free routing engine)
3. Transit estimate: `driving_time × 1.8 + 12 min`

**Home location:** Nuss-Anger 8, 85591 Vaterstetten, Germany

### Output
New or updated row in `activities` (SQLite), via `data_service.save_or_update_activity()` → `db_service`.

---

## Step 5 (Manual): Distance Backfill (`run_distance_for_all.py`)

Calculate/recalculate distance for all activities with addresses.

`python run_distance_for_all.py` (missing only) or `--force` (all).

---

## Data Files

| File | Purpose | Status |
|------|---------|--------|
| `data/activities.db` | SQLite database — source of truth for activities | **Active** |
| `data/all-urls.json` | URL candidate database with alive/contentType metadata | **Active** — updated by pipeline |
| `data/serp/query.json` | Latest SERP search results | **Active** — overwritten each run |
| `data/serp/last-serp-requests.json` | SERP run metadata | **Active** |

The DB path can be overridden via the `KINDER_DB_PATH` env var (useful for deployment).

---

## Activities Schema (SQLite)

```sql
CREATE TABLE activities (
  url             TEXT PRIMARY KEY,
  shortName       TEXT NOT NULL DEFAULT '',
  alive           INTEGER NOT NULL DEFAULT 1,    -- 0/1
  lastUpdated     TEXT NOT NULL DEFAULT '',     -- ISO date
  category        TEXT,
  openHours       TEXT,
  address         TEXT,
  services        TEXT,                          -- JSON array string
  description     TEXT,
  userRating      INTEGER,                       -- 1..5
  drivingMinutes  INTEGER,
  transitMinutes  INTEGER,
  distanceKm      REAL,
  userComment     TEXT,
  price           TEXT
);
```

---

## Frontend Data Consumption

### React App (`src/App.jsx`)

1. On mount, calls `GET /api/activities`
2. The Express API reads SQLite and returns the array as JSON
3. User interactions write back via the API:
   - **Rate:** `PUT /api/activities/rating`
   - **Comment:** `PUT /api/activities/comment`
   - **Category:** `PUT /api/activities/category`
   - **Name:** `PUT /api/activities/name`
   - **Delete:** `DELETE /api/activities` (hard delete)

In dev, Vite proxies `/api/*` to `http://localhost:3002`. In production, any reverse proxy (nginx, Caddy) performs the same routing.

---

## Telegram Bot (`bot.py`)

Alternative input method — submit a single URL for analysis on demand. Uses the same `analyser.py` → `crawler.py` + `llm_service.py` + `distance_from_home.py` pipeline, writes directly to SQLite via `data_service.save_or_update_activity()`.

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
    │   └── db_service.py (SQLite — sqlite3 stdlib)
    └── writes to data/activities.db

bot.py (Telegram bot)
├── analyser.py (same pipeline)
├── data_service.py
└── writes to data/activities.db

run_distance_for_all.py (standalone)
├── distance_from_home.py
└── updates data/activities.db

node-server/server.js (Express API, :3002)
└── node-server/db.js (SQLite — better-sqlite3)
    └── reads/writes data/activities.db
```

---

## Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `KINDER_DB_PATH` | Node + Python | Optional override for the SQLite DB path (absolute or repo-relative). Defaults to `data/activities.db` |
| `OPENAI_API_KEY` | `llm_service.py` | LLM analysis |
| `TELEGRAM_BOT_TOKEN` | `bot.py` | Telegram bot (optional) |

SerpAPI key is hardcoded in `serp.py`.

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
data/activities.db  (new activities inserted)
    ↓  Express API (/api/activities*)
React Frontend  (display + edit)
    ↓  User interactions (rate, comment, delete, rename, recategorize)
data/activities.db  (updated)
```
