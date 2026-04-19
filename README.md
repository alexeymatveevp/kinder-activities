# Kinder Activities

A tool to discover and catalogue kid-friendly activities in Munich and Bavaria. Combines Google search, web crawling, and LLM analysis.

Self-hosted: a React frontend served by any static-file host, a small Express API (Node), and a local **SQLite** database.

## Quick Start

### 1. Install dependencies

```bash
# Node deps (root + API server)
npm install
cd node-server && npm install && cd ..

# Python deps (for the enrichment pipeline and Telegram bot)
cd server && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..
```

### 2. Configure environment

Copy `env.example` to `.env` and fill in the keys you need:

```bash
cp env.example .env
```

All variables are optional:

| Variable | Purpose |
|----------|---------|
| `KINDER_DB_PATH` | Override SQLite DB location (absolute or repo-relative). Defaults to `data/activities.db` |
| `OPENAI_API_KEY` | Required for LLM analysis (`analyse`, `analyse-all`, `bot`) |
| `TELEGRAM_BOT_TOKEN` | Required for `npm run bot` |

### 3. Run locally

```bash
# Starts both the Express API (:3002) and the Vite dev server
npm run dev:all
```

Open http://localhost:5173.

On first run, the SQLite file is created automatically at `data/activities.db` with the empty schema. Populate it via the enrichment pipeline (`npm run run`) or the Telegram bot.

## Deployment (self-host)

A minimal deployment on any Linux VPS:

1. Copy the repo to the server (git clone or rsync).
2. `npm install` at the root and in `node-server/`.
3. `npm run build` — outputs static files to `dist/`.
4. Copy your local `data/activities.db` to the server (or let it start empty).
5. Set `KINDER_DB_PATH` in `.env` if the DB lives outside the repo.
6. Run the API server as a long-lived process (systemd, pm2, etc.):
   ```bash
   node node-server/server.js   # listens on :3002
   ```
7. Configure a reverse proxy (nginx / Caddy) to serve `dist/` as static files and proxy `/api/*` → `http://localhost:3002`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:all` | Start API server + Vite frontend together |
| `npm run dev` | Vite frontend only |
| `npm run server` | Express API server only (:3002) |
| `npm run build` | Build the frontend for production |
| `npm run preview` | Preview a production build locally |

### Data enrichment (Python)

All enrichment scripts write directly to SQLite via `server/db_service.py`.

| Command | Description |
|---------|-------------|
| `npm run run` | **Full pipeline** — runs all steps below in order |
| `npm run search` | Search Google for new activity URLs |
| `npm run merge-serp` | Merge search results into `data/all-urls.json` |
| `npm run check-alive` | Check URL availability & content types |
| `npm run analyse-all` | Analyse new URLs with the LLM, save to SQLite |
| `npm run analyse <url>` | Analyse a single URL |
| `npm run crawl <url>` | Debug: show raw crawler output |
| `npm run bot` | Start the Telegram bot |

## Data Files

| Path | Purpose |
|------|---------|
| `data/activities.db` | SQLite database (source of truth) |
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
┌──────────────────────────────────────────────────────────────┐
│            Express API (node-server/server.js :3002)          │
│                  better-sqlite3 → activities.db               │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │   data/activities.db  │ ◀──── Python enrichment
               │       (SQLite)        │       (serp → crawl → LLM)
               └───────────────────────┘ ◀──── Telegram bot (bot.py)
```

See [DATA_FLOW.md](DATA_FLOW.md) for the full pipeline and schema.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `KINDER_DB_PATH` | Optional SQLite path override |
| `OPENAI_API_KEY` | OpenAI API key (required for LLM analysis) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (required for `npm run bot`) |
