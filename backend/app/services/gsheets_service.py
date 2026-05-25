"""Google Sheets data access — port of lib/gsheets.ts."""
import unicodedata
from datetime import datetime, timezone
from typing import Any

from googleapiclient.discovery import build

from app.config import settings
from app.services.cache import sheets_cache

Row = dict[str, Any]

_sheet_names_cache: list[str] | None = None


def _get_service():
    return build("sheets", "v4", developerKey=settings.google_api_key)


def _serial_to_date(serial: float) -> str:
    utc_days = int(serial - 25569)
    ts = utc_days * 86400
    d = datetime.fromtimestamp(ts, tz=timezone.utc)
    return d.strftime("%Y-%m-%d")


def _normalize(s: str) -> str:
    nfc = unicodedata.normalize("NFD", s)
    return "".join(c for c in nfc if not unicodedata.combining(c)).lower().replace("_", "").replace(" ", "")


async def list_sheet_names() -> list[str]:
    global _sheet_names_cache
    if _sheet_names_cache:
        return _sheet_names_cache

    service = _get_service()
    meta = service.spreadsheets().get(
        spreadsheetId=settings.spreadsheet_id,
        fields="sheets.properties.title"
    ).execute()
    _sheet_names_cache = [s["properties"]["title"] for s in meta.get("sheets", [])]
    return _sheet_names_cache


async def _resolve_tab_name(tab_name: str) -> str:
    names = await list_sheet_names()
    if tab_name in names:
        return tab_name
    lower = _normalize(tab_name)
    for name in names:
        if _normalize(name) == lower:
            return name
    for name in names:
        norm = _normalize(name)
        if norm.startswith(lower) or lower.startswith(norm):
            return name
    return tab_name


async def fetch_tab(tab_name: str) -> list[Row]:
    cache_key = f"sheet:{tab_name}"
    cached = sheets_cache.get(cache_key)
    if cached is not None:
        return cached

    resolved = await _resolve_tab_name(tab_name)
    service = _get_service()

    result = service.spreadsheets().values().get(
        spreadsheetId=settings.spreadsheet_id,
        range=resolved,
        valueRenderOption="UNFORMATTED_VALUE",
    ).execute()

    raw_rows = result.get("values", [])
    if len(raw_rows) < 2:
        sheets_cache.set(cache_key, [])
        return []

    headers = [str(h).strip().lower() for h in raw_rows[0]]
    rows: list[Row] = []

    import re
    date_re = re.compile(r"data|compra|pagamento|date")

    for raw in raw_rows[1:]:
        obj: Row = {}
        for i, h in enumerate(headers):
            val = raw[i] if i < len(raw) else None
            if isinstance(val, (int, float)) and date_re.search(h):
                val = _serial_to_date(float(val))
            obj[h] = val
        rows.append(obj)

    sheets_cache.set(cache_key, rows)
    return rows
