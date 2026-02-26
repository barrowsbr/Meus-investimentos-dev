"""
context_builder.py
==================
Monta o contexto bruto do portfólio para injeção no system_instruction do Gemini.

Os dados são enviados SEM cálculos ou interpretações — exatamente como estão
no Google Sheets. O Gemini é quem faz as análises a partir dos dados brutos.
"""

from __future__ import annotations

import pandas as pd
from datetime import date
from typing import Optional


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
