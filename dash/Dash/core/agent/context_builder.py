"""
context_builder.py
==================
Monta o contexto do portfólio para injeção no system_instruction do Gemini.

Dois tipos de contexto:
  1. build_portfolio_context() — dados brutos das abas do Google Sheets
  2. build_market_snapshot()   — valores calculados (posições, preços, variação do dia)
                                 gerados pelas MESMAS funções das páginas do dashboard,
                                 garantindo 100% de consistência com o que o usuário vê.
"""

from __future__ import annotations

import pandas as pd
from datetime import date
from typing import Optional, Any


def _df_to_table(df: pd.DataFrame) -> str:
    """Converte DataFrame em tabela legível. Usa markdown se tabulate instalado,
    caso contrário usa CSV."""
    if df is None or df.empty:
        return "  (sem dados)"
    try:
        return df.to_markdown(index=False)
    except Exception:
        return df.to_csv(index=False, sep=",")


def build_portfolio_context(
    df_rv: Optional[pd.DataFrame] = None,
    df_rf_atual: Optional[pd.DataFrame] = None,
    df_rf_hist: Optional[pd.DataFrame] = None,
    df_rf: Optional[pd.DataFrame] = None,       # compatibilidade legada
    df_crypto: Optional[pd.DataFrame] = None,
    df_proventos: Optional[pd.DataFrame] = None,
    extra_metrics: Optional[dict] = None,
) -> str:
    """
    Retorna string com todos os dados brutos do portfólio para injeção no
    system_instruction do Gemini.

    Nenhum cálculo é realizado — os dados são exatamente como estão no Google Sheets.
    O Gemini receberá os dados crus e fará suas próprias análises.

    Fontes (abas do Google Sheets):
      df_rv        — 'meus_ativos'    → transações de renda variável
      df_rf_atual  — 'fixa_aberta'    → posições de RF que o investidor TEM agora
      df_rf_hist   — 'renda_fixa'     → histórico de operações RF (incluindo encerradas)
      df_proventos — 'meus_proventos' → dividendos e JCP recebidos
    """
    # Compatibilidade com chamadas legadas que usavam df_rf
    if df_rf_atual is None and df_rf is not None:
        df_rf_atual = df_rf

    today = date.today().strftime("%d/%m/%Y")

    lines: list[str] = [
        f"# Carteira do Investidor — dados brutos extraídos em {today}",
        "",
        "> Dados importados diretamente do Google Sheets, sem nenhum cálculo ou interpretação prévia.",
        "> Use estes dados para responder perguntas sobre o portfólio.",
        "",
    ]

    # ── Renda Variável — aba meus_ativos ──────────────────────────────────
    if df_rv is not None and not df_rv.empty:
        lines.append("## Renda Variável — aba `meus_ativos`")
        lines.append(
            "Registro de todas as transações de ativos de renda variável "
            "(ações, FIIs, ETFs, BDRs etc.). Cada linha é uma operação."
        )
        lines.append("")
        lines.append(_df_to_table(df_rv))
        lines.append("")

    # ── Renda Fixa Atual — aba fixa_aberta ───────────────────────────────
    if df_rf_atual is not None and not df_rf_atual.empty:
        lines.append("## Renda Fixa — aba `fixa_aberta`")
        lines.append(
            "Posições de renda fixa que o investidor POSSUI ATUALMENTE "
            "(CDBs, LCIs, LCAs, Tesouro Direto etc.). "
            "Esta é a fonte de verdade para o que está em carteira hoje."
        )
        lines.append("")
        lines.append(_df_to_table(df_rf_atual))
        lines.append("")

    # ── Renda Fixa Histórico — aba renda_fixa ────────────────────────────
    if df_rf_hist is not None and not df_rf_hist.empty:
        lines.append("## Renda Fixa — aba `renda_fixa`")
        lines.append(
            "Histórico de operações de renda fixa (compras, resgates, vencimentos). "
            "Inclui ativos já encerrados. Use para entender o histórico de movimentações."
        )
        lines.append("")
        lines.append(_df_to_table(df_rf_hist))
        lines.append("")

    # ── Proventos — aba meus_proventos ────────────────────────────────────
    if df_proventos is not None and not df_proventos.empty:
        lines.append("## Proventos — aba `meus_proventos`")
        lines.append("Dividendos, JCP e outros rendimentos recebidos.")
        lines.append("")
        lines.append(_df_to_table(df_proventos))
        lines.append("")

    return "\n".join(lines)


# ── Snapshot de mercado ────────────────────────────────────────────────────

def _fmt_pct(v: float) -> str:
    sign = "+" if v >= 0 else ""
    return f"{sign}{v:.2f}%"


def _fmt_brl(v: float) -> str:
    sign = "+" if v >= 0 else ""
    return f"{sign}R$ {v:,.2f}"


def build_market_snapshot(snapshot: dict) -> str:
    """
    Formata o snapshot calculado do portfólio como markdown para o Gemini.

    Os valores vêm de core/computed.py que usa as MESMAS funções que as
    páginas do dashboard — portanto são idênticos ao que o usuário vê na tela.

    Parâmetro
    ---------
    snapshot : dict
        Retorno de core.computed.get_portfolio_snapshot()
    """
    if not snapshot or not snapshot.get('positions'):
        return ""

    today = date.today().strftime("%d/%m/%Y")
    computed_at = snapshot.get('computed_at', '')
    lines: list[str] = [
        f"## Snapshot de Mercado — {today} (atualizado às {computed_at})",
        "",
        "> Valores calculados pelas mesmas funções do dashboard. "
        "PM, quantidade e posições seguem o método FIFO.",
        "",
    ]

    # ── Resumo do dia ──────────────────────────────────────────────────────
    day_r = snapshot['portfolio_day_pnl_r']
    day_pct = snapshot['portfolio_day_pnl_pct']
    lines += [
        "### Portfólio — Resultado do Dia (BRL)",
        f"- Variação: **{_fmt_brl(day_r)}** ({_fmt_pct(day_pct)})",
        "",
    ]

    # ── Top gainers ────────────────────────────────────────────────────────
    if snapshot.get('top_gainers'):
        lines.append("### 🟢 Maiores Altas do Dia")
        for p in snapshot['top_gainers']:
            lines.append(
                f"- **{p['ticker']}**: {_fmt_pct(p['day_pnl_pct'])} "
                f"({_fmt_brl(p['day_pnl_r'])}) | "
                f"Preço: R$ {p['current_price']:.2f} | "
                f"Posição: R$ {p['market_value']:,.2f}"
            )
        lines.append("")

    # ── Top losers ─────────────────────────────────────────────────────────
    if snapshot.get('top_losers'):
        lines.append("### 🔴 Maiores Quedas do Dia")
        for p in snapshot['top_losers']:
            lines.append(
                f"- **{p['ticker']}**: {_fmt_pct(p['day_pnl_pct'])} "
                f"({_fmt_brl(p['day_pnl_r'])}) | "
                f"Preço: R$ {p['current_price']:.2f} | "
                f"Posição: R$ {p['market_value']:,.2f}"
            )
        lines.append("")

    # ── Tabela completa de posições ────────────────────────────────────────
    positions = snapshot.get('positions', [])
    if positions:
        lines.append("### Todas as Posições")
        lines.append(
            "| Ticker | Setor | Moeda | Qtd | PM | Preço Atual | Valor Posição | Δ dia R$ | Δ dia % | Rent. Total % |"
        )
        lines.append("|---|---|---|---:|---:|---:|---:|---:|---:|---:|")
        for p in positions:
            price_str = f"{p['current_price']:.2f}" if p['current_price'] else "—"
            lines.append(
                f"| {p['ticker']} | {p['setor']} | {p['moeda']} "
                f"| {p['qty']:.4g} | {p['pm']:.2f} | {price_str} "
                f"| {p['market_value']:,.2f} "
                f"| {_fmt_brl(p['day_pnl_r'])} "
                f"| {_fmt_pct(p['day_pnl_pct'])} "
                f"| {_fmt_pct(p['total_pnl_pct'])} |"
            )
        lines.append("")

    # ── Renda Fixa ────────────────────────────────────────────────────────
    rf_total = snapshot.get('rf_total', 0.0)
    df_rf = snapshot.get('rf_positions')
    lines.append("### Renda Fixa (aba `fixa_aberta`)")
    lines.append(f"- Saldo total (BRL): **R$ {rf_total:,.2f}**")
    if df_rf is not None and not df_rf.empty:
        # Mostra colunas relevantes
        cols_show = [c for c in ['Ticker', 'Atual', 'Moeda', 'Tipo'] if c in df_rf.columns]
        if cols_show:
            lines.append("")
            lines.append(_df_to_table(df_rf[cols_show]))
    lines.append("")

    # ── Erros não-fatais ──────────────────────────────────────────────────
    erros = snapshot.get('errors', [])
    if erros:
        lines.append("### ⚠️ Avisos do cálculo")
        for e in erros:
            lines.append(f"- {e}")
        lines.append("")

    return "\n".join(lines)
