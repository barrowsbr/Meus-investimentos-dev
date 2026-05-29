"""
polymarket.py
=============
Fetch predictive market data from Polymarket's Gamma API.
Focuses on Macro, Finance, Geopolitics and Tech/AI — no crypto.
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from typing import Optional

_POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com/events"
_USER_AGENT = "Mozilla/5.0 (compatible; InvestimentosBot/1.0; +https://github.com)"

# ── Keyword lists for category classification ──────────────────────────────

_CRYPTO_KW = [
    "bitcoin", "btc", " eth ", "ethereum", "crypto", "solana", "sol ",
    "binance", "kraken", "coinbase", "dogecoin", "xrp", "ripple",
    "stablecoin", "defi", "nft", "blockchain", "altcoin", "memecoin",
    " bnb ", "polygon", "avalanche", "avax", "litecoin",
]
# Removed false-positive tokens: "matic" (hits "diplomatic","automatic"),
# "eth" alone (hits "method","ethical"), "doge"/"ltc" (covered by full names),
# "bnb" unspaced (hits "airbnb") → replaced with " bnb "

_MACRO_KW = [
    "fed ", "federal reserve", "interest rate", "rate cut", "rate hike",
    "inflation", "recession", "gdp", "unemployment", "cpi", "pce",
    "treasury", "bond yield", "debt ceiling", "deficit", "imf", "world bank",
    "dollar", "usd", "euro ", "yen ", "brl", "ibovespa", "selic",
    "tariff", "trade war", "sanctions", "opec", "oil price", "crude",
    "fomc", "powell", "ecb", "boe ", "boj ", "central bank",
    "s&p 500", "nasdaq", "dow jones", "stock market", "bear market", "bull market",
    "ipo", "earnings", "revenue", "profit", "layoffs",
]

_GEO_KW = [
    "election", "president", "trump", "harris", "biden", "congress",
    "senate", "war", "conflict", "russia", "ukraine", "china ", "taiwan",
    "israel", "iran", "north korea", "nato", "g7", "g20",
    "nuclear", "ceasefire", "peace deal", "coup", "prime minister",
    "vote", "poll", "referendum", "sanction",
]

_TECH_AI_KW = [
    "openai", "gpt", "chatgpt", "agi", "artificial intelligence", "ai model",
    "llm", "claude", "gemini", "mistral", "anthropic",
    "apple", "nvidia", "meta ", "google", "microsoft", "amazon", "tesla",
    "spacex", "robotics", "autonomous", "self-driving", "quantum",
    "regulation ai", "ai regulation", "deepmind", "sam altman",
]

# Category metadata used in UI
CATEGORY_META = {
    "🏦 Macro & Finanças": {
        "color": "#38bdf8",
        "css_class": "macro",
        "desc": "Fed, juros, mercados, câmbio e economia global",
    },
    "🌍 Geopolítica": {
        "color": "#f59e0b",
        "css_class": "geo",
        "desc": "Eleições, conflitos, relações internacionais",
    },
    "🤖 Tech & IA": {
        "color": "#a78bfa",
        "css_class": "tech",
        "desc": "OpenAI, big tech, regulação de IA, inovação",
    },
    "⭐ Em Destaque": {
        "color": "#34d399",
        "css_class": "destaque",
        "desc": "Mercados de alto volume sem categoria definida",
    },
}


def _days_remaining(end_date_str: str) -> Optional[int]:
    """Return days until end_date, or None if unparseable or already past."""
    if not end_date_str:
        return None
    try:
        for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%S"):
            try:
                dt = datetime.strptime(end_date_str[:26], fmt)
                break
            except ValueError:
                continue
        else:
            return None
        dt = dt.replace(tzinfo=timezone.utc)
        delta = (dt - datetime.now(timezone.utc)).days
        return None if delta < 0 else delta
    except Exception:
        return None


_BINARY_LABELS = {"yes", "no", "sim", "não", "nao"}


def _parse_json_field(raw) -> list:
    """Parse a field that may be a native list or a JSON-encoded string."""
    if isinstance(raw, list):
        return raw
    try:
        return json.loads(raw) if raw else []
    except (json.JSONDecodeError, TypeError):
        return []


def _label_from_market(m: dict) -> str:
    """
    Best short label for one sub-market inside a categorical event.
    Priority: groupItemTitle → first non-binary outcome name → question (trimmed).
    """
    label = (m.get("groupItemTitle") or "").strip()
    if label:
        return label

    outcomes = _parse_json_field(m.get("outcomes", "[]"))
    for o in outcomes:
        if o.strip().lower() not in _BINARY_LABELS:
            return o.strip()

    q = (m.get("question") or "").strip().rstrip("?")
    for prefix in ("Will ", "Does ", "Is ", "Can ", "Has ", "Did ", "Do "):
        if q.startswith(prefix):
            q = q[len(prefix):]
            break
    return q[:50] if q else ""


def _yes_price(m: dict) -> Optional[float]:
    """
    Return the 'Yes' implied probability (0-1) for a binary sub-market.
    Prefers the outcome explicitly labelled Yes/Sim; falls back to index 0.
    """
    outcomes = _parse_json_field(m.get("outcomes", "[]"))
    prices   = _parse_json_field(m.get("outcomePrices", "[]"))
    if not outcomes or not prices:
        return None

    # Find the index of the "Yes" / "Sim" outcome
    yes_idx = next(
        (i for i, o in enumerate(outcomes) if o.strip().lower() in ("yes", "sim")),
        0,
    )
    try:
        pv = float(prices[yes_idx])
        return pv if 0.0 < pv < 1.0 else None
    except (ValueError, TypeError, IndexError):
        return None


def fetch_polymarket_events(limit: int = 60) -> list[dict]:
    """
    Fetches active, non-closed market prediction events from Polymarket.

    Handles two event shapes from the Gamma API:

    1. **Single-market** (binary or scalar): the market itself carries
       `outcomes` + `outcomePrices` with all answer options — read them directly.

    2. **Multi-market categorical**: the event has N sub-markets, each
       representing ONE possible outcome (e.g. each presidential candidate).
       Every sub-market is internally binary (Yes/No).  We extract the
       "Yes" price from each sub-market and use `groupItemTitle` as the
       outcome label.  This is the case that previously showed only "Yes/No".

    Returns cleaned list sorted by volume descending.
    """
    url = f"{_POLYMARKET_GAMMA_API}?limit={limit}&active=true&order=volume_24hr&ascending=false"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
        if not isinstance(data, list):
            data = data.get("data") or data.get("events") or []
    except Exception as _e:
        import sys
        print(f"[polymarket] fetch failed: {type(_e).__name__}: {_e}", file=sys.stderr)
        return []

    processed: list[dict] = []

    for event in data:
        try:
            markets = event.get("markets") or []
            if not markets:
                continue

            # Total volume across all sub-markets
            total_volume = sum(
                float(m.get("volume") or 0) for m in markets
                if m.get("volume") is not None
            )

            odds: list[dict] = []

            if len(markets) == 1:
                m        = markets[0]
                outcomes = _parse_json_field(m.get("outcomes", "[]"))
                prices   = _parse_json_field(m.get("outcomePrices", "[]"))
                for out, price_str in zip(outcomes, prices):
                    try:
                        pv = float(price_str)
                        if 0.0 < pv < 1.0:
                            odds.append({
                                "outcome": out,
                                "price":   pv,
                                "percent": round(pv * 100, 1),
                            })
                    except (ValueError, TypeError):
                        continue

            else:
                for m in markets:
                    label = _label_from_market(m)
                    if not label:
                        continue
                    pv = _yes_price(m)
                    if pv is None:
                        continue
                    odds.append({
                        "outcome": label,
                        "price":   pv,
                        "percent": round(pv * 100, 1),
                    })

            odds.sort(key=lambda x: x["percent"], reverse=True)
            # Skip if empty or if one outcome has ~100% — market is effectively resolved
            if not odds or odds[0]["percent"] >= 99:
                continue

            end_date_str = event.get("endDate", "")
            days_left    = _days_remaining(end_date_str)

            # Note: active=true in the API already excludes resolved/closed markets.
            # We do NOT filter by days_left here because many high-volume Polymarket
            # events stay in "pending resolution" state with endDate in the past while
            # still being tradeable and interesting to display.

            processed.append({
                "id":          event.get("id"),
                "title":       event.get("title", "Unknown Event"),
                "description": event.get("description") or "",
                "slug":        event.get("slug", ""),
                "url":         f"https://polymarket.com/event/{event.get('slug', '')}",
                "volume":      total_volume,
                "end_date":    end_date_str,
                "days_left":   days_left,
                "odds":        odds,
                "is_binary":   len(odds) == 2,
            })
        except Exception:
            continue

    processed.sort(key=lambda x: x["volume"], reverse=True)
    return processed


def get_curated_crypto_politics_markets() -> dict[str, list[dict]]:
    """
    Fetches and categorises markets for the investment dashboard.
    Excludes crypto. Focuses on Macro/Finance, Geopolitics and Tech/AI.
    """
    events = fetch_polymarket_events(limit=200)

    categories: dict[str, list[dict]] = {
        "🏦 Macro & Finanças": [],
        "🌍 Geopolítica": [],
        "🤖 Tech & IA": [],
        "⭐ Em Destaque": [],
    }

    for ev in events:
        text = (ev["title"] + " " + ev["description"]).lower()

        # Hard-exclude crypto events regardless of other matches
        if any(kw in text for kw in _CRYPTO_KW):
            continue

        if any(kw in text for kw in _MACRO_KW):
            categories["🏦 Macro & Finanças"].append(ev)
        elif any(kw in text for kw in _GEO_KW):
            categories["🌍 Geopolítica"].append(ev)
        elif any(kw in text for kw in _TECH_AI_KW):
            categories["🤖 Tech & IA"].append(ev)
        else:
            categories["⭐ Em Destaque"].append(ev)

    # Top 5 per category sorted by volume (already sorted globally)
    for cat in categories:
        categories[cat] = categories[cat][:10]

    return {k: v for k, v in categories.items() if v}


if __name__ == "__main__":
    markets = get_curated_crypto_politics_markets()
    for cat, evs in markets.items():
        print(f"\n--- {cat} ({len(evs)}) ---")
        for ev in evs:
            days = f"{ev['days_left']}d" if ev["days_left"] is not None else "?"
            print(f"  [{days}] {ev['title']} (Vol: ${ev['volume']:,.0f})")
            for odd in ev["odds"][:2]:
                print(f"       {odd['outcome']}: {odd['percent']}%")
