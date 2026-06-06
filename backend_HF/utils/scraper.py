import re
import requests
from html.parser import HTMLParser

class HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reset()
        self.fed = []
        self.in_ignored_tag = False
        self.ignored_tags = {"script", "style", "head", "meta", "link", "noscript"}

    def handle_starttag(self, tag, attrs):
        if tag.lower() in self.ignored_tags:
            self.in_ignored_tag = True

    def handle_endtag(self, tag):
        if tag.lower() in self.ignored_tags:
            self.in_ignored_tag = False

    def handle_data(self, data):
        if not self.in_ignored_tag:
            self.fed.append(data)

    def get_text(self):
        raw = "".join(self.fed)
        clean = "\n".join(line.strip() for line in raw.splitlines() if line.strip())
        return clean

def scrape_url(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    print(f"[Scraper] Requesting URL: {url}")
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()
    
    content_type = response.headers.get("Content-Type", "").lower()
    if "html" in content_type:
        print("[Scraper] HTML content detected, parsing text...")
        parser = HTMLTextExtractor()
        parser.feed(response.text)
        return parser.get_text()
    else:
        print("[Scraper] Non-HTML text content returned.")
        return response.text
