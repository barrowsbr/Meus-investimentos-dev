"""Number/date parsing helpers — port of lib/format.ts."""
from typing import Optional


def to_number(value) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    # BR format: "1.234,56" → 1234.56
    if "," in s and "." in s:
        try:
            return float(s.replace(".", "").replace(",", "."))
        except ValueError:
            return None
    # BR format: "1234,56" → 1234.56
    if "," in s:
        try:
            return float(s.replace(",", "."))
        except ValueError:
            return None
    try:
        return float(s)
    except ValueError:
        return None
