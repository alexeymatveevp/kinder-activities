# Kinder Activities

A tool to discover and catalogue kid-friendly activities in Munich and Bavaria. Combines Google search, web crawling, and LLM analysis.

Deployed on **Netlify** with **Google Sheets** as the database.

## Quick Start

### 1. Google Cloud Setup (Required)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Sheets API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API" and enable it
4. Create a Service Account:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Give it a name (e.g., "kinder-activities-sheets")
   - Click "Create and Continue", then "Done"
5. Create a key for the service account:
   - Click on the service account you just created
   - Go to "Keys" tab > "Add Key" > "Create new key"
   - Choose JSON and download the file
6. Create a Google Sheet:
   - Create a new Google Sheet at [sheets.google.com](https://sheets.google.com)
   - Add the header row (Row 1):
     ```
     url | shortName | alive | lastUpdated | category | openHours | address | services | description | userRating | drivingMinutes | transitMinutes | distanceKm | userComment | userRemoved
     ```
   - Share the sheet with the service account email (found in the JSON file as `client_email`)
   - Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

### 2. Credentials Setup

**Option A (Recommended): Use credentials file**

Copy your downloaded JSON key file to the project root:
```bash
cp ~/Downloads/your-service-account-key.json google-credentials.json
```

Then create `.env` with just the Sheet ID:
```bash
echo "GOOGLE_SHEETS_ID=your_spreadsheet_id_here" > .env
```

**Option B: Use environment variables**

Copy `env.example` to `.env` and fill in your values:
```bash
cp env.example .env
```

Required environment variables:
- `GOOGLE_SHEETS_ID` - The spreadsheet ID from the Google Sheet URL
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - From the JSON key file (`client_email`)
- `GOOGLE_PRIVATE_KEY` - From the JSON key file (`private_key`)

### 3. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies (for local scripts)
cd server && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
```

### 4. Migrate Existing Data (One-time)

If you have existing data in `data/data.json`, run the migration script:

```bash
npm run migrate-to-sheets
```

### 5. Local Development

```bash
# Install Netlify CLI globally (if not already installed)
npm install -g netlify-cli

# Start the development server (frontend + functions)
npm run dev:netlify
```

This starts:
- Vite dev server for the React frontend
- Netlify Functions for the API

## Deployment to Netlify

1. Push your code to GitHub
2. Connect the repository to Netlify
3. Set environment variables in Netlify dashboard:
   - `GOOGLE_SHEETS_ID`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
4. Deploy!

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:netlify` | Start local dev with Netlify Functions |
| `npm run dev` | Start Vite frontend only |
| `npm run build` | Build for production |
| `npm run migrate-to-sheets` | Migrate data.json to Google Sheets |

### Local-Only Scripts (Data Enrichment)

These scripts run locally and write directly to Google Sheets:

| Command | Description |
|---------|-------------|
| `npm run run` | **Full pipeline** - runs all steps below in order |
| `npm run search` | Search Google for new activity URLs |
| `npm run merge-serp` | Merge search results into `all-urls.json` |
| `npm run check-alive` | Check URL availability & content types |
| `npm run analyse-all` | Analyse new URLs with LLM, save to Google Sheets |
| `npm run analyse <url>` | Analyse a single URL |
| `npm run crawl <url>` | Debug: show raw crawler output |
| `npm run bot` | Start Telegram bot |

## Data Files

### Google Sheets (Synced)
- Activities with full details (replaces `data/data.json`)

### Local Only
- `data/all-urls.json` - All discovered URLs with status
- `data/serp/` - Raw Google search results

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Netlify (Cloud)                       │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │  React Frontend │───▶│    Netlify Functions       │  │
│  │    (Vite)       │    │  (API: CRUD operations)    │  │
│  └─────────────────┘    └────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │     Google Sheets       │
                    │    (Database)           │
                    └─────────────────────────┘
                                  ▲
                                  │
┌─────────────────────────────────────────────────────────┐
│                    Local Machine                         │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │  Python Scripts │───▶│    all-urls.json           │  │
│  │  (Enrichment)   │    │    serp/*.json             │  │
│  └─────────────────┘    └────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_SHEETS_ID` | Google Sheet ID from URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
| `GOOGLE_PRIVATE_KEY` | Service account private key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (optional) |
| `OPENAI_API_KEY` | OpenAI API key (for analysis) |
