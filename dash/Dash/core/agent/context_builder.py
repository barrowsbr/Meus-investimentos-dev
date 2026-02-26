"""
context_builder.py
==================
Constrói o contexto do portfólio para ser injetado no system_instruction
do Gemini via GeminiAgent.set_context().
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
    df_rf_atual: Optional[pd.DataFrame] = None,   # fixa_aberta — o que você TEM agora
    df_rf_hist: Optional[pd.DataFrame] = None,    # renda_fixa  — histórico de transações
    # Compatibilidade com chamadas antigas que usavam df_rf
    df_rf: Optional[pd.DataFrame] = None,
    df_crypto: Optional[pd.DataFrame] = None,
    df_proventos: Optional[pd.DataFrame] = None,
    extra_metrics: Optional[dict] = None,
) -> str:
    """
    Retorna uma string com o resumo completo do portfólio para ser incluída
    no system_instruction do Gemini via set_context().

    Fontes do Google Sheets:
      df_rv        — meus_ativos   → posições RV abertas (FIFO + preços Yahoo)
                     Colunas: ticker, setor, moeda, quantidade, preco_medio,
                               preco_atual, valor_atual, resultado, resultado_pct
      df_rf_atual  — fixa_aberta   → posições RF que você TEM AGORA
                     Colunas: Ticker, Atual, Data, Moeda, Tipo
      df_rf_hist   — renda_fixa    → histórico de transações RF (resumido)
                     Colunas: ticker, valor_atual, taxa, vencimento, Status
      df_proventos — meus_proventos → dividendos e JCP recebidos
                     Colunas: data, ticker, valor
    """
    # Suporte a chamadas legadas com df_rf
    if df_rf_atual is None and df_rf is not None:
        df_rf_atual = df_rf
    today = date.today().strftime("%d/%m/%Y")

    # ── Totais ────────────────────────────────────────────────────────────
    total_rv = 0.0
    total_rf = 0.0

    if df_rv is not None and not df_rv.empty and "valor_atual" in df_rv.columns:
        total_rv = float(df_rv["valor_atual"].sum())

    # Total RF: preferência para fixa_aberta (posições reais atuais)
    if df_rf_atual is not None and not df_rf_atual.empty and "Atual" in df_rf_atual.columns:
        total_rf = float(df_rf_atual["Atual"].sum())
    elif df_rf_hist is not None and not df_rf_hist.empty:
        col_v = "valor_atual" if "valor_atual" in df_rf_hist.columns else None
        if col_v:
            total_rf = float(df_rf_hist[col_v].sum())

    total_port = total_rv + total_rf

    lines: list[str] = [
        f"# Dados do Portfólio — {today}",
        "",
    ]

    # ── Resumo geral no topo ──────────────────────────────────────────────
    if total_port > 0:
        lines.append("## Resumo Geral")
        lines.append(f"  Patrimônio Total : {_fmt_brl(total_port)}")
        if total_rv:
            lines.append(f"  Renda Variável   : {_fmt_brl(total_rv)} ({total_rv / total_port * 100:.1f}%)")
        if total_rf:
            lines.append(f"  Renda Fixa       : {_fmt_brl(total_rf)} ({total_rf / total_port * 100:.1f}%)")
        lines.append("")

    # ── Renda Variável ─────────────────────────────────────────────────────
    if df_rv is not None and not df_rv.empty:
        lines.append("## Renda Variável — Posições Abertas")

        # Alocação por setor
        if "setor" in df_rv.columns and total_rv > 0:
            setor_totais = (
                df_rv.groupby("setor")["valor_atual"].sum()
                .sort_values(ascending=False)
            )
            lines.append("### Alocação por Setor")
            for setor, val in setor_totais.items():
                pct = val / total_rv * 100
                lines.append(f"  {setor}: {_fmt_brl(val)} ({pct:.1f}%)")
            lines.append("")

        # Lista de posições
        lines.append("### Posições (ordenadas por valor)")
        df_sorted = (
            df_rv.sort_values("valor_atual", ascending=False)
            if "valor_atual" in df_rv.columns else df_rv
        )
        for _, row in df_sorted.iterrows():
            parts = [str(row.get("ticker", "—"))]

            moeda = str(row.get("moeda", "BRL"))
            if moeda != "BRL":
                parts.append(f"[{moeda}]")

            if "quantidade" in df_rv.columns:
                parts.append(f"Qtd={row.get('quantidade', 0):.4g}")
            if "preco_medio" in df_rv.columns:
                parts.append(f"PM={_fmt_brl(float(row.get('preco_medio', 0)))}")
            if "preco_atual" in df_rv.columns:
                parts.append(f"PA={_fmt_brl(float(row.get('preco_atual', 0)))}")
            if "valor_atual" in df_rv.columns:
                parts.append(f"Valor={_fmt_brl(float(row.get('valor_atual', 0)))}")
            if "resultado" in df_rv.columns and "resultado_pct" in df_rv.columns:
                res = float(row.get("resultado", 0))
                pct = float(row.get("resultado_pct", 0))
                parts.append(f"P&L={_fmt_brl(res)} ({_fmt_pct(pct)})")
            if "variacao_dia" in df_rv.columns:
                vd = float(row.get("variacao_dia", 0))
                if abs(vd) > 0.01:
                    parts.append(f"Hoje={_fmt_pct(vd)}")

            lines.append("  " + " | ".join(parts))

        # Totais e P&L da RV
        lines.append(f"\n  Total RV: {_fmt_brl(total_rv)}")
        if "resultado" in df_rv.columns and "quantidade" in df_rv.columns and "preco_medio" in df_rv.columns:
            total_res   = float(df_rv["resultado"].sum())
            total_custo = float((df_rv["quantidade"] * df_rv["preco_medio"]).sum())
            total_res_pct = (total_res / total_custo * 100) if total_custo else 0.0
            lines.append(f"  P&L Total RV: {_fmt_brl(total_res)} ({_fmt_pct(total_res_pct)})")

        # Top 3 melhores e piores por % de retorno
        if "resultado_pct" in df_rv.columns and len(df_rv) >= 3:
            lines.append("\n  Melhores retornos:")
            for _, r in df_rv.nlargest(3, "resultado_pct").iterrows():
                lines.append(f"    {r.get('ticker','—')}: {_fmt_pct(float(r.get('resultado_pct', 0)))}")
            lines.append("  Piores retornos:")
            for _, r in df_rv.nsmallest(3, "resultado_pct").iterrows():
                lines.append(f"    {r.get('ticker','—')}: {_fmt_pct(float(r.get('resultado_pct', 0)))}")

        lines.append("")

    # ── Renda Fixa — Posições Atuais (fixa_aberta) ────────────────────────
    # Esta aba contém o que você TEM de fato agora, com o valor atual de cada posição.
    if df_rf_atual is not None and not df_rf_atual.empty:
        lines.append("## Renda Fixa — Posições Atuais (fixa_aberta)")
        lines.append("  ⚠️ Estes são os ativos de renda fixa que você POSSUI atualmente.")

        # Ordena por valor atual (Atual)
        col_sort = "Atual" if "Atual" in df_rf_atual.columns else None
        df_rfa_s = df_rf_atual.sort_values(col_sort, ascending=False) if col_sort else df_rf_atual

        for _, row in df_rfa_s.iterrows():
            nome  = str(row.get("Ticker", row.get("ticker", "—")))
            atual = row.get("Atual", row.get("atual", None))
            moeda = str(row.get("Moeda", row.get("moeda", "BRL")))
            tipo  = row.get("Tipo", row.get("tipo", None))
            data  = row.get("Data", row.get("data", None))

            parts = [f"  {nome}"]
            if moeda != "BRL":
                parts.append(f"[{moeda}]")
            if atual is not None:
                parts.append(f"Saldo Atual={_fmt_brl(float(atual))}")
            if tipo is not None:
                parts.append(f"Tipo={tipo}")
            if data is not None:
                try:
                    data_str = data.strftime("%d/%m/%Y") if hasattr(data, "strftime") else str(data)
                    parts.append(f"Data={data_str}")
                except Exception:
                    pass
            lines.append(" | ".join(parts))

        lines.append(f"\n  Total RF (atual): {_fmt_brl(total_rf)}")
        lines.append("")

    # ── Renda Fixa — Histórico de Transações (renda_fixa) ─────────────────
    # Esta aba contém o histórico de operações (compras, resgates, vencimentos).
    if df_rf_hist is not None and not df_rf_hist.empty:
        col_v = "valor_atual" if "valor_atual" in df_rf_hist.columns else None
        lines.append("## Renda Fixa — Histórico de Transações (renda_fixa)")
        lines.append("  ℹ️ Registro histórico de operações — inclui ativos já encerrados.")

        df_rfh_s = df_rf_hist.sort_values(col_v, ascending=False) if col_v else df_rf_hist
        for _, row in df_rfh_s.iterrows():
            nome   = row.get("ticker", row.get("Ticker", row.get("nome", "—")))
            valor  = float(row.get(col_v, 0)) if col_v else 0.0
            taxa   = row.get("taxa", None)
            venc   = row.get("vencimento", None)
            status = row.get("Status", row.get("Ativo", None))

            parts = [f"  {nome}", f"ValorRef={_fmt_brl(valor)}"]
            if taxa is not None:
                parts.append(f"Taxa={taxa}")
            if venc is not None:
                parts.append(f"Venc={venc}")
            if status is not None:
                parts.append(f"Status={status}")
            lines.append(" | ".join(parts))
        lines.append("")

    # ── Cripto (se separado de RV) ──────────────────────────────────────────
    if df_crypto is not None and not df_crypto.empty and "valor_atual" in df_crypto.columns:
        total_crypto = float(df_crypto["valor_atual"].sum())
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
        lines.append(f"\n  Total Cripto: {_fmt_brl(total_crypto)}")
        lines.append("")

    # ── Proventos ───────────────────────────────────────────────────────────
    if df_proventos is not None and not df_proventos.empty and "valor" in df_proventos.columns:
        total_prov = float(df_proventos["valor"].sum())
        lines.append("## Proventos Recebidos")
        lines.append(f"  Total histórico: {_fmt_brl(total_prov)}")

        if "data" in df_proventos.columns and "ticker" in df_proventos.columns:
            # Últimos 12 meses (usando df_proventos direto, sem mixar índices)
            try:
                cutoff = pd.Timestamp.today() - pd.DateOffset(months=12)
                mask   = df_proventos["data"] >= cutoff
                last_year_sum = float(df_proventos.loc[mask, "valor"].sum())
                if last_year_sum:
                    lines.append(f"  Últimos 12 meses: {_fmt_brl(last_year_sum)}")
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

    return "\n".join(lines)
