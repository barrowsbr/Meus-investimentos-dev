"""
polymarket.py
=============
Fetch predictive market data from Polymarket's Gamma API.
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime
from typing import Optional

_POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com/events"
_USER_AGENT = "Mozilla/5.0 (compatible; InvestimentosBot/1.0; +https://github.com)"


def fetch_polymarket_events(
    limit: int = 15,
    active: bool = True,
    closed: bool = False,
    tags: Optional[list[str]] = None,
) -> list[dict]:
    """
    Fetches real-time market prediction events from Polymarket.
    Returns a cleaned list of dictionary representations of the markets.
    """
    # Base URL construction
    url = f"{_POLYMARKET_GAMMA_API}?limit={limit}&active={str(active).lower()}&closed={str(closed).lower()}"
    
    # Unfortunately, the Gamma API doesn't cleanly filter by multiple custom tags in the URL easily,
    # so we fetch slightly more and filter client-side if tags are specified.
    
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception:
        return []

    processed_events = []
    
    for event in data:
        # Check tags if a filter was provided
        if tags is not None:
            event_tags = [t.get("slug", "").lower() for t in event.get("tags", [])]
            if not any(tag.lower() in event_tags for tag in tags):
                continue

        # Polymarket events usually contain multiple "markets" (e.g. Yes/No questions)
        markets = event.get("markets", [])
        if not markets:
            continue
            
        # For simplicity, we grab the first (primary) market in the event
        primary_market = markets[0]
        
        # Outcomes and their current prices (prices roughly equate to percentage chance, e.g. 0.65 = 65%)
        # Some markets are binary (Yes/No), others are multi-choice
        try:
            outcomes = json.loads(primary_market.get("outcomes", "[]"))
            prices = json.loads(primary_market.get("outcomePrices", "[]"))
        except json.JSONDecodeError:
            outcomes, prices = [], []

        # Zip outcomes and prices, ignore 0.0 or 1.0 (sometimes means closed/inactive edge cases)
        odds = []
        for out, price_str in zip(outcomes, prices):
            try:
                price_val = float(price_str)
                odds.append({"outcome": out, "price": price_val, "percent": round(price_val * 100, 1)})
            except ValueError:
                continue

        # Sort odds by highest percentage
        odds.sort(key=lambda x: x["percent"], reverse=True)

        if not odds:
            continue

        start_date_str = event.get("startDate", "")
        end_date_str = event.get("endDate", "")
        
        processed_events.append({
            "id": event.get("id"),
            "title": event.get("title", "Unknown Event"),
            "description": event.get("description", ""),
            "slug": event.get("slug", ""),
            "url": f"https://polymarket.com/event/{event.get('slug')}",
            "image": event.get("image", ""),
            "volume": primary_market.get("volume", 0),
            "start_date": start_date_str,
            "end_date": end_date_str,
            "odds": odds,
            "primary_market_question": primary_market.get("question", ""),
        })

    # Sort by volume to ensure we show the most active/relevant markets
    processed_events.sort(key=lambda x: float(x["volume"] or 0), reverse=True)
    return processed_events

def get_curated_crypto_politics_markets() -> dict[str, list[dict]]:
    """
    Convenience function that fetches and categorizes markets relevant to 
    an investment dashboard (Crypto, Politics/Macro, Tech).
    """
    # Fetch a larger batch so we can split them up locally
    events = fetch_polymarket_events(limit=50)
    
    categories = {
        "Crypto & Blockchain": [],
        "Macroeconomia & Política": [],
        "Tech & AI": [],
        "Em Destaque (Geral)": []
    }
    
    for ev in events:
        title = ev["title"].lower()
        desc = ev["description"].lower()
        
        assigned = False
        
        if any(kw in title for kw in ["bitcoin", "btc", "eth", "ethereum", "crypto", "solana", "binance", "kraken"]):
            categories["Crypto & Blockchain"].append(ev)
            assigned = True
        elif any(kw in title for kw in ["election", "president", "trump", "biden", "fed", "interest rate", "sec"]):
            categories["Macroeconomia & Política"].append(ev)
            assigned = True
        elif any(kw in title for kw in ["openai", "gpt", "agi", "tech", "apple", "nvidia", "meta"]):
            categories["Tech & AI"].append(ev)
            assigned = True
            
        if not assigned:
            categories["Em Destaque (Geral)"].append(ev)
            
    # Take top 4 from each to not overwhelm the UI
    for cat in categories:
        categories[cat] = categories[cat][:4]
        
    # Remove empty categories
    return {k: v for k, v in categories.items() if v}

if __name__ == "__main__":
    # Smoke test locally
    markets = get_curated_crypto_politics_markets()
    for cat, evs in markets.items():
        print(f"--- {cat} ---")
        for ev in evs:
            print(f"{ev['title']} (Vol: ${float(ev['volume']):,.0f})")
            for odd in ev["odds"]:
                print(f"  - {odd['outcome']}: {odd['percent']}%")
            print()
