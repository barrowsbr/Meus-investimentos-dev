"""Market data: quotes via yfinance + FX fallback chain — port of lib/cotacoes.ts."""
import asyncio
from datetime import datetime, timezone
from typing import Any

import aiohttp
import yfinance as yf

from app.core.logic import identificar_setor
from app.models.schemas import FxRates, Quote
from app.services.cache import market_cache

DEFAULTS_FX = FxRates(USDBRL=5.7, EURBRL=6.4, GBPBRL=7.6, CADBRL=4.1)

INTL_SUFFIX_MAP: dict[str, str] = {
    "VWRA": "VWRA.L",
    "VWCE": "VWCE.DE",
    "DPM": "DPM.TO",
    "CSPX": "CSPX.L",
    "EIMI": "EIMI.L",
    "IWDA": "IWDA.L",
}

# Map tickers to their actual currencies (overrides suffix-based detection)
TICKER_CURRENCY_OVERRIDE: dict[str, str] = {
    "VWRA.L": "USD",      # LSE but priced in USD
    "CSPX.L": "GBP",      # LSE in GBP
    "EIMI.L": "GBP",      # LSE in GBP
    "IWDA.L": "USD",      # LSE but priced in USD
    "VWCE.DE": "EUR",     # Xetra/Frankfurt in EUR
    "ASML.AS": "EUR",     # Amsterdam exchange in EUR
    "DPM.TO": "CAD",      # Toronto exchange in CAD
}


def yahoo_ticker(ticker: str, moeda: str = "BRL", corretora: str = "") -> str:
    t = ticker.upper().strip()
    if "." in t:
        return t
    if t in ("BTC", "BTC-USD"):
        return "BTC-USD"
    if t in ("ETH", "ETH-USD"):
        return "ETH-USD"
    t_clean = t.replace(".SA", "").replace(".L", "").replace(".AS", "").replace(".DE", "").replace(".TO", "")
    if t_clean in INTL_SUFFIX_MAP:
        return INTL_SUFFIX_MAP[t_clean]
    # Handle Amsterdam exchange
    if t == "ASML":
        return "ASML.AS"
    setor = identificar_setor(t)
    if setor in ("Ações Brasil", "ETF", "FIIs", "BDRs"):
        return f"{t}.SA"
    return t


def fx_to_brl(currency: str, fx: FxRates) -> float:
    cur = (currency or "BRL").upper()
    if cur == "BRL":
        return 1.0
    if cur == "USD":
        return fx.USDBRL
    if cur == "EUR":
        return fx.EURBRL
    if cur == "GBP":
        return fx.GBPBRL
    if cur == "CAD":
        return fx.CADBRL
    return 1.0


# --- FX sources ---

async def _fetch_fx_yahoo() -> FxRates:
    fx_tickers = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"]
    fx_map = {
        "BRL=X": "USDBRL",
        "USDBRL=X": "USDBRL",
        "EURBRL=X": "EURBRL",
        "CADBRL=X": "CADBRL",
        "GBPBRL=X": "GBPBRL",
    }

    def _download():
        data = yf.download(fx_tickers, period="1d", auto_adjust=True, progress=False)
        return data

    loop = asyncio.get_event_loop()
    data = await asyncio.wait_for(loop.run_in_executor(None, _download), timeout=20.0)

    result = DEFAULTS_FX.model_dump()
    updated = 0

    for sym in fx_tickers:
        try:
            close = data["Close"][sym]
            val = float(close.dropna().iloc[-1])
            key = fx_map.get(sym)
            if key and val > 0:
                result[key] = val
                updated += 1
        except Exception:
            pass

    if updated == 0:
        raise RuntimeError("Yahoo FX: no rates returned")
    return FxRates(**result)


async def _fetch_fx_awesome() -> FxRates:
    url = "https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL,CAD-BRL"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                raise RuntimeError(f"AwesomeAPI HTTP {resp.status}")
            data = await resp.json(content_type=None)

    usdbrl = float(data.get("USDBRL", {}).get("bid", 0) or 0)
    if usdbrl == 0:
        raise RuntimeError("AwesomeAPI: no USDBRL rate")
    return FxRates(
        USDBRL=usdbrl,
        EURBRL=float(data.get("EURBRL", {}).get("bid", 0) or 0) or DEFAULTS_FX.EURBRL,
        GBPBRL=float(data.get("GBPBRL", {}).get("bid", 0) or 0) or DEFAULTS_FX.GBPBRL,
        CADBRL=float(data.get("CADBRL", {}).get("bid", 0) or 0) or DEFAULTS_FX.CADBRL,
    )


async def _fetch_fx_open_exchange() -> FxRates:
    url = "https://open.er-api.com/v6/latest/BRL"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                raise RuntimeError(f"ExchangeRate-API HTTP {resp.status}")
            data = await resp.json(content_type=None)

    rates = data.get("rates", {})
    usd = rates.get("USD")
    if not usd:
        raise RuntimeError("ExchangeRate-API: no USD rate")
    return FxRates(
        USDBRL=1 / usd,
        EURBRL=1 / rates["EUR"] if rates.get("EUR") else DEFAULTS_FX.EURBRL,
        GBPBRL=1 / rates["GBP"] if rates.get("GBP") else DEFAULTS_FX.GBPBRL,
        CADBRL=1 / rates["CAD"] if rates.get("CAD") else DEFAULTS_FX.CADBRL,
    )


async def fetch_fx_rates() -> tuple[FxRates, str]:
    sources = [
        ("yahoo", _fetch_fx_yahoo),
        ("awesomeapi", _fetch_fx_awesome),
        ("exchangerate-api", _fetch_fx_open_exchange),
    ]
    for name, fn in sources:
        try:
            fx = await asyncio.wait_for(fn(), timeout=15.0)
            return fx, name
        except Exception:
            pass
    return DEFAULTS_FX, "defaults"


# --- Quotes via yfinance ---

def _currency_from_yahoo_ticker(sym: str) -> str:
    s = sym.upper()
    
    # Check explicit overrides first
    if s in TICKER_CURRENCY_OVERRIDE:
        return TICKER_CURRENCY_OVERRIDE[s]
    
    # Fallback to suffix-based detection
    if s.endswith(".SA"):
        return "BRL"
    if s.endswith(".L"):
        return "GBP"
    if s.endswith(".DE"):
        return "EUR"
    if s.endswith(".TO"):
        return "CAD"
    if s.endswith(".AS"):
        return "EUR"
    return "USD"


def _fetch_quotes_sync(yahoo_tickers: list[str]) -> dict[str, Quote]:
    """Fetches quotes using yf.download() batch — no per-ticker HTTP calls."""
    if not yahoo_tickers:
        return {}
    results: dict[str, Quote] = {}
    batch_size = 20

    for i in range(0, len(yahoo_tickers), batch_size):
        batch = yahoo_tickers[i : i + batch_size]
        try:
            data = yf.download(
                batch,
                period="5d",
                auto_adjust=True,
                progress=False,
                group_by="ticker",
            )
            if data.empty:
                continue

            for sym in batch:
                try:
                    # Handle both single and multi-ticker results
                    try:
                        if len(batch) == 1:
                            close_series = data["Close"]
                        else:
                            close_series = data["Close"][sym]
                    except (KeyError, TypeError):
                        # Fallback: try direct access
                        close_series = data[sym]["Close"] if sym in data.columns else None
                        if close_series is None:
                            continue

                    close_vals = close_series.dropna()
                    if len(close_vals) < 1:
                        continue

                    price = float(close_vals.iloc[-1])
                    prev_close = float(close_vals.iloc[-2]) if len(close_vals) >= 2 else price

                    if price <= 0:
                        continue

                    change = price - prev_close
                    change_pct = (change / prev_close * 100) if prev_close else 0.0

                    results[sym] = Quote(
                        price=price,
                        change=change,
                        change_percent=change_pct,
                        currency=_currency_from_yahoo_ticker(sym),
                        name=sym,
                    )
                except Exception as e:
                    print(f"[DEBUG] Error fetching {sym}: {e}")
        except Exception as e:
            print(f"[DEBUG] Batch {batch} download failed: {e}")

    return results


async def fetch_quotes(yahoo_tickers: list[str]) -> tuple[dict[str, Quote], str]:
    if not yahoo_tickers:
        return {}, "empty"

    loop = asyncio.get_event_loop()
    try:
        quotes = await asyncio.wait_for(
            loop.run_in_executor(None, _fetch_quotes_sync, yahoo_tickers),
            timeout=35.0,
        )
        if quotes:
            return quotes, "yfinance"
    except asyncio.TimeoutError:
        pass
    except Exception:
        pass

    return {}, "none"


# --- Main orchestrator ---

async def fetch_cotacoes(
    tickers: list[dict[str, str]],
) -> dict[str, Any]:
    errors: list[str] = []

    yahoo_map: dict[str, str] = {}
    for t in tickers:
        yt = yahoo_ticker(t["ticker"], t.get("moeda", "BRL"), t.get("corretora", ""))
        yahoo_map[t["ticker"]] = yt

    unique_yahoo = list(set(yahoo_map.values()))

    cache_key = "fx_rates"
    cached_fx = market_cache.get(cache_key)
    if cached_fx:
        fx, fx_source = cached_fx
    else:
        try:
            fx, fx_source = await fetch_fx_rates()
            market_cache.set(cache_key, (fx, fx_source))
            if fx_source == "defaults":
                errors.append("FX: todas as fontes falharam, usando valores padrão")
        except Exception as e:
            errors.append(f"FX error: {e}")
            fx, fx_source = DEFAULTS_FX, "defaults"

    quotes_key = f"quotes:{':'.join(sorted(unique_yahoo))}"
    cached_quotes = market_cache.get(quotes_key)
    if cached_quotes:
        raw_quotes, quotes_source = cached_quotes
    else:
        try:
            raw_quotes, quotes_source = await fetch_quotes(unique_yahoo)
            market_cache.set(quotes_key, (raw_quotes, quotes_source))
            if quotes_source == "none":
                errors.append("Nenhuma fonte de cotações respondeu")
        except Exception as e:
            errors.append(f"Quotes error: {e}")
            raw_quotes, quotes_source = {}, "error"

    quotes: dict[str, Quote] = {}
    for original_ticker, yahoo_tk in yahoo_map.items():
        if yahoo_tk in raw_quotes:
            quotes[original_ticker] = raw_quotes[yahoo_tk]

    return {
        "quotes": quotes,
        "fx": fx,
        "fx_source": fx_source,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "errors": errors,
    }
