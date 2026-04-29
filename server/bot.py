"""
Telegram Bot for Kinder Activities

Pipeline (same as run.py but for single URL):
1. Check if URL exists in all-urls.json
2. Add URL to all-urls.json
3. Check if URL is alive
4. Run analyser to extract info
5. Save to data.json
"""
import os
import re
import json
import aiohttp
from pathlib import Path
from datetime import date
from typing import Optional
from urllib.parse import quote, urlparse

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

from analyser import analyse_url, CrawlResult
from data_service import normalize_url, save_or_update_activity
from db_service import format_prices_text

# Load environment variables
load_dotenv()

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
ALL_URLS_FILE = DATA_DIR / "all-urls.json"

# Bot token
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN environment variable not set")

# Check for OpenAI API key
if not os.getenv("OPENAI_API_KEY"):
    print("⚠️  Warning: OPENAI_API_KEY environment variable is not set. LLM features will not work.")

# URL regex pattern
URL_REGEX = re.compile(r"https?://[^\s<>\"{}|\\^`\[\]]+", re.IGNORECASE)

# Matches google.<TLD> with any number of subdomains, including ccTLDs like
# google.de, google.ru, google.co.uk, google.com.br. Single-segment TLDs are
# 2-3 chars; compound TLDs are restricted to co.<cc> / com.<cc> so that
# strings like "google.bogus.com" do NOT match.
_GOOGLE_HOST_RE = re.compile(
    r'^(?:.+\.)?google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$'
)

# Request settings for alive check
TIMEOUT = 10
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def extract_urls(text: str) -> list[str]:
    """Extract URLs from text. Preserves order, drops duplicates."""
    seen = set()
    out = []
    for match in URL_REGEX.findall(text):
        if match not in seen:
            seen.add(match)
            out.append(match)
    return out


def get_google_maps_url(address: str) -> str:
    """Generate Google Maps URL from address"""
    return f"https://www.google.com/maps/search/?api=1&query={quote(address)}"


def is_google_maps_url(url: str) -> bool:
    """Heuristic: does this URL point to a Google Maps location?"""
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or '').lower()
        path = (parsed.path or '').lower()
    except Exception:
        return False

    if not host:
        return False

    # Mobile / share short links
    if host == 'maps.app.goo.gl':
        return True
    # Legacy short link
    if host == 'goo.gl' and path.startswith('/maps'):
        return True
    # Any google.<TLD> domain — recognize maps subdomain or /maps path.
    if _GOOGLE_HOST_RE.match(host):
        if host.split('.', 1)[0] == 'maps':
            return True
        if path.startswith('/maps'):
            return True
    return False


def split_activity_and_maps_urls(urls: list[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Given the URLs found in a message, return (activity_url, google_maps_link, error).

    Rules:
      0 URLs -> error
      1 URL  -> activity URL only (must not itself be a maps URL)
      2 URLs -> exactly one must be a maps URL; the other becomes the activity URL
      3+     -> error
    """
    if len(urls) == 0:
        return None, None, "no URL found"

    if len(urls) == 1:
        only = urls[0]
        if is_google_maps_url(only):
            return None, None, (
                "I got a Google Maps link but no activity URL. "
                "Please send the activity URL too."
            )
        return only, None, None

    if len(urls) == 2:
        a, b = urls
        a_is_maps = is_google_maps_url(a)
        b_is_maps = is_google_maps_url(b)
        if a_is_maps and not b_is_maps:
            return b, a, None
        if b_is_maps and not a_is_maps:
            return a, b, None
        if a_is_maps and b_is_maps:
            return None, None, "both URLs look like Google Maps links — I need an activity URL too."
        return None, None, (
            "I got two URLs but neither looks like a Google Maps link. "
            "Send one activity URL, or one activity URL plus one Google Maps URL."
        )

    return None, None, "I can only handle one activity URL (with an optional Google Maps URL) at a time."


# ============================================================
# all-urls.json management
# ============================================================

def load_all_urls() -> list[dict]:
    """Load URLs from all-urls.json"""
    try:
        with open(ALL_URLS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def save_all_urls(urls: list[dict]) -> None:
    """Save URLs to all-urls.json"""
    with open(ALL_URLS_FILE, "w", encoding="utf-8") as f:
        json.dump(urls, f, indent=2, ensure_ascii=False)


def url_exists_in_all_urls(url: str) -> bool:
    """Check if URL already exists in all-urls.json"""
    all_urls = load_all_urls()
    normalized = normalize_url(url)
    for entry in all_urls:
        if normalize_url(entry.get("url", "")) == normalized:
            return True
    return False


def add_url_to_all_urls(url: str) -> None:
    """Add a new URL to all-urls.json"""
    all_urls = load_all_urls()
    new_entry = {
        "url": url,
        "source": "telegram-bot",
        "addedAt": date.today().isoformat(),
    }
    all_urls.append(new_entry)
    save_all_urls(all_urls)


def update_url_in_all_urls(url: str, alive: bool, content_type: str) -> None:
    """Update URL entry in all-urls.json with alive status and content type"""
    all_urls = load_all_urls()
    normalized = normalize_url(url)
    
    for entry in all_urls:
        if normalize_url(entry.get("url", "")) == normalized:
            entry["alive"] = alive
            entry["contentType"] = content_type
            break
    
    save_all_urls(all_urls)


# ============================================================
# Alive check (like check-alive.py)
# ============================================================

def get_content_type_label(content_type: str | None) -> str:
    """Map Content-Type header to a simple label."""
    if not content_type:
        return "unknown"
    
    content_type = content_type.lower().split(";")[0].strip()
    
    mappings = {
        "text/html": "website",
        "application/pdf": "pdf",
        "application/json": "json",
        "text/plain": "text",
        "image/": "image",
        "video/": "video",
        "audio/": "audio",
    }
    
    for pattern, label in mappings.items():
        if pattern in content_type:
            return label
    
    return "other"


async def check_url_alive(url: str) -> tuple[bool, str]:
    """
    Check if a URL is alive and get its content type.
    Returns: (is_alive, content_type_label)

    Strategy: HEAD first (cheap), then fall back to GET on either a connection
    error OR a >= 400 HEAD response — many sites with bot/WAF protection
    answer HEAD with 403/405 but accept GET (e.g. www.bergtierpark.de).
    """
    headers = {"User-Agent": USER_AGENT}
    timeout = aiohttp.ClientTimeout(total=TIMEOUT)

    async def do_get(session):
        async with session.get(url, timeout=timeout, allow_redirects=True, ssl=False) as response:
            return (response.status < 400, get_content_type_label(response.headers.get("Content-Type")))

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                async with session.head(url, timeout=timeout, allow_redirects=True, ssl=False) as response:
                    if response.status < 400:
                        return (True, get_content_type_label(response.headers.get("Content-Type")))
            except aiohttp.ClientError:
                pass  # fall through to GET
            return await do_get(session)
    except Exception:
        return (False, "unknown")


# ============================================================
# Save to data.json (like run_analyser_for_all_urls.py)
# ============================================================

def save_analysis_to_data(result: CrawlResult, google_maps_link: Optional[str] = None) -> bool:
    """Save analysis result to DB. Returns True if successful."""
    activity = build_activity_dict(result, google_maps_link=google_maps_link)
    success, _, _ = save_or_update_activity(activity)
    return success


def build_activity_dict(result: CrawlResult, google_maps_link: Optional[str] = None) -> dict:
    """Build activity dict from CrawlResult (matches run_analyser_for_all_urls.py)"""
    activity = {
        "url": result.url,
        "shortName": result.short_name or result.url.split("/")[2].replace("www.", ""),
        "alive": result.available,
        "lastUpdated": date.today().isoformat(),
    }

    if result.category:
        activity["category"] = result.category
    if result.open_hours:
        activity["openHours"] = result.open_hours
    if result.address:
        activity["address"] = result.address
    if google_maps_link:
        activity["googleMapsLink"] = google_maps_link
    if result.prices:
        activity["price"] = format_prices_text(result.prices)
    if result.services:
        activity["services"] = result.services
    if result.description:
        activity["description"] = result.description
    if result.age_range:
        activity["ageRange"] = result.age_range
    if result.driving_minutes is not None:
        activity["drivingMinutes"] = result.driving_minutes
    if result.transit_minutes is not None:
        activity["transitMinutes"] = result.transit_minutes
    if result.distance_km is not None:
        activity["distanceKm"] = result.distance_km

    return activity


# ============================================================
# Telegram message formatting
# ============================================================

def format_analysis_result(result: CrawlResult, google_maps_link: Optional[str] = None) -> str:
    """Format analysis result for Telegram message"""
    if not result.available:
        return (
            f"❌ *URL not available*\n\n"
            f"🔗 {result.url}\n"
            f"Status: {result.status_code or 'Unknown'}\n"
            f"Error: {result.error or 'Page not accessible'}"
        )

    message = "✅ *Analysis Complete!*\n\n"

    if result.short_name:
        message += f"📛 *Name:* {result.short_name}\n"

    message += f"🔗 *URL:* {result.url}\n"

    if google_maps_link:
        message += f"🗺️ *Google Maps:* {google_maps_link}\n"

    if result.description:
        message += f"📝 *Description:* {result.description}\n"

    if result.category:
        message += f"🏷️ *Category:* {result.category}\n"

    if result.address:
        maps_url = google_maps_link or get_google_maps_url(result.address)
        message += f"📍 *Address:* [{result.address}]({maps_url})\n"

    if result.open_hours:
        message += f"🕐 *Hours:* {result.open_hours}\n"

    if result.driving_minutes or result.transit_minutes:
        message += f"🚗 *Travel:* {result.driving_minutes or '?'} min driving, {result.transit_minutes or '?'} min transit ({result.distance_km or '?'} km)\n"

    if result.services:
        message += "\n🎯 *Services:*\n"
        for service in result.services[:5]:
            message += f"  • {service}\n"

    if result.prices:
        message += "\n💰 *Prices:*\n"
        for price in result.prices[:5]:
            message += f"  • {price['service']}: {price['price']}\n"

    return message


# ============================================================
# Telegram handlers
# ============================================================

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command"""
    user_name = update.effective_user.first_name if update.effective_user else "there"
    
    await update.message.reply_text(
        f"Hello {user_name}! 👋\n\n"
        f"Welcome to the Kinder Activities Bot.\n\n"
        f"Send me a URL of a kids' activity in Munich and I will:\n\n"
        f"1️⃣ Add it to our URL database\n"
        f"2️⃣ Check if the website is alive\n"
        f"3️⃣ Analyze and extract information\n"
        f"4️⃣ Calculate travel time from home\n"
        f"5️⃣ Save it to our activities database\n\n"
        f"Just paste a URL like:\n"
        f"https://www.kindermuseum-muenchen.de\n\n"
        f"You can also paste a Google Maps link in the same message "
        f"(any order) and I'll save it together with the activity."
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /help command"""
    await update.message.reply_text(
        "📚 *How to use this bot:*\n\n"
        "Send me a URL and I will:\n\n"
        "• Check if it's already in our database\n"
        "• Verify the website is alive\n"
        "• Extract: category, hours, address, prices, services\n"
        "• Calculate travel time from home\n"
        "• Save everything to the database\n\n"
        "*Optional Google Maps link:*\n"
        "Send the activity URL together with a Google Maps link "
        "(in any order). The Maps link will be saved to the activity.\n\n"
        "*Commands:*\n"
        "/start - Welcome message\n"
        "/help - Show this help\n\n"
        "*Example (1 URL):*\n"
        "https://www.wildpark-poing.de\n\n"
        "*Example (activity + maps):*\n"
        "https://www.wildpark-poing.de https://maps.app.goo.gl/abc123",
        parse_mode="Markdown",
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming messages - main pipeline.

    Accepts:
      - 1 URL  -> activity URL
      - 2 URLs -> one activity URL + one Google Maps URL (any order)
    """
    message_text = update.message.text
    if not message_text:
        return

    urls = extract_urls(message_text)

    if not urls:
        await update.message.reply_text(
            "🔗 Please send me a URL to analyze.\n\n"
            "Example: https://www.kindermuseum-muenchen.de\n"
            "Or send the activity URL together with a Google Maps link."
        )
        return

    activity_url, google_maps_link, error = split_activity_and_maps_urls(urls)
    if error:
        await update.message.reply_text(f"⚠️ {error}")
        return

    user_first = update.effective_user.first_name if update.effective_user else "user"
    print(f"Received URL from {user_first}: activity={activity_url}, maps={google_maps_link}")

    # Check if OpenAI API key is set
    if not os.getenv("OPENAI_API_KEY"):
        await update.message.reply_text(
            "❌ Sorry, the bot is not configured properly. OpenAI API key is missing."
        )
        return

    await process_url_pipeline(update, activity_url, google_maps_link=google_maps_link)


async def process_url_pipeline(update: Update, url: str, google_maps_link: Optional[str] = None) -> None:
    """
    Process a single URL through the full pipeline:
    1. Check if URL exists in all-urls.json
    2. Add URL to all-urls.json
    3. Check if URL is alive
    4. Run analyser
    5. Save to data.json
    """
    # Step 1: Check if URL already exists
    if url_exists_in_all_urls(url):
        await update.message.reply_text(
            f"ℹ️ This URL is already in our database:\n{url}\n\n"
            f"I'll re-analyze it and update the information."
        )
    else:
        # Step 2: Add to all-urls.json
        add_url_to_all_urls(url)
        await update.message.reply_text(f"📥 Added to URL database: {url[:50]}...")

    # Step 3: Check if alive
    status_msg = await update.message.reply_text(f"🔍 Checking if website is alive...")
    
    is_alive, content_type = await check_url_alive(url)
    
    # Update all-urls.json with alive status
    update_url_in_all_urls(url, is_alive, content_type)
    
    if not is_alive:
        await status_msg.edit_text(
            f"❌ Website is not accessible: {url}\n\n"
            f"The URL has been saved but cannot be analyzed right now."
        )
        return
    
    if content_type != "website":
        await status_msg.edit_text(
            f"⚠️ URL is not a website (type: {content_type}): {url}\n\n"
            f"Only HTML websites can be analyzed."
        )
        return
    
    # Step 4: Run analyser
    await status_msg.edit_text(f"🤖 Analyzing website content...\n\nThis may take a moment...")
    
    try:
        analysis = await analyse_url(url)
        
        if not analysis.available or analysis.error:
            await status_msg.edit_text(
                f"❌ Analysis failed: {url}\n\n"
                f"Error: {analysis.error or 'Unknown error'}"
            )
            return
        
        # Step 5: Save to DB (with optional Google Maps link supplied by user)
        save_analysis_to_data(analysis, google_maps_link=google_maps_link)

        # Send result
        await status_msg.edit_text(
            format_analysis_result(analysis, google_maps_link=google_maps_link),
            parse_mode="Markdown",
            disable_web_page_preview=True,
        )
        
        await update.message.reply_text("💾 Saved to database!")
        
    except Exception as e:
        print(f"Error analyzing URL: {e}")
        await status_msg.edit_text(
            f"❌ Failed to analyze: {url}\n\nError: {str(e)}"
        )


def main() -> None:
    """Start the bot"""
    print("🤖 Telegram bot is starting...")

    # Create application
    application = Application.builder().token(TOKEN).build()

    # Add handlers
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("✅ Bot is running and listening for messages...")

    # Run the bot
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
