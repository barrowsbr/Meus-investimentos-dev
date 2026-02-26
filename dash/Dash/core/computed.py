"""
computed.py
===========
Módulo centralizado de computação de portfólio.

Usado pelo Agente IA E pelas páginas do dashboard para garantir
que os valores sejam SEMPRE idênticos — sem recálculos divergentes.

A fonte única da verdade: mesmas funções, mesmos dados, mesmos resultados.
"""
from __future__ import annotations

import pandas as pd
import streamlit as st
from datetime import datetime
from typing import Optional

from core.data.loader import load_assets, load_fixed_income_manual
from core.data.market import fetch_market_data
from core.finance import calcular_carteira_fechada
from core.logic import identificar_setor_ativo

# Palavras-chave de tickers de RF/Caixa que não têm cotação no Yahoo
_RF_KEYWORDS = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO', 'CDI', 'LFT', 'NTN']


def _is_market_ticker(ticker: str) -> bool:
    return not any(kw in ticker.upper() for kw in _RF_KEYWORDS)


@st.cache_data(ttl=120, show_spinner=False)
def get_portfolio_snapshot() -> dict:
    """
    Calcula e retorna o snapshot completo do portfólio com preços de mercado.

    Usa as MESMAS funções que a página 1_Investimentos.py para garantir
    consistência total de números entre o agente e o dashboard.

    Cache de 2 minutos — preços do dia sem sobrecarga na API.

    Returns
    -------
    dict com:
      positions            — lista de dicts com cada posição enriquecida com preço atual + variação do dia
      top_gainers          — top 3 maiores altas do dia (% de variação)
      top_losers           — top 3 maiores quedas do dia (% de variação)
      portfolio_day_pnl_r  — P&L total do portfólio no dia em R$
      portfolio_day_pnl_pct— P&L total do portfólio no dia em %
      rf_positions         — DataFrame com posições de RF abertas (fixa_aberta)
      rf_total             — saldo total de RF em BRL
      computed_at          — timestamp do cálculo (HH:MM:SS)
      errors               — lista de erros não-fatais durante o cálculo
    """
    errors: list[str] = []

    # ── 1. Carrega dados brutos (igual ao que as páginas fazem) ────────────
    try:
        df_rv = load_assets()
    except Exception as exc:
        df_rv = pd.DataFrame()
        errors.append(f"meus_ativos: {exc}")

    try:
        df_rf_manual = load_fixed_income_manual()
    except Exception as exc:
        df_rf_manual = pd.DataFrame()
        errors.append(f"fixa_aberta: {exc}")

    # ── 2. Calcula posições (FIFO) — mesma lógica de 1_Investimentos.py ───
    if df_rv.empty:
        df_posicao = pd.DataFrame(columns=['Ticker', 'Setor', 'Qtd', 'Moeda', 'PM_Origem'])
    else:
        df_posicao, _ = calcular_carteira_fechada(df_rv)

    # Apenas posições com quantidade > 0
    df_posicao = df_posicao[df_posicao['Qtd'] > 0].copy()

    # ── 3. Tickers elegíveis para preço de mercado ────────────────────────
    tickers_market = [t for t in df_posicao['Ticker'].tolist() if _is_market_ticker(t)]

    # ── 4. Busca preços + variação do dia (mesmo fetch das páginas) ────────
    if tickers_market:
        try:
            map_prices, map_changes = fetch_market_data(tickers_market)
        except Exception as exc:
            map_prices, map_changes = {}, {}
            errors.append(f"fetch_market_data: {exc}")
    else:
        map_prices, map_changes = {}, {}

    # ── 5. Enriquece cada posição ─────────────────────────────────────────
    positions: list[dict] = []
    total_mv_brl = 0.0
    total_day_pnl_brl = 0.0

    for _, row in df_posicao.iterrows():
        ticker = row['Ticker']
        qty = row['Qtd']
        pm = row['PM_Origem']
        moeda = row['Moeda']
        setor = row.get('Setor', identificar_setor_ativo(ticker))

        current_price = map_prices.get(ticker)
        day_change_abs = map_changes.get(ticker, 0.0)

        if current_price and current_price > 0:
            prev_price = current_price - day_change_abs
            market_value = current_price * qty
            day_pnl_r = day_change_abs * qty
            day_pnl_pct = (day_change_abs / prev_price * 100) if prev_price and prev_price > 0 else 0.0
            total_pnl_r = (current_price - pm) * qty
            total_pnl_pct = ((current_price / pm) - 1) * 100 if pm > 0 else 0.0
            has_price = True
        else:
            market_value = pm * qty
            day_pnl_r = 0.0
            day_pnl_pct = 0.0
            total_pnl_r = 0.0
            total_pnl_pct = 0.0
            has_price = False

        if moeda == 'BRL':
            total_mv_brl += market_value
            total_day_pnl_brl += day_pnl_r

        positions.append({
            'ticker': ticker,
            'setor': setor,
            'moeda': moeda,
            'qty': qty,
            'pm': round(pm, 4),
            'current_price': round(current_price, 4) if current_price else None,
            'market_value': round(market_value, 2),
            'day_pnl_r': round(day_pnl_r, 2),
            'day_pnl_pct': round(day_pnl_pct, 2),
            'total_pnl_r': round(total_pnl_r, 2),
            'total_pnl_pct': round(total_pnl_pct, 2),
            'has_price': has_price,
        })

    # Ordena por variação do dia (maior → menor)
    positions.sort(key=lambda x: x['day_pnl_pct'], reverse=True)

    # ── 6. Top gainers / losers ───────────────────────────────────────────
    priced = [p for p in positions if p['has_price']]
    top_gainers = priced[:3]
    top_losers = list(reversed(priced[-3:])) if len(priced) >= 3 else list(reversed(priced))

    # ── 7. P&L total do portfólio no dia ─────────────────────────────────
    prev_total = total_mv_brl - total_day_pnl_brl
    portfolio_day_pnl_pct = (total_day_pnl_brl / prev_total * 100) if prev_total > 0 else 0.0

    # ── 8. RF: saldo total da aba fixa_aberta ────────────────────────────
    rf_total_brl = 0.0
    if not df_rf_manual.empty and 'Atual' in df_rf_manual.columns:
        if 'Moeda' in df_rf_manual.columns:
            mask_brl = df_rf_manual['Moeda'].str.upper().str.strip() == 'BRL'
            rf_brl = df_rf_manual[mask_brl]
        else:
            rf_brl = df_rf_manual
        rf_total_brl = pd.to_numeric(rf_brl['Atual'], errors='coerce').fillna(0).sum()

    return {
        'positions': positions,
        'top_gainers': top_gainers,
        'top_losers': top_losers,
        'portfolio_day_pnl_r': round(total_day_pnl_brl, 2),
        'portfolio_day_pnl_pct': round(portfolio_day_pnl_pct, 2),
        'rf_positions': df_rf_manual,
        'rf_total': round(rf_total_brl, 2),
        'computed_at': datetime.now().strftime('%H:%M:%S'),
        'errors': errors,
    }
