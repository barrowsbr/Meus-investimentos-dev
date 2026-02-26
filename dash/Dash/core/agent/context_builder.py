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
    sign = "+" if v >= 0 else ""
    return f"{sign}{v:.2f}%"


def build_portfolio_context(
    df_rv: Optional[pd.DataFrame] = None,
    df_rf: Optional[pd.DataFrame] = None,
    df_crypto: Optional[pd.DataFrame] = None,
    df_proventos: Optional[pd.DataFrame] = None,
    extra_metrics: Optional[dict] = None,
) -> str:
    """
    Retorna uma string compacta com resumo completo do portfólio, pronta para
    ser incluída no prompt do Gemini.

    DataFrames aceitos (todos opcionais):
      df_rv      — Renda variável enriquecida com preços atuais
                   Colunas: ticker, setor, moeda, quantidade, preco_medio,
                             preco_atual, valor_atual, resultado, resultado_pct,
                             variacao_dia (opcional)
      df_rf      — Renda fixa resumida
                   Colunas: ticker, valor_atual, taxa (opcional), vencimento (opcional)
      df_crypto  — Cripto (mesmas colunas de df_rv)
      df_proventos — Histórico de proventos
                   Colunas: data, ticker, valor
      extra_metrics — dict chave→valor com métricas adicionais (TWR, etc.)
    """
    today = date.today().strftime("%d/%m/%Y")
    lines: list[str] = [
        f"# Contexto do Portfólio — {today}",
        "Você é um analista financeiro pessoal do usuário.",
        "Use APENAS os dados abaixo para embasar suas respostas.",
        "Valores em BRL salvo indicação contrária (coluna Moeda).",
        "",
    ]

    total_port = 0.0
    total_rv   = 0.0
    total_rf   = 0.0

    # ── Renda Variável ─────────────────────────────────────────────────────
    if df_rv is not None and not df_rv.empty:
        total_rv = df_rv["valor_atual"].sum() if "valor_atual" in df_rv.columns else 0.0
        total_port += total_rv

        lines.append("## Renda Variável — Posições Abertas")

        # ── Agrupamento por setor ──────────────────────────────────────────
        if "setor" in df_rv.columns:
            setor_totais = (
                df_rv.groupby("setor")["valor_atual"].sum()
                .sort_values(ascending=False)
            )
            lines.append("### Alocação por Setor")
            for setor, val in setor_totais.items():
                pct = (val / total_rv * 100) if total_rv else 0
                lines.append(f"  {setor}: {_fmt_brl(val)} ({pct:.1f}%)")
            lines.append("")

        # ── Lista de posições ──────────────────────────────────────────────
        lines.append("### Posições")
        df_sorted = df_rv.sort_values("valor_atual", ascending=False) if "valor_atual" in df_rv.columns else df_rv
        for _, row in df_sorted.iterrows():
            parts = [str(row.get("ticker", "—"))]

            moeda = str(row.get("moeda", "BRL"))
            if moeda != "BRL":
                parts.append(f"[{moeda}]")

            if "quantidade" in df_rv.columns:
                parts.append(f"Qtd={row.get('quantidade', 0):.4g}")
            if "preco_medio" in df_rv.columns:
                parts.append(f"PM={_fmt_brl(row.get('preco_medio', 0))}")
            if "preco_atual" in df_rv.columns:
                parts.append(f"PA={_fmt_brl(row.get('preco_atual', 0))}")
            if "valor_atual" in df_rv.columns:
                parts.append(f"Valor={_fmt_brl(row.get('valor_atual', 0))}")
            if "resultado" in df_rv.columns and "resultado_pct" in df_rv.columns:
                res = row.get("resultado", 0)
                pct = row.get("resultado_pct", 0)
                parts.append(f"P&L={_fmt_brl(res)} ({_fmt_pct(pct)})")
            if "variacao_dia" in df_rv.columns:
                vd = row.get("variacao_dia", 0)
                if vd != 0:
                    parts.append(f"Hoje={_fmt_pct(vd)}")

            lines.append("  " + " | ".join(parts))

        # Totais e performance RV
        lines.append(f"\n  **Total RV: {_fmt_brl(total_rv)}**")
        if "resultado" in df_rv.columns:
            total_res = df_rv["resultado"].sum()
            total_custo = (df_rv["quantidade"] * df_rv["preco_medio"]).sum() if "quantidade" in df_rv.columns and "preco_medio" in df_rv.columns else 0
            total_res_pct = (total_res / total_custo * 100) if total_custo else 0
            lines.append(f"  **P&L Total RV: {_fmt_brl(total_res)} ({_fmt_pct(total_res_pct)})**")

        # Top 3 ganhos / perdas
        if "resultado_pct" in df_rv.columns and len(df_rv) >= 3:
            top3_ganho = df_rv.nlargest(3, "resultado_pct")
            top3_perda = df_rv.nsmallest(3, "resultado_pct")
            lines.append("\n  Top 3 maiores ganhos:")
            for _, r in top3_ganho.iterrows():
                lines.append(f"    {r.get('ticker','—')}: {_fmt_pct(r.get('resultado_pct', 0))}")
            lines.append("  Top 3 maiores perdas:")
            for _, r in top3_perda.iterrows():
                lines.append(f"    {r.get('ticker','—')}: {_fmt_pct(r.get('resultado_pct', 0))}")

        lines.append("")

    # ── Renda Fixa ─────────────────────────────────────────────────────────
    if df_rf is not None and not df_rf.empty:
        col_val = "valor_atual" if "valor_atual" in df_rf.columns else ("saldo" if "saldo" in df_rf.columns else None)
        if col_val:
            total_rf = df_rf[col_val].sum()
            total_port += total_rf

        lines.append("## Renda Fixa")
        df_rf_s = df_rf.sort_values(col_val, ascending=False) if col_val else df_rf
        for _, row in df_rf_s.iterrows():
            nome  = row.get("ticker", row.get("Ticker", row.get("nome", "—")))
            valor = float(row.get(col_val, 0)) if col_val else 0
            taxa  = row.get("taxa", None)
            venc  = row.get("vencimento", None)
            status = row.get("Status", row.get("Ativo", None))

            parts = [f"  {nome}", f"Saldo={_fmt_brl(valor)}"]
            if taxa is not None:
                parts.append(f"Taxa={taxa}")
            if venc is not None:
                parts.append(f"Venc={venc}")
            if status is not None:
                parts.append(f"Status={status}")
            lines.append(" | ".join(parts))

        lines.append(f"\n  **Total RF: {_fmt_brl(total_rf)}**")
        lines.append("")

    # ── Cripto (se separado de RV) ──────────────────────────────────────────
    if df_crypto is not None and not df_crypto.empty:
        total_crypto = df_crypto["valor_atual"].sum() if "valor_atual" in df_crypto.columns else 0
        total_port  += total_crypto
        lines.append("## Criptoativos")
        for _, row in df_crypto.iterrows():
            ticker = row.get("ticker", "—")
            valor  = float(row.get("valor_atual", 0))
            res    = row.get("resultado", None)
            pct    = row.get("resultado_pct", None)
            parts  = [f"  {ticker}", f"Valor={_fmt_brl(valor)}"]
            if res is not None:
                parts.append(f"P&L={_fmt_brl(float(res))}")
            if pct is not None:
                parts.append(f"({_fmt_pct(float(pct))})")
            lines.append(" | ".join(parts))
        lines.append(f"\n  **Total Cripto: {_fmt_brl(total_crypto)}**")
        lines.append("")

    # ── Resumo Geral ────────────────────────────────────────────────────────
    if total_port > 0:
        lines.insert(
            lines.index("") + 1,   # logo após o cabeçalho
            f"**Patrimônio Total: {_fmt_brl(total_port)}** "
            f"(RV {_fmt_brl(total_rv)} | RF {_fmt_brl(total_rf)})\n"
        ) if "" in lines else None

        lines.append("## Resumo do Portfólio")
        lines.append(f"  Patrimônio Total: {_fmt_brl(total_port)}")
        if total_rv:
            lines.append(f"  Renda Variável:   {_fmt_brl(total_rv)} ({total_rv/total_port*100:.1f}%)")
        if total_rf:
            lines.append(f"  Renda Fixa:       {_fmt_brl(total_rf)} ({total_rf/total_port*100:.1f}%)")
        lines.append("")

    # ── Proventos ───────────────────────────────────────────────────────────
    if df_proventos is not None and not df_proventos.empty and "valor" in df_proventos.columns:
        total_prov = df_proventos["valor"].sum()
        lines.append(f"## Proventos Recebidos")
        lines.append(f"  Total histórico: {_fmt_brl(total_prov)}")

        if "data" in df_proventos.columns and "ticker" in df_proventos.columns:
            # Últimos 12 meses
            try:
                df_prov_sorted = df_proventos.sort_values("data", ascending=False)
                cutoff = pd.Timestamp.today() - pd.DateOffset(months=12)
                last_year = df_prov_sorted[df_proventos["data"] >= cutoff]
                if not last_year.empty:
                    lines.append(f"  Últimos 12 meses: {_fmt_brl(last_year['valor'].sum())}")
            except Exception:
                pass

            recent = df_proventos.sort_values("data", ascending=False).head(8)
            lines.append("  Últimos recebimentos:")
            for _, r in recent.iterrows():
                try:
                    data_str = r["data"].strftime("%d/%m/%Y") if hasattr(r["data"], "strftime") else str(r["data"])
                except Exception:
                    data_str = str(r["data"])
                lines.append(f"    {data_str} | {r.get('ticker','—')} | {_fmt_brl(float(r['valor']))}")
        lines.append("")

    # ── Métricas extras (TWR, MWR, etc.) ───────────────────────────────────
    if extra_metrics:
        lines.append("## Métricas de Performance")
        for k, v in extra_metrics.items():
            lines.append(f"  {k}: {v}")
        lines.append("")

    lines.append("---")
    lines.append(
        "Responda sempre em português do Brasil. Seja direto, analítico e destaque "
        "pontos de atenção. Use os dados acima — nunca invente valores."
    )

    return "\n".join(lines)
