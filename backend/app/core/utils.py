"""Robust parsing utilities for Google Sheets data."""
from __future__ import annotations

import calendar
import re
import unicodedata
from datetime import date, datetime
from typing import Any, Optional

import pandas as pd


# ── Date parsing ─────────────────────────────────────────────────────────────

_MONTH_PT = {
    "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
}


def parse_date_br(value: Any) -> Optional[date]:
    """
    Parses dates in multiple formats:
    - "01/01/2024" (dd/mm/yyyy)
    - "2024-01-01" (ISO)
    - "jan/24" or "jan/2024" (pt-BR month abbreviation)
    - "2024-01" (year-month → last day of month)
    - 45293 (Excel serial number)
    - datetime / date objects
    Returns date or None.
    """
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    # Excel serial number
    try:
        num = float(value)
        if 1000 < num < 100000:
            return (pd.Timestamp("1900-01-01") + pd.Timedelta(days=int(num) - 2)).date()
    except (TypeError, ValueError):
        pass

    s = str(value).strip().lower()
    if not s:
        return None

    # "jan/24" or "jan/2024"
    m = re.match(r"^([a-z]{3})/(\d{2,4})$", s)
    if m:
        mon = _MONTH_PT.get(m.group(1))
        if mon:
            yr_s = m.group(2)
            yr = 2000 + int(yr_s) if len(yr_s) == 2 else int(yr_s)
            last = calendar.monthrange(yr, mon)[1]
            return date(yr, mon, last)

    # "2024-01" (year-month only)
    m = re.match(r"^(\d{4})-(\d{2})$", s)
    if m:
        yr, mon = int(m.group(1)), int(m.group(2))
        last = calendar.monthrange(yr, mon)[1]
        return date(yr, mon, last)

    # "2024-01-31"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None

    # "31/01/2024" or "1/1/2024"
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None

    return None


def parse_date_to_isostr(value: Any) -> Optional[str]:
    """Returns ISO string "YYYY-MM-DD" or None."""
    d = parse_date_br(value)
    return d.isoformat() if d else None


# ── Decimal parsing ───────────────────────────────────────────────────────────

def parse_decimal_br(value: Any) -> float:
    """
    Handles both BR ("1.234,56") and US ("1,234.56") decimal formats.
    Returns 0.0 for None/NaN/empty.
    """
    if value is None:
        return 0.0
    try:
        if isinstance(value, (int, float)):
            return float(value)
    except (TypeError, ValueError):
        pass

    s = str(value).strip()
    if not s or s.lower() in ("nan", "none", "-", ""):
        return 0.0

    # Remove currency symbols and whitespace
    s = re.sub(r"[R$€£\s]", "", s)

    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            # BR format: 1.234,56
            s = s.replace(".", "").replace(",", ".")
        else:
            # US format: 1,234.56
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")

    try:
        return float(s)
    except ValueError:
        return 0.0


# ── Column normalization ──────────────────────────────────────────────────────

def _normalize_col_key(col: str) -> str:
    """Lowercase, remove accents, replace space/hyphen with underscore."""
    nfc = unicodedata.normalize("NFD", col)
    no_accent = "".join(c for c in nfc if not unicodedata.combining(c))
    return re.sub(r"[\s\-]+", "_", no_accent.lower().strip())


def normalize_dataframe_columns(
    df: "pd.DataFrame",
    column_map: dict[str, str],
) -> "pd.DataFrame":
    """
    Maps DataFrame column names to a canonical set.

    column_map example:
        {
            "simbolo": "ticker",
            "tipo_de_transacao": "tipo",
            "preco": "preco",
        }

    Columns not found in column_map are left unchanged.
    """
    rename: dict[str, str] = {}
    for col in df.columns:
        key = _normalize_col_key(str(col))
        if key in column_map:
            rename[col] = column_map[key]
    return df.rename(columns=rename)


# Standard column map for meus_ativos tab
ASSETS_COLUMN_MAP: dict[str, str] = {
    "data": "data",
    "tipo_de_transacao": "tipo",
    "tipo_de_transacao": "tipo",
    "tipo": "tipo",
    "simbolo": "ticker",
    "simbolo": "ticker",
    "ticker": "ticker",
    "symbol": "ticker",
    "quantidade": "quantidade",
    "qtd": "quantidade",
    "preco": "preco",
    "price": "preco",
    "valor_bruto": "valor_bruto",
    "taxa_de_corretagem": "taxas",
    "taxas": "taxas",
    "taxa": "taxas",
    "valor_liquido": "valor_liquido",
    "moeda": "moeda",
    "currency": "moeda",
    "corretora": "corretora",
    "broker": "corretora",
}
