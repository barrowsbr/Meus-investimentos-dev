"""
Utilitários para Câmbio Efetivo
================================

Funções para lookup de taxas efetivas de câmbio baseadas
nas remessas reais registradas na aba 'cambio' do Google Sheets.

Versão: 1.0.0
Data: 2026-01-22
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import Optional, Dict


def build_effective_rate_series(df_cambio: pd.DataFrame) -> pd.Series:
    """
    Constrói série temporal de taxa efetiva USD/BRL.
    
    Para cada data de remessa, registra a taxa efetiva.
    A série pode ser usada com .asof() para lookup temporal.
    
    Args:
        df_cambio: DataFrame com colunas 'data', 'valor_origem', 'valor_destino', 'taxa'
    
    Returns:
        pd.Series com índice de datas e valores de taxa efetiva
    """
    if df_cambio.empty:
        return pd.Series(dtype=float)
    
    df = df_cambio.copy()
    
    # Normalizar datas
    if 'data' in df.columns:
        df['data'] = pd.to_datetime(df['data'], errors='coerce')
        df = df.dropna(subset=['data'])
    else:
        return pd.Series(dtype=float)
    
    # Calcular taxa se não existir
    if 'taxa' not in df.columns or df['taxa'].isna().all():
        if 'valor_origem' in df.columns and 'valor_destino' in df.columns:
            # Taxa = BRL / USD (quanto BRL pagou por 1 USD)
            df['taxa'] = df['valor_origem'] / df['valor_destino'].replace(0, np.nan)
        else:
            return pd.Series(dtype=float)
    
    # Agrupar por data (média ponderada se múltiplas remessas)
    if 'valor_destino' in df.columns:
        # Média ponderada pelo valor remetido
        grouped = df.groupby('data').apply(
            lambda x: np.average(x['taxa'], weights=x['valor_destino']) 
            if x['valor_destino'].sum() > 0 else x['taxa'].mean()
        )
    else:
        grouped = df.groupby('data')['taxa'].mean()
    
    return grouped.sort_index()


def get_effective_rate(
    df_cambio: pd.DataFrame, 
    date: datetime, 
    currency: str = 'USD',
    fallback_rate: float = 5.5
) -> float:
    """
    Retorna a taxa efetiva para uma data específica.
    
    Lógica: Usa a taxa da remessa mais próxima anterior à data.
    Se não houver remessa anterior, usa a primeira remessa futura.
    Se não houver nenhuma remessa, usa fallback_rate.
    
    Args:
        df_cambio: DataFrame de remessas
        date: Data para lookup
        currency: Moeda alvo (default: 'USD')
        fallback_rate: Taxa fallback se não houver dados
    
    Returns:
        Taxa efetiva para a data
    """
    if df_cambio.empty:
        return fallback_rate
    
    # Filtrar por moeda destino se coluna existir
    df = df_cambio.copy()
    if 'moeda_destino' in df.columns:
        df = df[df['moeda_destino'].str.upper() == currency.upper()]
    
    if df.empty:
        return fallback_rate
    
    # Construir série de taxas
    rate_series = build_effective_rate_series(df)
    
    if rate_series.empty:
        return fallback_rate
    
    # Garantir que date é datetime
    if isinstance(date, str):
        date = pd.to_datetime(date)
    elif hasattr(date, 'to_pydatetime'):
        date = date.to_pydatetime()
    
    date = pd.Timestamp(date).normalize()
    
    # Usar asof para lookup temporal (última taxa conhecida até a data)
    try:
        rate = rate_series.asof(date)
        if pd.isna(rate):
            # Se não há taxa anterior, usar a primeira futura
            future_rates = rate_series[rate_series.index > date]
            if not future_rates.empty:
                rate = future_rates.iloc[0]
            else:
                rate = fallback_rate
        return float(rate)
    except:
        return fallback_rate


def calculate_weighted_average_rate(
    df_cambio: pd.DataFrame, 
    start: datetime, 
    end: datetime,
    currency: str = 'USD'
) -> float:
    """
    Calcula taxa média ponderada para um período.
    
    Args:
        df_cambio: DataFrame de remessas
        start: Data início do período
        end: Data fim do período
        currency: Moeda alvo
    
    Returns:
        Taxa média ponderada pelo valor das remessas no período
    """
    if df_cambio.empty:
        return 5.5  # Fallback
    
    df = df_cambio.copy()
    
    # Filtrar por moeda
    if 'moeda_destino' in df.columns:
        df = df[df['moeda_destino'].str.upper() == currency.upper()]
    
    # Filtrar por período
    if 'data' in df.columns:
        df['data'] = pd.to_datetime(df['data'], errors='coerce')
        start_ts = pd.Timestamp(start).normalize()
        end_ts = pd.Timestamp(end).normalize()
        df = df[(df['data'] >= start_ts) & (df['data'] <= end_ts)]
    
    if df.empty:
        # Não há remessas no período, usar última taxa conhecida
        return get_effective_rate(df_cambio, start, currency)
    
    # Calcular taxa se não existir
    if 'taxa' not in df.columns or df['taxa'].isna().all():
        if 'valor_origem' in df.columns and 'valor_destino' in df.columns:
            df['taxa'] = df['valor_origem'] / df['valor_destino'].replace(0, np.nan)
    
    # Média ponderada
    if 'valor_destino' in df.columns and df['valor_destino'].sum() > 0:
        return np.average(df['taxa'].dropna(), weights=df.loc[df['taxa'].notna(), 'valor_destino'])
    else:
        return df['taxa'].mean()


def build_cumulative_usd_investment(df_cambio: pd.DataFrame) -> pd.Series:
    """
    Calcula o investimento acumulado em USD ao longo do tempo.
    
    Útil para calcular custo médio de aquisição de USD.
    
    Returns:
        Série com investimento acumulado em USD por data
    """
    if df_cambio.empty:
        return pd.Series(dtype=float)
    
    df = df_cambio.copy()
    
    if 'data' not in df.columns or 'valor_destino' not in df.columns:
        return pd.Series(dtype=float)
    
    df['data'] = pd.to_datetime(df['data'], errors='coerce')
    df = df.dropna(subset=['data']).sort_values('data')
    
    # Acumular por data
    cumulative = df.groupby('data')['valor_destino'].sum().cumsum()
    
    return cumulative


def get_total_brl_invested_in_usd(df_cambio: pd.DataFrame, up_to_date: datetime = None) -> float:
    """
    Retorna o total em BRL investido em remessas USD.
    
    Args:
        df_cambio: DataFrame de remessas
        up_to_date: Data limite (opcional)
    
    Returns:
        Total em BRL enviado para comprar USD
    """
    if df_cambio.empty:
        return 0.0
    
    df = df_cambio.copy()
    
    # Filtrar USD
    if 'moeda_destino' in df.columns:
        df = df[df['moeda_destino'].str.upper() == 'USD']
    
    if up_to_date is not None:
        if 'data' in df.columns:
            df['data'] = pd.to_datetime(df['data'], errors='coerce')
            df = df[df['data'] <= pd.Timestamp(up_to_date)]
    
    if 'valor_origem' in df.columns:
        return df['valor_origem'].sum()
    
    return 0.0
