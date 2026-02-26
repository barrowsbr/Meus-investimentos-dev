"""
context_builder.py
==================
Constrói o contexto do portfólio para ser injetado no prompt do Gemini.
Lê os dados já processados pelo engine existente.
"""

from __future__ import annotations

import pandas as pd
from datetime import date
from typing import Optional


def _fmt_brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_pct(v: float) -> str:
    return f"{v:+.2f}%"


def build_portfolio_context(
    df_rv: Optional[pd.DataFrame] = None,
    df_rf: Optional[pd.DataFrame] = None,
    df_crypto: Optional[pd.DataFrame] = None,
    df_proventos: Optional[pd.DataFrame] = None,
    extra_metrics: Optional[dict] = None,
) -> str:
    """
    Retorna uma string compacta com resumo do portfólio pronta para ser
    incluída no system-prompt do Gemini.

    Parâmetros aceitos são os DataFrames consolidados que a página de
    Investimentos já calcula. Todos são opcionais — apenas os fornecidos
    serão incluídos no contexto.
    """
    today = date.today().strftime("%d/%m/%Y")
    lines: list[str] = [
        f"# Contexto do Portfólio — {today}",
        "Você é um analista financeiro pessoal do usuário. Use os dados abaixo "
        "para embasar suas respostas. Valores em BRL salvo indicação contrária.",
        "",
    ]

    # ── Renda Variável ────────────────────────────────────────────────────────
    if df_rv is not None and not df_rv.empty:
        lines.append("## Renda Variável (posições abertas)")
        cols_map = {
            "ticker": "Ticker",
            "quantidade": "Qtd",
            "preco_medio": "PM",
            "preco_atual": "Preço Atual",
            "valor_atual": "Valor (BRL)",
            "resultado": "Resultado",
            "resultado_pct": "Ret.%",
        }
        available = {k: v for k, v in cols_map.items() if k in df_rv.columns}
        for _, row in df_rv.iterrows():
            parts = []
            if "ticker" in available:
                parts.append(str(row.get("ticker", "")))
            if "quantidade" in available:
                parts.append(f"Qtd={row.get('quantidade', 0):.0f}")
            if "preco_medio" in available:
                pm = row.get("preco_medio", 0)
                parts.append(f"PM={_fmt_brl(pm)}")
            if "preco_atual" in available:
                pa = row.get("preco_atual", 0)
                parts.append(f"PA={_fmt_brl(pa)}")
            if "valor_atual" in available:
                va = row.get("valor_atual", 0)
                parts.append(f"Valor={_fmt_brl(va)}")
            if "resultado" in available:
                res = row.get("resultado", 0)
                parts.append(f"Result={_fmt_brl(res)}")
            if "resultado_pct" in available:
                pct = row.get("resultado_pct", 0)
                parts.append(f"({_fmt_pct(pct)})")
            lines.append("  " + " | ".join(parts))

        # Totais RV
        if "valor_atual" in df_rv.columns:
            total_rv = df_rv["valor_atual"].sum()
            lines.append(f"  **Total RV: {_fmt_brl(total_rv)}**")
        lines.append("")

    # ── Renda Fixa ────────────────────────────────────────────────────────────
    if df_rf is not None and not df_rf.empty:
        lines.append("## Renda Fixa")
        for _, row in df_rf.iterrows():
            nome = row.get("nome", row.get("ticker", "—"))
            valor = row.get("valor_atual", row.get("saldo", 0))
            taxa = row.get("taxa", row.get("taxa_anual", None))
            venc = row.get("vencimento", None)
            part = [f"  {nome}", f"Saldo={_fmt_brl(float(valor))}"]
            if taxa is not None:
                part.append(f"Taxa={taxa}")
            if venc is not None:
                part.append(f"Venc.={venc}")
            lines.append(" | ".join(part))
        if "valor_atual" in df_rf.columns:
            lines.append(f"  **Total RF: {_fmt_brl(df_rf['valor_atual'].sum())}**")
        elif "saldo" in df_rf.columns:
            lines.append(f"  **Total RF: {_fmt_brl(df_rf['saldo'].sum())}**")
        lines.append("")

    # ── Cripto ────────────────────────────────────────────────────────────────
    if df_crypto is not None and not df_crypto.empty:
        lines.append("## Cripto")
        for _, row in df_crypto.iterrows():
            ticker = row.get("ticker", "—")
            valor = row.get("valor_atual", 0)
            res = row.get("resultado", None)
            pct = row.get("resultado_pct", None)
            part = [f"  {ticker}", f"Valor={_fmt_brl(float(valor))}"]
            if res is not None:
                part.append(f"Result={_fmt_brl(float(res))}")
            if pct is not None:
                part.append(f"({_fmt_pct(float(pct))})")
            lines.append(" | ".join(part))
        if "valor_atual" in df_crypto.columns:
            lines.append(f"  **Total Cripto: {_fmt_brl(df_crypto['valor_atual'].sum())}**")
        lines.append("")

    # ── Proventos (resumo) ─────────────────────────────────────────────────
    if df_proventos is not None and not df_proventos.empty:
        if "valor" in df_proventos.columns:
            total_prov = df_proventos["valor"].sum()
            lines.append(f"## Proventos recebidos (total histórico): {_fmt_brl(total_prov)}")
        if "data" in df_proventos.columns and "ticker" in df_proventos.columns:
            recent = (
                df_proventos.sort_values("data", ascending=False)
                .head(5)[["data", "ticker", "valor"]]
            )
            lines.append("  Últimos 5:")
            for _, r in recent.iterrows():
                lines.append(f"    {r['data'].strftime('%d/%m/%Y')} {r['ticker']} {_fmt_brl(r['valor'])}")
        lines.append("")

    # ── Métricas extras (performance, etc.) ────────────────────────────────
    if extra_metrics:
        lines.append("## Métricas de Performance")
        for k, v in extra_metrics.items():
            lines.append(f"  {k}: {v}")
        lines.append("")

    lines.append("---")
    lines.append(
        "Responda sempre em português do Brasil. Seja direto, analítico e "
        "destaque pontos de atenção. Use emojis com moderação para melhorar legibilidade."
    )

    return "\n".join(lines)
