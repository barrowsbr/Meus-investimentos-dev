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


_MAX_RV_ROWS = 20        # últimas N transações de RV enviadas ao agente
_MAX_PROVENTOS_ROWS = 15  # últimos N proventos enviados ao agente


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
    Retorna string **resumida** com os dados do portfólio para injeção no
    system_instruction do Gemini.

    Para reduzir o uso de tokens:
      - RV: envia apenas as últimas N transações + resumo estatístico
      - RF atual: mantém completa (geralmente pequena)
      - RF histórico: apenas resumo quantitativo (sem tabela)
      - Proventos: últimos N registros + total acumulado

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
        f"# Carteira do Investidor — resumo extraído em {today}",
        "",
        "> Dados importados do Google Sheets. Tabelas grandes foram resumidas para economizar contexto.",
        "",
    ]

    # ── Renda Variável — aba meus_ativos (resumida) ───────────────────────
    if df_rv is not None and not df_rv.empty:
        total_ops = len(df_rv)
        tickers_unicos = df_rv['ticker'].nunique() if 'ticker' in df_rv.columns else '?'
        lines.append("## Renda Variável — aba `meus_ativos`")
        lines.append(
            f"Total de operações: **{total_ops}** · Tickers únicos: **{tickers_unicos}**"
        )
        if total_ops > _MAX_RV_ROWS:
            lines.append(f"*(Mostrando as {_MAX_RV_ROWS} transações mais recentes)*")
            lines.append("")
            lines.append(_df_to_table(df_rv.tail(_MAX_RV_ROWS)))
        else:
            lines.append("")
            lines.append(_df_to_table(df_rv))
        lines.append("")

    # ── Renda Fixa Atual — aba fixa_aberta (completa — geralmente pequena)
    if df_rf_atual is not None and not df_rf_atual.empty:
        lines.append("## Renda Fixa — aba `fixa_aberta`")
        lines.append(
            "Posições de renda fixa que o investidor POSSUI ATUALMENTE "
            "(CDBs, LCIs, LCAs, Tesouro Direto etc.)."
        )
        lines.append("")
        lines.append(_df_to_table(df_rf_atual))
        lines.append("")

    # ── Renda Fixa Histórico — aba renda_fixa (apenas resumo) ────────────
    if df_rf_hist is not None and not df_rf_hist.empty:
        n_ops = len(df_rf_hist)
        lines.append("## Renda Fixa Histórico — aba `renda_fixa` (resumo)")
        lines.append(
            f"Total de operações registradas: **{n_ops}** "
            "(compras, resgates, vencimentos — inclui ativos encerrados)."
        )
        # Resumo por tipo se a coluna existir
        for col in ('tipo', 'Tipo', 'operacao', 'Operacao'):
            if col in df_rf_hist.columns:
                resumo = df_rf_hist[col].value_counts().to_dict()
                parts = [f"{k}: {v}" for k, v in resumo.items()]
                lines.append(f"Distribuição: {' · '.join(parts)}")
                break
        lines.append("")

    # ── Proventos — aba meus_proventos (resumidos) ────────────────────────
    if df_proventos is not None and not df_proventos.empty:
        total_prov = len(df_proventos)
        lines.append("## Proventos — aba `meus_proventos`")
        # Total em R$ se tiver coluna de valor
        for col in ('valor', 'Valor', 'value', 'liquido', 'Liquido'):
            if col in df_proventos.columns:
                try:
                    soma = df_proventos[col].sum()
                    lines.append(f"Total recebido: **R$ {soma:,.2f}** em **{total_prov}** eventos.")
                except Exception:
                    lines.append(f"Total de eventos: **{total_prov}**.")
                break
        else:
            lines.append(f"Total de eventos: **{total_prov}**.")

        if total_prov > _MAX_PROVENTOS_ROWS:
            lines.append(f"*(Mostrando os {_MAX_PROVENTOS_ROWS} mais recentes)*")
            lines.append("")
            lines.append(_df_to_table(df_proventos.tail(_MAX_PROVENTOS_ROWS)))
        else:
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


def build_agent_context() -> dict:
    """
    Monta o contexto completo do portfólio para o Agente IA.
    Combina snapshot de mercado + dados brutos do GSheets.
    Retorna dict com chaves usadas pelo GeminiAgent.
    """
    import pandas as pd
    from core.computed import get_portfolio_snapshot
    from core.data.loader import load_assets, load_fixed_income_manual, load_proventos, load_fixed_income

    snapshot = get_portfolio_snapshot()

    try:
        df_rv = load_assets()
    except Exception:
        df_rv = pd.DataFrame()

    try:
        df_rf_atual = load_fixed_income_manual()
    except Exception:
        df_rf_atual = pd.DataFrame()

    try:
        df_rf_hist = load_fixed_income()
    except Exception:
        df_rf_hist = pd.DataFrame()

    try:
        df_proventos = load_proventos()
    except Exception:
        df_proventos = pd.DataFrame()

    portfolio_text = build_portfolio_context(
        df_rv=df_rv,
        df_rf_atual=df_rf_atual,
        df_rf_hist=df_rf_hist,
        df_proventos=df_proventos,
    )
    market_text = build_market_snapshot(snapshot)

    return {
        "portfolio_context": portfolio_text,
        "market_snapshot": market_text,
        "snapshot": snapshot,
    }
