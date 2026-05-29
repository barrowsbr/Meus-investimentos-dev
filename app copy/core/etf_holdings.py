"""
etf_holdings.py
===============
Fetches ETF holdings and persists them in Google Sheets (aba 'composicao').

Fetch strategy (4 tiers per ticker):
  1. Financial Modeling Prep API (free, requires FMP_API_KEY in st.secrets)
  2. Live provider URL (iShares, SSGA, Invesco — blocked in some cloud envs)
  3. Yahoo Finance quoteSummary API
  4. Embedded fallback (hardcoded top-25 holdings, Q1-2025)

Persistence:
  - save_to_gsheets(per_etf)  → writes to 'composicao' tab
  - load_from_gsheets()       → reads 'composicao', returns (df_weights, updated_at)
  - compute_from_stored(...)  → uses stored weights + current prices (no re-fetch)
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

import pandas as pd
import requests
import streamlit as st

# ── HTTP headers ─────────────────────────────────────────────────────────────
_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

# ── Sector constants ─────────────────────────────────────────────────────────
_LOOKTHROUGH_SECTORS = {'ETF USA', 'ETF'}
_RF_LIKE_SECTORS     = {'Renda Fixa', 'Renda Fixa USD', 'Caixa/Liquidez', 'ETF USA', 'ETF'}

# ── GSheets schema ───────────────────────────────────────────────────────────
COMPOSICAO_TAB = 'composicao'
COMPOSICAO_COLS = ['etf', 'ticker', 'name', 'weight_pct', 'source', 'updated_at']

# ── Embedded fallback (Q1-2025, approximate) ─────────────────────────────────
_EMBEDDED: dict[str, list[tuple]] = {
    'QQQ': [
        ('AAPL',  'Apple Inc',                  8.9),
        ('MSFT',  'Microsoft Corp',             8.1),
        ('NVDA',  'NVIDIA Corp',                8.0),
        ('AMZN',  'Amazon.com Inc',             5.4),
        ('META',  'Meta Platforms',             4.8),
        ('AVGO',  'Broadcom Inc',               4.6),
        ('GOOGL', 'Alphabet Class A',           4.2),
        ('TSLA',  'Tesla Inc',                  3.6),
        ('GOOG',  'Alphabet Class C',           3.5),
        ('COST',  'Costco Wholesale',           2.7),
        ('NFLX',  'Netflix Inc',                1.9),
        ('AMD',   'Advanced Micro Devices',     1.7),
        ('ADBE',  'Adobe Inc',                  1.5),
        ('QCOM',  'Qualcomm Inc',               1.5),
        ('INTU',  'Intuit Inc',                 1.4),
        ('TXN',   'Texas Instruments',          1.3),
        ('AMAT',  'Applied Materials',          1.2),
        ('AMGN',  'Amgen Inc',                  1.1),
        ('HON',   'Honeywell International',    1.0),
        ('SBUX',  'Starbucks Corp',             0.9),
        ('ISRG',  'Intuitive Surgical',         0.9),
        ('MU',    'Micron Technology',          0.8),
        ('LRCX',  'Lam Research',               0.8),
        ('PDD',   'PDD Holdings',               0.8),
        ('REGN',  'Regeneron Pharmaceuticals',  0.7),
    ],
    'VWRA.L': [
        ('AAPL',  'Apple Inc',                  4.2),
        ('MSFT',  'Microsoft Corp',             3.9),
        ('NVDA',  'NVIDIA Corp',                3.8),
        ('AMZN',  'Amazon.com Inc',             2.5),
        ('META',  'Meta Platforms',             2.3),
        ('GOOGL', 'Alphabet Class A',           2.0),
        ('AVGO',  'Broadcom Inc',               1.8),
        ('TSLA',  'Tesla Inc',                  1.7),
        ('GOOG',  'Alphabet Class C',           1.5),
        ('BRK-B', 'Berkshire Hathaway B',       1.3),
        ('JPM',   'JPMorgan Chase',             1.2),
        ('LLY',   'Eli Lilly',                  1.0),
        ('V',     'Visa Inc',                   0.9),
        ('XOM',   'Exxon Mobil',                0.8),
        ('JNJ',   'Johnson & Johnson',          0.8),
        ('UNH',   'UnitedHealth Group',         0.8),
        ('MA',    'Mastercard',                 0.8),
        ('COST',  'Costco Wholesale',           0.7),
        ('HD',    'Home Depot',                 0.7),
        ('ASML',  'ASML Holding',               0.7),
        ('PG',    'Procter & Gamble',           0.7),
        ('WMT',   'Walmart Inc',                0.6),
        ('BAC',   'Bank of America',            0.6),
        ('NFLX',  'Netflix Inc',                0.6),
        ('ABBV',  'AbbVie Inc',                 0.6),
    ],
    'SPY': [
        ('AAPL',  'Apple Inc',                  7.1),
        ('MSFT',  'Microsoft Corp',             6.5),
        ('NVDA',  'NVIDIA Corp',                6.3),
        ('AMZN',  'Amazon.com Inc',             3.7),
        ('META',  'Meta Platforms',             2.8),
        ('AVGO',  'Broadcom Inc',               2.5),
        ('GOOGL', 'Alphabet Class A',           2.2),
        ('TSLA',  'Tesla Inc',                  2.0),
        ('GOOG',  'Alphabet Class C',           1.9),
        ('BRK-B', 'Berkshire Hathaway B',       1.7),
        ('JPM',   'JPMorgan Chase',             1.5),
        ('LLY',   'Eli Lilly',                  1.4),
        ('UNH',   'UnitedHealth Group',         1.3),
        ('XOM',   'Exxon Mobil',                1.3),
        ('COST',  'Costco Wholesale',           1.2),
        ('V',     'Visa Inc',                   1.1),
        ('NFLX',  'Netflix Inc',                1.1),
        ('MA',    'Mastercard',                 1.0),
        ('HD',    'Home Depot',                 0.9),
        ('PG',    'Procter & Gamble',           0.9),
        ('JNJ',   'Johnson & Johnson',          0.8),
        ('WMT',   'Walmart Inc',                0.8),
        ('ABBV',  'AbbVie Inc',                 0.8),
        ('BAC',   'Bank of America',            0.7),
        ('CRM',   'Salesforce Inc',             0.7),
    ],
}
_EMBEDDED['IVV']    = _EMBEDDED['SPY']
_EMBEDDED['IVVB11'] = _EMBEDDED['SPY']
_EMBEDDED['VWRA']   = _EMBEDDED['VWRA.L']


# ─────────────────────────── Column helpers ──────────────────────────────────

def _find_col(df: pd.DataFrame, keywords: list[str]) -> Optional[str]:
    for kw in keywords:
        for col in df.columns:
            if kw.lower() in str(col).lower():
                return col
    return None


def _normalize_holdings(df: pd.DataFrame) -> Optional[pd.DataFrame]:
    ticker_col = _find_col(df, ['ticker', 'symbol', 'símbolo', 'ativo'])
    name_col   = _find_col(df, ['name', 'nome', 'description', 'holding name'])
    weight_col = _find_col(df, ['weight', 'peso', 'part', '%'])
    if not weight_col:
        return None
    result = pd.DataFrame()
    result['ticker']     = df[ticker_col].astype(str).str.strip() if ticker_col else pd.Series([''] * len(df))
    result['name']       = df[name_col].astype(str).str.strip()   if name_col   else result['ticker']
    result['weight_pct'] = pd.to_numeric(df[weight_col], errors='coerce').fillna(0.0)
    result = result[result['weight_pct'] > 0].copy()
    result = result[~result['ticker'].isin(['', 'nan', '-', 'N/A', 'Cash', 'CASH'])].copy()
    return result.reset_index(drop=True)


# ─────────────────────────── Provider fetchers ───────────────────────────────

def _try_get(url: str, timeout: int = 15) -> Optional[bytes]:
    try:
        r = requests.get(url, headers=_HEADERS, timeout=timeout)
        if r.status_code == 200 and len(r.content) > 500:
            return r.content
    except Exception:
        pass
    return None


def _fetch_fmp(ticker: str) -> Optional[pd.DataFrame]:
    """Financial Modeling Prep — free tier, needs FMP_API_KEY in st.secrets."""
    try:
        key = st.secrets.get('FMP_API_KEY', '')
        if not key:
            return None
        url = f'https://financialmodelingprep.com/api/v3/etf-holder/{ticker}?apikey={key}'
        content = _try_get(url)
        if not content:
            return None
        import json
        data = json.loads(content)
        if not isinstance(data, list) or not data:
            return None
        rows = [
            {
                'ticker':     h.get('asset', ''),
                'name':       h.get('name', h.get('asset', '')),
                'weight_pct': float(h.get('weightPercentage', 0)),
            }
            for h in data
        ]
        df = pd.DataFrame(rows)
        df = df[df['weight_pct'] > 0].copy()
        return df.reset_index(drop=True) if not df.empty else None
    except Exception:
        return None


def _fetch_ishares_csv(url: str) -> Optional[pd.DataFrame]:
    content = _try_get(url)
    if not content:
        return None
    try:
        text = content.decode('utf-8', errors='replace')
        lines = text.splitlines()
        header_idx = None
        for i, line in enumerate(lines):
            upper = line.upper()
            if ('TICKER' in upper or 'ISIN' in upper) and 'WEIGHT' in upper:
                header_idx = i
                break
        if header_idx is None:
            return None
        df = pd.read_csv(io.StringIO('\n'.join(lines[header_idx:])), thousands=',')
        return _normalize_holdings(df)
    except Exception:
        return None


def _fetch_ssga_xlsx(url: str) -> Optional[pd.DataFrame]:
    content = _try_get(url)
    if not content:
        return None
    try:
        df = pd.read_excel(io.BytesIO(content), skiprows=4, engine='openpyxl')
        return _normalize_holdings(df)
    except Exception:
        return None


def _fetch_yahoo_qs(ticker: str) -> Optional[pd.DataFrame]:
    """Yahoo Finance quoteSummary topHoldings."""
    try:
        url = f'https://query2.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=topHoldings'
        r = requests.get(url, headers={**_HEADERS, 'Accept': 'application/json'}, timeout=15)
        if r.status_code != 200:
            return None
        data = r.json()
        holdings = (
            data.get('quoteSummary', {})
                .get('result', [{}])[0]
                .get('topHoldings', {})
                .get('holdings', [])
        )
        if not holdings:
            return None
        rows = [
            {
                'ticker':     h.get('symbol', ''),
                'name':       h.get('holdingName', h.get('symbol', '')),
                'weight_pct': round(h.get('holdingPercent', 0.0) * 100, 4),
            }
            for h in holdings
        ]
        df = pd.DataFrame(rows)
        df = df[df['weight_pct'] > 0].copy()
        return df.reset_index(drop=True) if not df.empty else None
    except Exception:
        return None


def _fetch_embedded(ticker: str) -> Optional[pd.DataFrame]:
    rows = _EMBEDDED.get(ticker.upper())
    if not rows:
        return None
    df = pd.DataFrame(rows, columns=['ticker', 'name', 'weight_pct'])
    return df[df['weight_pct'] > 0].reset_index(drop=True)


# ─────────────────────────── Provider registry ───────────────────────────────

_PROVIDER_URLS: dict[str, tuple[str, str]] = {
    # ticker: (provider_name, url_for_live_fetch)
    'SPY':    ('SSGA',      'https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx'),
    'QQQ':    ('Invesco',   'https://www.invesco.com/us/financial-products/etfs/holdings/main/holdings/0?audienceType=Investor&action=download&ticker=QQQ'),
    'VWRA.L': ('iShares',   'https://www.ishares.com/uk/individual/en/products/251902/ISHARES-MSCI-WORLD-ETF/1467271812596.ajax?fileType=csv&fileName=VWRA_holdings&dataType=fund'),
    'IVV':    ('iShares',   'https://www.ishares.com/us/239726/xls/holdings.xls?fileType=csv&fileName=IVV_holdings&dataType=fund'),
}
# Aliases
_PROVIDER_URLS['VWRA']   = _PROVIDER_URLS['VWRA.L']
_PROVIDER_URLS['IVVB11'] = _PROVIDER_URLS['IVV']

# All tickers that have at least embedded data
_ETF_CONFIG: dict[str, bool] = {
    'SPY': True, 'QQQ': True, 'VWRA.L': True, 'VWRA': True,
    'IVV': True, 'IVVB11': True,
    'VOO': False, 'VT': False, 'VNQ': False, 'SCHD': False,
}


@st.cache_data(ttl=3600, show_spinner=False)
def fetch_holdings(ticker: str) -> tuple[Optional[pd.DataFrame], str]:
    """
    Fetch holdings for one ETF ticker.
    Returns (df[ticker, name, weight_pct], source_label).
    source_label ∈ {'fmp', 'live', 'yahoo', 'embedded', 'none'}
    Cached 1h (short-term within session; GSheets is the long-term store).
    """
    t = ticker.upper()

    # Tier 1: FMP (free API, best quality, needs key in secrets)
    df = _fetch_fmp(t)
    if df is not None and not df.empty:
        return df, 'fmp'

    # Tier 2: live provider URL
    urls = _PROVIDER_URLS.get(t)
    if urls:
        _, url = urls
        if 'xlsx' in url or 'xls' in url:
            df = _fetch_ssga_xlsx(url)
        else:
            df = _fetch_ishares_csv(url)
        if df is not None and not df.empty:
            return df, 'live'

    # Tier 3: Yahoo Finance quoteSummary
    df = _fetch_yahoo_qs(t)
    if df is not None and not df.empty:
        return df, 'yahoo'

    # Tier 4: embedded fallback
    df = _fetch_embedded(t)
    if df is not None and not df.empty:
        return df, 'embedded'

    return None, 'none'


# ─────────────────────────── Core computation ────────────────────────────────

def _etf_value_usd(row: pd.Series, usd_brl: float) -> float:
    """Compute USD value of an ETF position from df_portfolio row."""
    moeda = str(row.get('Moeda', 'USD')).upper()
    price = float(row.get('Preço Atual', 0) or 0)
    qty   = float(row.get('Qtd', 0) or 0)
    val_brl = float(row.get('Valor Hoje (R$)', 0) or 0)
    if moeda == 'USD':
        return qty * price
    return val_brl / usd_brl if usd_brl > 0 else 0.0


def _build_results(
    etf_weights: dict,     # {etf_ticker: (df[ticker,name,weight_pct], source)}
    df_portfolio: pd.DataFrame,
    usd_brl: float,
    top_n: int,
) -> tuple[dict, pd.DataFrame, pd.DataFrame]:
    """
    Shared computation: given per-ETF weight DataFrames and current portfolio,
    returns (per_etf, df_lt, df_rv).
    """
    per_etf:    dict = {}
    lt_accum:   dict = {}
    direct_map: dict = {}

    # ── Direct RV positions (non-ETF, non-RF) ───────────────────────────────
    for _, row in df_portfolio.iterrows():
        setor = str(row.get('Setor', ''))
        if setor in _RF_LIKE_SECTORS:
            continue
        qty     = float(row.get('Qtd', 0) or 0)
        val_brl = float(row.get('Valor Hoje (R$)', 0) or 0)
        tkr     = str(row['Ticker'])
        if qty <= 0 or val_brl <= 0:
            continue
        val_usd = val_brl / usd_brl if usd_brl > 0 else 0.0
        prev    = direct_map.get(tkr, {'name': tkr, 'value_usd': 0.0})
        prev['value_usd'] += val_usd
        direct_map[tkr] = prev

    # ── ETF expansion ────────────────────────────────────────────────────────
    eligible = df_portfolio[
        df_portfolio['Setor'].isin(_LOOKTHROUGH_SECTORS) &
        (df_portfolio['Qtd'] > 0)
    ]

    for _, row in eligible.iterrows():
        etf_t = str(row['Ticker']).upper()
        value_usd = _etf_value_usd(row, usd_brl)

        if value_usd <= 0:
            per_etf[etf_t] = {'holdings': None, 'value_usd': 0.0, 'status': 'empty', 'source': 'none'}
            continue

        holdings_info = etf_weights.get(etf_t)
        if holdings_info is None:
            per_etf[etf_t] = {'holdings': None, 'value_usd': value_usd, 'status': 'not_supported', 'source': 'none'}
            continue

        df_h, source = holdings_info
        if df_h is None or df_h.empty:
            per_etf[etf_t] = {'holdings': None, 'value_usd': value_usd, 'status': 'empty', 'source': source}
            continue

        top = df_h.nlargest(top_n, 'weight_pct').copy()
        top['value_usd'] = top['weight_pct'] / 100.0 * value_usd
        top['value_brl'] = top['value_usd'] * usd_brl

        # ── Tail bucket: weight not covered by top_n ─────────────────────────
        # Without this, the uncovered fraction simply vanishes from every total.
        covered_w   = top['weight_pct'].sum()
        uncovered_w = max(0.0, 100.0 - covered_w)
        if uncovered_w > 0.5:
            tail_usd = uncovered_w / 100.0 * value_usd
            tail_row = pd.DataFrame([{
                'ticker':     f'OUTROS.{etf_t}',
                'name':       f'Demais ativos ({etf_t}) — {uncovered_w:.1f}% restante',
                'weight_pct': uncovered_w,
                'value_usd':  tail_usd,
                'value_brl':  tail_usd * usd_brl,
            }])
            top = pd.concat([top, tail_row], ignore_index=True)

        per_etf[etf_t] = {
            'holdings':    top,
            'value_usd':   value_usd,
            'covered_pct': covered_w,   # % of weight represented by named holdings
            'status':      'ok',
            'source':      source,
        }

        for _, h in top.iterrows():
            ut = str(h['ticker'])
            if ut in lt_accum:
                lt_accum[ut]['value_usd'] += h['value_usd']
                if etf_t not in lt_accum[ut]['via']:
                    lt_accum[ut]['via'].append(etf_t)
            else:
                lt_accum[ut] = {'name': str(h['name']), 'value_usd': h['value_usd'], 'via': [etf_t]}

    # ── df_lt ─────────────────────────────────────────────────────────────────
    if lt_accum:
        lt_rows = [
            {'ticker': k, 'name': v['name'], 'value_usd': v['value_usd'],
             'value_brl': v['value_usd'] * usd_brl, 'via': ', '.join(v['via'])}
            for k, v in lt_accum.items()
        ]
        df_lt = pd.DataFrame(lt_rows)
        total_lt = df_lt['value_usd'].sum()
        df_lt['pct'] = (df_lt['value_usd'] / total_lt * 100) if total_lt > 0 else 0.0
        df_lt = df_lt.sort_values('value_usd', ascending=False).reset_index(drop=True)
    else:
        df_lt = pd.DataFrame(columns=['ticker', 'name', 'value_usd', 'value_brl', 'pct', 'via'])

    # ── df_rv (direct + look-through merged) ─────────────────────────────────
    rv_accum: dict = {}
    for tkr, d in direct_map.items():
        rv_accum[tkr] = {'name': d['name'], 'direct_usd': d['value_usd'], 'etf_usd': 0.0, 'via': []}
    for tkr, d in lt_accum.items():
        if tkr in rv_accum:
            rv_accum[tkr]['etf_usd'] += d['value_usd']
            for etf in d['via']:
                if etf not in rv_accum[tkr]['via']:
                    rv_accum[tkr]['via'].append(etf)
        else:
            rv_accum[tkr] = {'name': d['name'], 'direct_usd': 0.0, 'etf_usd': d['value_usd'], 'via': list(d['via'])}

    if rv_accum:
        rv_rows = []
        for tkr, d in rv_accum.items():
            total_usd = d['direct_usd'] + d['etf_usd']
            sources = (['Direta'] if d['direct_usd'] > 0 else []) + d['via']
            rv_rows.append({
                'ticker':     tkr,
                'name':       d['name'],
                'value_usd':  total_usd,
                'value_brl':  total_usd * usd_brl,
                'direct_usd': d['direct_usd'],
                'etf_usd':    d['etf_usd'],
                'via':        ', '.join(sources) if sources else '—',
            })
        df_rv = pd.DataFrame(rv_rows)
        total_rv = df_rv['value_usd'].sum()
        df_rv['pct'] = (df_rv['value_usd'] / total_rv * 100) if total_rv > 0 else 0.0
        df_rv = df_rv.sort_values('value_usd', ascending=False).reset_index(drop=True)
    else:
        df_rv = pd.DataFrame(columns=['ticker', 'name', 'value_usd', 'value_brl', 'pct', 'direct_usd', 'etf_usd', 'via'])

    return per_etf, df_lt, df_rv


# ─────────────────────────── Public API ──────────────────────────────────────

def compute_lookthrough(
    df_portfolio: pd.DataFrame,
    mapa_precos: dict,
    usd_brl: float,
    top_n: int = 50,
) -> tuple[dict, pd.DataFrame, pd.DataFrame]:
    """
    Fetch ETF holdings (live/embedded) and compute look-through + full RV view.
    Returns (per_etf, df_lt, df_rv).
    """
    eligible = df_portfolio[
        df_portfolio['Setor'].isin(_LOOKTHROUGH_SECTORS) &
        (df_portfolio['Qtd'] > 0)
    ]

    etf_weights: dict = {}
    for _, row in eligible.iterrows():
        etf_t = str(row['Ticker']).upper()
        if etf_t in _ETF_CONFIG or etf_t in _PROVIDER_URLS:
            df_h, source = fetch_holdings(etf_t)
            etf_weights[etf_t] = (df_h, source)
        else:
            etf_weights[etf_t] = (None, 'none')

    return _build_results(etf_weights, df_portfolio, usd_brl, top_n)


def compute_from_stored(
    df_stored: pd.DataFrame,
    df_portfolio: pd.DataFrame,
    usd_brl: float,
    top_n: int = 50,
) -> tuple[dict, pd.DataFrame, pd.DataFrame]:
    """
    Use holdings weights from GSheets (no network fetch) + current portfolio prices.
    Returns (per_etf, df_lt, df_rv) with up-to-date values.
    """
    etf_weights: dict = {}
    for etf_t, sub in df_stored.groupby('etf'):
        source = str(sub['source'].iloc[0]) if ('source' in sub.columns and not sub.empty) else 'stored'
        cols_needed = [c for c in ['ticker', 'name', 'weight_pct'] if c in sub.columns]
        df_h = sub[cols_needed].copy()
        for missing in [c for c in ['ticker', 'name', 'weight_pct'] if c not in df_h.columns]:
            df_h[missing] = '' if missing != 'weight_pct' else 0.0
        df_h['weight_pct'] = pd.to_numeric(df_h['weight_pct'], errors='coerce').fillna(0.0)
        df_h = df_h[df_h['weight_pct'] > 0].copy()
        etf_weights[str(etf_t).upper()] = (df_h if not df_h.empty else None, source)

    return _build_results(etf_weights, df_portfolio, usd_brl, top_n)


# ─────────────────────────── GSheets persistence ─────────────────────────────

def save_to_gsheets(per_etf: dict) -> bool:
    """
    Write ETF holdings weights to the 'composicao' GSheets tab.
    Clears all previous data. Only stores weight_pct (values recomputed on load).
    Returns True on success.
    """
    from core.data.gsheets import connect_to_gsheets, _open_spreadsheet, SPREADSHEET_NAME
    import gspread

    client = connect_to_gsheets()
    if not client:
        return False
    sh = _open_spreadsheet(client, SPREADSHEET_NAME)
    if not sh:
        return False

    try:
        try:
            ws = sh.worksheet(COMPOSICAO_TAB)
        except gspread.WorksheetNotFound:
            ws = sh.add_worksheet(title=COMPOSICAO_TAB, rows=2000, cols=len(COMPOSICAO_COLS))

        now_str = datetime.now().strftime('%Y-%m-%d %H:%M')
        rows = [COMPOSICAO_COLS]

        for etf_t, data in per_etf.items():
            if data.get('status') != 'ok' or data.get('holdings') is None:
                continue
            source = data.get('source', 'unknown')
            for _, h in data['holdings'].iterrows():
                if str(h['ticker']).startswith('OUTROS.'):
                    continue  # tail bucket is recomputed on load, never persisted
                rows.append([
                    etf_t,
                    str(h['ticker']),
                    str(h['name']),
                    round(float(h['weight_pct']), 4),
                    source,
                    now_str,
                ])

        ws.clear()
        ws.update(rows, value_input_option='USER_ENTERED')

        # Invalidate DataProvider cache so next load_from_gsheets gets fresh data
        try:
            from core.data.provider import DataProvider
            DataProvider.fetch_data.clear()
        except Exception:
            pass

        return True
    except Exception as e:
        print(f'[etf_holdings] save_to_gsheets error: {e}')
        return False


def load_from_gsheets() -> tuple[Optional[pd.DataFrame], str]:
    """
    Read ETF holdings from 'composicao' GSheets tab — always fresh, no cache.
    Returns (df_weights, updated_at_str) or (None, '') if empty/wrong format.
    df_weights columns: [etf, ticker, name, weight_pct, source, updated_at]
    """
    from core.data.gsheets import get_worksheet

    ws = get_worksheet('gdados', COMPOSICAO_TAB)
    if not ws:
        return None, ''

    try:
        all_values = ws.get_all_values(value_render_option='UNFORMATTED_VALUE')
    except Exception:
        return None, ''

    if not all_values or len(all_values) < 2:
        return None, ''

    headers = [str(h).strip() for h in all_values[0]]
    df = pd.DataFrame(all_values[1:], columns=headers)
    df = df.replace('', None)

    if 'etf' not in df.columns or 'weight_pct' not in df.columns:
        return None, ''

    df['weight_pct'] = pd.to_numeric(df['weight_pct'], errors='coerce').fillna(0.0)
    df = df[df['weight_pct'] > 0].copy()

    if df.empty:
        return None, ''

    updated_at = str(df['updated_at'].iloc[0]) if 'updated_at' in df.columns else ''
    return df, updated_at
