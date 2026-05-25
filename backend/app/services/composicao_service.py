"""Composição da carteira — treemap, pareto, risco x retorno, look-through."""
from __future__ import annotations

from typing import Any

from app.core.format import to_number
from app.models.schemas import Position

Row = dict[str, Any]

_MACRO_MAP: dict[str, str] = {
    "Ações Brasil": "Brasil",
    "FIIs": "Brasil",
    "BDRs": "Brasil",
    "ETF": "Brasil",
    "Ações Internacional": "Exterior",
    "ETF USA": "Exterior",
    "Renda Fixa": "Renda Fixa",
    "Renda Fixa USD": "Renda Fixa",
    "Commodities": "Commodities",
    "Cripto": "Cripto",
}

_CUSTODIA_BRASIL = {"Ações Brasil", "FIIs", "ETF", "Renda Fixa", "BDRs"}


def get_macro(setor: str) -> str:
    return _MACRO_MAP.get(setor, "Outros")


def build_custodia(positions: list[Position]) -> dict:
    brasil = sum(
        p.valor_atual_brl for p in positions
        if p.setor in _CUSTODIA_BRASIL and p.valor_atual_brl > 1
    )
    exterior = sum(
        p.valor_atual_brl for p in positions
        if p.setor not in _CUSTODIA_BRASIL and p.valor_atual_brl > 1
    )
    total = brasil + exterior
    return {
        "brasil": round(brasil, 2),
        "exterior": round(exterior, 2),
        "brasil_pct": round(brasil / total * 100 if total > 0 else 0, 2),
        "exterior_pct": round(exterior / total * 100 if total > 0 else 0, 2),
    }


def build_pareto(positions: list[Position]) -> list[dict]:
    sorted_pos = sorted(
        [p for p in positions if p.valor_atual_brl > 1],
        key=lambda p: p.valor_atual_brl,
        reverse=True,
    )
    total = sum(p.valor_atual_brl for p in sorted_pos)
    cumulative = 0.0
    result = []
    for p in sorted_pos:
        cumulative += p.valor_atual_brl
        result.append({
            "ticker": p.ticker,
            "setor": p.setor,
            "macro": get_macro(p.setor),
            "valor_brl": round(p.valor_atual_brl, 2),
            "pct": round(p.valor_atual_brl / total * 100 if total > 0 else 0, 2),
            "acumulado_pct": round(cumulative / total * 100 if total > 0 else 0, 2),
        })
    return result


def build_rentabilidade(positions: list[Position]) -> list[dict]:
    result = []
    for p in positions:
        if p.valor_atual_brl < 1:
            continue
        lucro_nao_realizado = p.lucro_brl or 0
        lucro_realizado_brl = p.lucro_realizado * p.fator_brl
        custo = p.custo_total_brl
        total_lucro = lucro_nao_realizado + lucro_realizado_brl
        retorno_pct = total_lucro / custo * 100 if custo > 0 else 0
        result.append({
            "ticker": p.ticker,
            "setor": p.setor,
            "macro": get_macro(p.setor),
            "valor_atual_brl": round(p.valor_atual_brl, 2),
            "lucro_nao_realizado_brl": round(lucro_nao_realizado, 2),
            "lucro_realizado_brl": round(lucro_realizado_brl, 2),
            "retorno_total_pct": round(retorno_pct, 2),
        })
    return sorted(result, key=lambda x: x["retorno_total_pct"], reverse=True)


def build_risco_retorno(positions: list[Position]) -> list[dict]:
    return [
        {
            "ticker": p.ticker,
            "setor": p.setor,
            "macro": get_macro(p.setor),
            "valor_atual_brl": round(p.valor_atual_brl, 2),
            "retorno_acumulado": round(p.lucro_pct or 0, 2),
        }
        for p in positions
        if p.valor_atual_brl > 1 and p.lucro_pct is not None
    ]


def build_estrutura_carteira(positions: list[Position]) -> list[dict]:
    total = sum(p.valor_atual_brl for p in positions if p.valor_atual_brl > 1)
    if total == 0:
        return []

    macros: dict[str, dict] = {}
    for p in positions:
        if p.valor_atual_brl < 1:
            continue
        macro = get_macro(p.setor)
        if macro not in macros:
            macros[macro] = {"name": macro, "value": 0.0, "children": {}}
        macros[macro]["value"] += p.valor_atual_brl

        setor = p.setor
        if setor not in macros[macro]["children"]:
            macros[macro]["children"][setor] = {"name": setor, "value": 0.0, "children": []}
        macros[macro]["children"][setor]["value"] += p.valor_atual_brl
        macros[macro]["children"][setor]["children"].append({
            "name": p.ticker,
            "value": round(p.valor_atual_brl, 2),
            "pct": round(p.valor_atual_brl / total * 100, 2),
        })

    tree = []
    for macro, data in sorted(macros.items(), key=lambda x: -x[1]["value"]):
        children = []
        for setor, sd in sorted(data["children"].items(), key=lambda x: -x[1]["value"]):
            children.append({
                "name": setor,
                "value": round(sd["value"], 2),
                "pct": round(sd["value"] / total * 100, 2),
                "children": sd["children"],
            })
        tree.append({
            "name": macro,
            "value": round(data["value"], 2),
            "pct": round(data["value"] / total * 100, 2),
            "children": children,
        })
    return tree


def get_top_bottom_performer(
    positions: list[Position],
) -> tuple[dict | None, dict | None]:
    candidates = [p for p in positions if p.lucro_pct is not None and p.valor_atual_brl > 1]
    if not candidates:
        return None, None
    top = max(candidates, key=lambda p: p.lucro_pct or 0)
    bottom = min(candidates, key=lambda p: p.lucro_pct or 0)
    return (
        {"ticker": top.ticker, "lucro_pct": round(top.lucro_pct or 0, 2), "setor": top.setor},
        {"ticker": bottom.ticker, "lucro_pct": round(bottom.lucro_pct or 0, 2), "setor": bottom.setor},
    )


def build_look_through(
    positions: list[Position],
    composicao_rows: list[Row],
) -> dict:
    etf_setores = {"ETF", "ETF USA"}
    etf_tickers = {
        p.ticker: p
        for p in positions
        if p.setor in etf_setores and p.valor_atual_brl > 1
    }

    compositions: dict[str, list[dict]] = {}

    if composicao_rows and etf_tickers:
        sample = composicao_rows[0]
        keys = list(sample.keys())

        weight_keys = [
            k for k in keys
            if any(w in k.lower() for w in ("peso", "percentual", "%", "pl", "part", "weight"))
        ]
        etf_col = next(
            (k for k in keys if k.lower() in ("etf", "fundo", "ticker", "símbolo", "simbolo")),
            None,
        )
        ativo_col = next(
            (k for k in keys if k.lower() in ("ativo", "symbol", "componente", "papel")),
            None,
        )

        if etf_col and ativo_col and weight_keys:
            for row in composicao_rows:
                etf = str(row.get(etf_col) or "").upper().strip()
                ativo = str(row.get(ativo_col) or "").upper().strip()
                peso = to_number(row.get(weight_keys[0])) or 0
                if etf and ativo and peso > 0:
                    compositions.setdefault(etf, []).append(
                        {"ativo": ativo, "peso": round(float(peso), 4)}
                    )
        else:
            etf_cols = [
                k for k in keys
                if k.upper() in etf_tickers
                or k.upper() in {"VOO", "SPY", "QQQ", "BOVA11", "IVVB11", "HASH11", "CSPX", "VWRA", "VWCE", "EIMI", "IWDA"}
            ]
            ativo_col_guess = keys[0] if keys else None
            if etf_cols and ativo_col_guess:
                for row in composicao_rows:
                    ativo = str(row.get(ativo_col_guess) or "").upper().strip()
                    if not ativo:
                        continue
                    for ec in etf_cols:
                        etf = ec.upper()
                        peso = to_number(row.get(ec)) or 0
                        if peso > 0:
                            compositions.setdefault(etf, []).append(
                                {"ativo": ativo, "peso": round(float(peso), 4)}
                            )

    supported = [t for t in etf_tickers if t in compositions]
    unsupported = [t for t in etf_tickers if t not in compositions]
    total_look_through_brl = sum(etf_tickers[t].valor_atual_brl for t in supported)

    return {
        "supported": supported,
        "unsupported": unsupported,
        "compositions": {
            etf: {
                "ticker": etf,
                "valor_brl": round(etf_tickers[etf].valor_atual_brl, 2),
                "components": sorted(comps, key=lambda x: -x["peso"])[:25],
            }
            for etf, comps in compositions.items()
            if etf in supported
        },
        "total_look_through_brl": round(total_look_through_brl, 2),
    }
