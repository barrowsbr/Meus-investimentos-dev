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

from core.data.loader import (
    load_assets,
    load_fixed_income,
    load_fixed_income_manual,
    load_proventos,
)
from core.data.market import fetch_market_data
from core.finance import (
    calcular_carteira_fechada,
    summarize_fixed_income,
    summarize_fixed_income_hybrid,
)
from core.logic import identificar_setor_ativo

# Palavras-chave de tickers de RF/Caixa que não têm cotação no Yahoo
_RF_KEYWORDS = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO', 'CDI', 'LFT', 'NTN']

# Setores que devem ser contados como Renda Fixa (não como RV)
_RF_SETORES = {'Renda Fixa USD', 'Renda Fixa'}


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

    # Adiciona taxas de câmbio — igual à Home.py, necessário para converter USD/EUR/CAD
    for _fx in ['BRL=X', 'EURBRL=X', 'CADBRL=X']:
        if _fx not in tickers_market:
            tickers_market.append(_fx)

    # ── 4. Busca preços + variação do dia (mesmo fetch das páginas) ────────
    if tickers_market:
        try:
            map_prices, map_changes = fetch_market_data(tickers_market)
        except Exception as exc:
            map_prices, map_changes = {}, {}
            errors.append(f"fetch_market_data: {exc}")
    else:
        map_prices, map_changes = {}, {}

    # ── 4b. Taxas de câmbio para conversão BRL ─────────────────────────────
    dolar_val = map_prices.get('BRL=X', 5.0) or 5.0
    eur_val = map_prices.get('EURBRL=X', 6.0) or 6.0
    cad_val = map_prices.get('CADBRL=X', 4.0) or 4.0

    def _fator(moeda: str) -> float:
        if moeda == 'USD':
            return dolar_val
        if moeda == 'EUR':
            return eur_val
        if moeda == 'CAD':
            return cad_val
        return 1.0

    # ── 5. Enriquece cada posição ─────────────────────────────────────────
    positions: list[dict] = []
    total_mv_brl = 0.0
    total_day_pnl_brl = 0.0
    rv_patrimonio_brl = 0.0      # soma RV em BRL (mesma lógica da Home)
    rf_usd_from_pos_brl = 0.0    # SHV e cia. — vão pra RF, não RV

    for _, row in df_posicao.iterrows():
        ticker = row['Ticker']
        qty = row['Qtd']
        pm = row['PM_Origem']
        moeda = row['Moeda']
        setor = row.get('Setor', identificar_setor_ativo(ticker))

        current_price = map_prices.get(ticker)
        day_change_abs = map_changes.get(ticker, 0.0)

        # Fallback: para RF/Tesouro/CDB sem cotação, usar PM
        price_for_brl = current_price
        if not price_for_brl or price_for_brl <= 0 or 'TESOURO' in ticker.upper() or 'CDB' in ticker.upper():
            price_for_brl = pm

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

        fator = _fator(moeda)
        valor_hoje_brl = qty * price_for_brl * fator
        day_pnl_brl = day_pnl_r * fator

        # Acumuladores em BRL (totais convertidos)
        total_mv_brl += valor_hoje_brl
        total_day_pnl_brl += day_pnl_brl

        # Roteia entre RV / RF (igual Home.py)
        if setor in _RF_SETORES:
            rf_usd_from_pos_brl += valor_hoje_brl
        elif valor_hoje_brl > 1.0:
            rv_patrimonio_brl += valor_hoje_brl

        positions.append({
            'ticker': ticker,
            'setor': setor,
            'moeda': moeda,
            'qty': qty,
            'fator_brl': round(fator, 4),          # taxa de conversão para BRL
            'pm': round(pm, 4),                    # preço médio em moeda nativa
            'pm_brl': round(pm * fator, 2),        # preço médio em BRL
            'current_price': round(current_price, 4) if current_price else None,
            'market_value': round(market_value, 2),
            'market_value_brl': round(valor_hoje_brl, 2),
            'day_pnl_r': round(day_pnl_r, 2),     # variação do dia em moeda nativa
            'day_pnl_brl': round(day_pnl_brl, 2), # variação do dia em BRL
            'day_pnl_pct': round(day_pnl_pct, 2),
            'total_pnl_r': round(total_pnl_r, 2),
            'total_pnl_brl': round(total_pnl_r * fator, 2),  # PnL total em BRL
            'total_pnl_pct': round(total_pnl_pct, 2),
            'has_price': has_price,
        })

    # Ordena por variação do dia (maior → menor)
    positions.sort(key=lambda x: x['day_pnl_pct'], reverse=True)

    # ── 6. Top gainers / losers (exclude RF assets — T-Bill ETFs, bonds) ────
    priced = [p for p in positions if p['has_price'] and p.get('setor', '') not in _RF_SETORES]
    top_gainers = priced[:3]
    top_losers = list(reversed(priced[-3:])) if len(priced) >= 3 else list(reversed(priced))

    # ── 7. P&L total do portfólio no dia ─────────────────────────────────
    prev_total = total_mv_brl - total_day_pnl_brl
    portfolio_day_pnl_pct = (total_day_pnl_brl / prev_total * 100) if prev_total > 0 else 0.0

    # ── 8. RF: cálculo COMPLETO (mesma lógica da Home.py) ────────────────
    rf_patrimonio_brl = 0.0
    try:
        df_rf_raw = load_fixed_income()
    except Exception as exc:
        df_rf_raw = pd.DataFrame()
        errors.append(f"renda_fixa: {exc}")

    try:
        df_proventos = load_proventos()
    except Exception as exc:
        df_proventos = pd.DataFrame()
        errors.append(f"meus_proventos: {exc}")

    try:
        if not df_rf_raw.empty:
            if df_rf_manual.empty:
                df_rf_completo = summarize_fixed_income(df_rf_raw)
            else:
                df_rf_completo = summarize_fixed_income_hybrid(df_rf_manual, df_rf_raw, df_proventos)
        else:
            df_rf_completo = pd.DataFrame()

        if not df_rf_completo.empty:
            df_rf_ativo = df_rf_completo[df_rf_completo['Status'] == 'Ativo'].copy()
            if not df_rf_ativo.empty and 'Atual' in df_rf_ativo.columns:
                df_rf_ativo['Atual'] = pd.to_numeric(df_rf_ativo['Atual'], errors='coerce').fillna(0)
                if 'Moeda' in df_rf_ativo.columns:
                    mask_usd = df_rf_ativo['Moeda'] == 'USD'
                    if mask_usd.any():
                        df_rf_ativo.loc[mask_usd, 'Atual'] = df_rf_ativo.loc[mask_usd, 'Atual'] * dolar_val
                rf_patrimonio_brl = float(df_rf_ativo['Atual'].sum())
    except Exception as exc:
        errors.append(f"summarize_fixed_income: {exc}")

    rf_patrimonio_brl += rf_usd_from_pos_brl
    total_patrimonio_brl = rv_patrimonio_brl + rf_patrimonio_brl

    return {
        'positions': positions,
        'top_gainers': top_gainers,
        'top_losers': top_losers,
        'portfolio_day_pnl_r': round(total_day_pnl_brl, 2),
        'portfolio_day_pnl_pct': round(portfolio_day_pnl_pct, 2),
        'rf_positions': df_rf_manual,
        'rf_total': round(rf_patrimonio_brl, 2),
        'rv_patrimonio_brl': round(rv_patrimonio_brl, 2),
        'rf_patrimonio_brl': round(rf_patrimonio_brl, 2),
        'total_patrimonio_brl': round(total_patrimonio_brl, 2),
        'dolar_val': round(dolar_val, 4),
        'eur_val': round(eur_val, 4),
        'cad_val': round(cad_val, 4),
        'computed_at': datetime.now().strftime('%H:%M:%S'),
        'errors': errors,
    }
