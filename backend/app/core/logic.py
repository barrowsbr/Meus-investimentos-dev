"""Sector classification and currency helpers — port of lib/sectors.ts."""

RF_SETORES = {"Renda Fixa USD", "Renda Fixa"}

CRIPTO = {"BTC", "ETH", "SOL", "USDT", "USDC", "HBAR", "ADA", "BTC-USD", "ETH-USD"}

ETFS_BR = {"IVVB11", "BOVA11", "SMAL11", "HASH11", "XINA11", "EURP11", "GOLD11", "B5P211"}

COMMODITIES = {"IAU", "SIVR", "SLV", "GLD", "DBC", "USO"}

RENDA_FIXA_USD = {"BIL", "VDST"}

ETFS_USA = {"SPY", "QQQ", "VWRA", "VOO", "VNQ", "SCHD", "VT", "SHV"}

RF_TERMS = ["TESOURO", "NTN", "LCI", "LCA", "CDB", "LC", "DEBENTURE", "CASH", "CAIXA"]

UNITS_ACOES = {
    "KLBN11", "SAPR11", "TAEE11", "ALUP11", "SANB11", "BPAC11",
    "ITUB11", "BBAS11", "EGIE11", "ENGI11", "TIET11", "CPFE11",
}


def identificar_setor(ticker: str) -> str:
    t = ticker.upper().strip()
    t_clean = t.replace(".SA", "").replace(".L", "")

    if t_clean in CRIPTO:
        return "Cripto"
    if (t_clean.startswith("BTC") or t_clean.startswith("ETH")) and len(t_clean) < 8:
        return "Cripto"

    if t_clean in ETFS_BR:
        return "ETF"

    if t_clean in COMMODITIES:
        return "Commodities"

    if t_clean in RENDA_FIXA_USD:
        return "Renda Fixa USD"

    if t_clean in ETFS_USA:
        return "ETF USA"

    if any(term in t_clean for term in RF_TERMS):
        return "Renda Fixa"

    if t_clean and t_clean[-1].isdigit():
        import re
        if re.search(r"[3456]$", t_clean):
            return "Ações Brasil"
        if t_clean.endswith("11"):
            return "Ações Brasil" if t_clean in UNITS_ACOES else "FIIs"
        if re.search(r"3[234]$", t_clean):
            return "BDRs"

    return "Ações Internacional"


def is_renda_fixa(setor: str) -> bool:
    return setor in RF_SETORES


def is_renda_variavel(setor: str) -> bool:
    return setor not in RF_SETORES


def get_moeda_efetiva(ticker: str, moeda_planilha: str, setor: str) -> str:
    if setor == "ETF USA":
        return "USD"
    if setor == "Cripto":
        return "USD"
    t_clean = ticker.upper().replace(".SA", "").replace(".L", "")
    if t_clean == "VWRA":
        return "USD"
    return moeda_planilha or "BRL"


def get_moeda_exposicao(setor: str, moeda_efetiva: str) -> str:
    if setor == "Cripto":
        return "Cripto"
    return moeda_efetiva
