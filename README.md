# Kinder Activities

A tool to discover and catalogue kid-friendly activities in Munich and Bavaria. Combines Google search, web crawling, and LLM analysis.

Self-hosted: a React frontend served by any static-file host, Python enrichment scripts and a Telegram bot, all backed by **PostgreSQL**.

## Quick Start

### 1. Install dependencies

```bash
# Node deps (frontend + tooling)
npm install

# Python deps (enrichment pipeline + Telegram bot)
cd server && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..
```

### 2. Configure environment

Copy `env.example` to `.env` and fill in the keys you need:

```bash
cp env.example .env
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string. Required by the Python services. |
| `OPENAI_API_KEY` | Required for LLM analysis (`analyse`, `analyse-all`, `bot`) |
| `TELEGRAM_BOT_TOKEN` | Required for `npm run bot` |
| `VITE_BASE_PATH` | Optional sub-path the frontend is served under (e.g. `kinder-activities`) |

Spin up a local Postgres (e.g. `brew install postgresql@16 && brew services start postgresql@16`), then:

```bash
createuser kinder
createdb -O kinder kinder_activities_dev
```

and set `DATABASE_URL=postgresql://kinder@localhost:5432/kinder_activities_dev` in `.env`. The Python services create the schema on first connect.

### 3. Run locally

```bash
npm run dev   # Vite frontend
npm run bot   # Telegram bot (in a separate terminal)
```

Open http://localhost:5173.

The frontend expects an `/api/*` backend (list/get/update/delete endpoints) — provide it via your preferred runtime or a reverse-proxy on the VPS.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite frontend dev server |
| `npm run build` | Build the frontend for production |
| `npm run preview` | Preview a production build locally |
| `npm run lint` | ESLint over all sources |

### Data enrichment (Python)

All enrichment scripts write directly to Postgres via `server/db_service.py`.

| Command | Description |
|---------|-------------|
| `npm run run` | **Full pipeline** — runs all steps below in order |
| `npm run search` | Search Google for new activity URLs |
| `npm run merge-serp` | Merge search results into `data/all-urls.json` |
| `npm run check-alive` | Check URL availability & content types |
| `npm run analyse-all` | Analyse new URLs with the LLM, save to Postgres |
| `npm run analyse <url>` | Analyse a single URL |
| `npm run crawl <url>` | Debug: show raw crawler output |
| `npm run bot` | Start the Telegram bot |

## Data Files

| Path | Purpose |
|------|---------|
| Postgres `activities` table | Source of truth — see [DATA_FLOW.md](DATA_FLOW.md) for the schema |
| `data/all-urls.json` | All discovered URLs with status |
| `data/serp/` | Raw Google search results |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                          Browser                              │
│                    React frontend (Vite)                      │
└──────────────────────────┬───────────────────────────────────┘
                           │  /api/*
                           ▼
                  ┌────────────────────┐
                  │   PostgreSQL       │ ◀──── Python enrichment
                  │   (activities)     │       (serp → crawl → LLM)
                  └────────────────────┘ ◀──── Telegram bot (bot.py)
```

See [DATA_FLOW.md](DATA_FLOW.md) for the full pipeline and schema.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `OPENAI_API_KEY` | OpenAI API key (required for LLM analysis) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (required for `npm run bot`) |
| `VITE_BASE_PATH` | Sub-path the web app is served under (e.g. `kinder-activities`) |
