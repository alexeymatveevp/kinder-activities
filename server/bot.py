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
from urllib.parse import quote

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

from analyser import analyse_url, CrawlResult
from data_service import normalize_url, load_activities, save_activities

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

# Request settings for alive check
TIMEOUT = 10
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def extract_urls(text: str) -> list[str]:
    """Extract URLs from text"""
    matches = URL_REGEX.findall(text)
    return list(set(matches))


def get_google_maps_url(address: str) -> str:
    """Generate Google Maps URL from address"""
    return f"https://www.google.com/maps/search/?api=1&query={quote(address)}"


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
    """
    headers = {"User-Agent": USER_AGENT}
    timeout = aiohttp.ClientTimeout(total=TIMEOUT)
    
    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            # Try HEAD first
            try:
                async with session.head(url, timeout=timeout, allow_redirects=True, ssl=False) as response:
                    is_alive = response.status < 400
                    content_type = get_content_type_label(response.headers.get("Content-Type"))
                    return (is_alive, content_type)
            except aiohttp.ClientError:
                # Try GET if HEAD fails
                async with session.get(url, timeout=timeout, allow_redirects=True, ssl=False) as response:
                    is_alive = response.status < 400
                    content_type = get_content_type_label(response.headers.get("Content-Type"))
                    return (is_alive, content_type)
    except Exception:
        return (False, "unknown")


# ============================================================
# Save to data.json (like run_analyser_for_all_urls.py)
# ============================================================

def save_analysis_to_data(result: CrawlResult) -> bool:
    """Save analysis result to data.json. Returns True if successful."""
    activities = load_activities()
    
    # Check if already exists
    normalized = normalize_url(result.url)
    for i, activity in enumerate(activities):
        if normalize_url(activity.get("url", "")) == normalized:
            # Update existing
            activities[i] = build_activity_dict(result)
            save_activities(activities)
            return True
    
    # Add new
    activities.append(build_activity_dict(result))
    save_activities(activities)
    return True


def build_activity_dict(result: CrawlResult) -> dict:
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
    if result.prices:
        activity["prices"] = result.prices
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

def format_analysis_result(result: CrawlResult) -> str:
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

    if result.description:
        message += f"📝 *Description:* {result.description}\n"

    if result.category:
        message += f"🏷️ *Category:* {result.category}\n"

    if result.address:
        maps_url = get_google_maps_url(result.address)
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
        f"https://www.kindermuseum-muenchen.de"
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
        "*Commands:*\n"
        "/start - Welcome message\n"
        "/help - Show this help\n\n"
        "*Example:*\n"
        "Just send: https://www.wildpark-poing.de",
        parse_mode="Markdown",
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming messages - main pipeline"""
    message_text = update.message.text
    if not message_text:
        return

    # Extract URLs from message
    urls = extract_urls(message_text)

    if not urls:
        await update.message.reply_text(
            "🔗 Please send me a URL to analyze.\n\n"
            "Example: https://www.kindermuseum-muenchen.de"
        )
        return

    print(f"Received {len(urls)} URL(s) from {update.effective_user.first_name}")

    # Check if OpenAI API key is set
    if not os.getenv("OPENAI_API_KEY"):
        await update.message.reply_text(
            "❌ Sorry, the bot is not configured properly. OpenAI API key is missing."
        )
        return

    # Process each URL
    for url in urls:
        await process_url_pipeline(update, url)


async def process_url_pipeline(update: Update, url: str) -> None:
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
        
        # Step 5: Save to data.json
        save_analysis_to_data(analysis)
        
        # Send result
        await status_msg.edit_text(
            format_analysis_result(analysis),
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
