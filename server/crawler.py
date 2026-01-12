#!/usr/bin/env python
"""
Scrapy-based web crawler for extracting website content.
Runs as a standalone script and outputs JSON to stdout.
"""
import sys
import json
from urllib.parse import urlparse, urljoin

import scrapy
from scrapy.crawler import CrawlerProcess
from scrapy.signalmanager import dispatcher
from scrapy import signals


# Priority keywords for link sorting
PRIORITY_KEYWORDS = [
    "kontakt", "contact",
    "preise", "prices", "eintritt", "admission", "tickets",
    "öffnungszeiten", "opening", "hours", "zeiten",
    "anfahrt", "directions", "adresse", "address",
    "angebot", "leistungen", "services",
    "about", "über", "info",
]

MAX_PAGES = 10  # Max pages to crawl per site


class ContentSpider(scrapy.Spider):
    """Spider that crawls a website and extracts text content."""
    
    name = "content_spider"
    
    def __init__(self, start_url: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.start_url = start_url
        self.start_urls = [start_url]
        
        # Parse base domain
        parsed = urlparse(start_url)
        self.allowed_domains = [parsed.hostname]
        self.base_hostname = parsed.hostname
        
        # Track visited URLs and collected content
        self.visited_urls = set()
        self.pages_content = []
        self.pending_urls = []
        self.status_code = None
        self.error = None
    
    def parse(self, response):
        """Parse a page and extract content."""
        url = response.url
        
        # Track status code for main page
        if url == self.start_url or len(self.visited_urls) == 0:
            self.status_code = response.status
        
        # Skip if already visited
        if url in self.visited_urls:
            return
        
        self.visited_urls.add(url)
        
        # Extract text content
        text = self._extract_text(response)
        
        if len(text) > 100:  # Only add meaningful content
            is_main = url == self.start_url
            self.pages_content.append({
                "url": url,
                "content": text,
                "is_main": is_main,
            })
        
        # Only follow links from main page
        if url == self.start_url and len(self.visited_urls) < MAX_PAGES:
            # Extract and prioritize links
            links = self._extract_links(response)
            prioritized = self._prioritize_links(links)
            
            # Follow top priority links
            for link in prioritized[:MAX_PAGES - 1]:
                if link not in self.visited_urls:
                    yield scrapy.Request(link, callback=self.parse)
    
    def _extract_text(self, response) -> str:
        """Extract clean text from response."""
        # Remove script, style, nav, header, footer, aside elements
        selector = response.xpath(
            '//body//*[not(self::script or self::style or self::nav or '
            'self::header or self::footer or self::aside or self::iframe or '
            'self::noscript)]//text()'
        )
        
        texts = selector.getall()
        text = " ".join(t.strip() for t in texts if t.strip())
        
        # No limit on text length - let LLM service handle truncation if needed
        return text
    
    def _extract_links(self, response) -> list[str]:
        """Extract internal links from response."""
        links = set()
        
        for href in response.css("a::attr(href)").getall():
            try:
                absolute_url = urljoin(response.url, href)
                parsed = urlparse(absolute_url)
                
                # Only internal links
                if parsed.hostname == self.base_hostname:
                    # Remove hash
                    clean_url = f"{parsed.scheme}://{parsed.hostname}{parsed.path}"
                    if parsed.query:
                        clean_url += f"?{parsed.query}"
                    
                    # Skip non-content files
                    skip_extensions = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".css", ".js", ".xml", ".ico"]
                    if not any(clean_url.lower().endswith(ext) for ext in skip_extensions):
                        links.add(clean_url)
            except Exception:
                pass
        
        return list(links)
    
    def _prioritize_links(self, links: list[str]) -> list[str]:
        """Sort links by priority keywords."""
        def score(url: str) -> int:
            url_lower = url.lower()
            return sum(1 for kw in PRIORITY_KEYWORDS if kw in url_lower)
        
        return sorted(links, key=score, reverse=True)


def crawl_url(url: str) -> dict:
    """
    Crawl a URL and return extracted content.
    Returns a dict with: url, available, status_code, error, pages
    """
    result = {
        "url": url,
        "available": False,
        "status_code": None,
        "error": None,
        "pages": [],
    }
    
    spider_instance = None
    
    def spider_opened(spider):
        nonlocal spider_instance
        spider_instance = spider
    
    def spider_error(failure, response, spider):
        nonlocal result
        result["error"] = str(failure.value)
    
    # Configure Scrapy process
    process = CrawlerProcess(
        settings={
            "LOG_ENABLED": False,
            "USER_AGENT": "Mozilla/5.0 (compatible; KinderActivitiesBot/1.0)",
            "ROBOTSTXT_OBEY": True,
            "DOWNLOAD_TIMEOUT": 10,
            "CONCURRENT_REQUESTS": 1,
            "DEPTH_LIMIT": 1,
        }
    )
    
    # Connect signals
    dispatcher.connect(spider_opened, signal=signals.spider_opened)
    dispatcher.connect(spider_error, signal=signals.spider_error)
    
    try:
        process.crawl(ContentSpider, start_url=url)
        process.start()
        
        # Get results from spider
        if spider_instance:
            result["status_code"] = spider_instance.status_code
            result["pages"] = spider_instance.pages_content
            result["available"] = spider_instance.status_code is not None and spider_instance.status_code < 400
            result["error"] = spider_instance.error
        
    except Exception as e:
        result["error"] = str(e)
    
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python crawler.py <url>"}))
        sys.exit(1)
    
    target_url = sys.argv[1]
    crawl_result = crawl_url(target_url)
    
    # Output JSON to stdout
    print(json.dumps(crawl_result, ensure_ascii=False))

