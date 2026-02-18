"""Diagnostic script for decomposition residual bug."""
import sys; sys.path.insert(0, '.')
import pandas as pd, numpy as np
from core.data.loader import load_assets, load_proventos, load_fixed_income, load_cambio, load_fixed_income_manual
from core.data.market import fetch_historical_data
from core.engine import reconstruct_history_multicurrency
from core.consolidator import consolidate_to_brl
from core.performance.calculator import calculate_canonical_twr, DEFAULT_PREMISES
from core.performance.decomposition import decompose_portfolio, decompose_bucket_return
from datetime import datetime, timedelta

print('Loading data...')
df_assets = load_assets()
df_proventos = load_proventos()
df_rf_raw = load_fixed_income()
df_cambio = load_cambio()
df_rf_manual = load_fixed_income_manual()

manual_rf_values = {}
if not df_rf_manual.empty:
    df_rf_manual['Atual'] = pd.to_numeric(df_rf_manual['Atual'], errors='coerce').fillna(0)
    df_rf_manual = df_rf_manual[df_rf_manual['Atual'] > 0]
    manual_rf_values = dict(zip(
        df_rf_manual['Ticker'].astype(str).str.strip().str.upper(),
        df_rf_manual['Atual']
    ))

tickers = df_assets['ticker'].unique().tolist()
termos = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO', 'CDI']
tickers_dl = [t for t in tickers if not any(x in t.upper() for x in termos)]
tickers_dl += ['BRL=X', 'EURUSD=X', 'CADUSD=X']

min_date = datetime.now() - timedelta(days=365*5)
if not df_assets.empty:
    min_date = min(min_date, pd.to_datetime(df_assets['data']).min())

print('Fetching prices...')
df_hist = fetch_historical_data(list(set(tickers_dl)), min_date)

days_lookback = (datetime.now() - min_date).days + 10
print('Running engine...')
multi = reconstruct_history_multicurrency(
    df_bruto=df_assets.copy(),
    df_proventos=df_proventos,
    days_lookback=days_lookback,
    df_prices_external=df_hist,
    df_rf_raw=df_rf_raw,
    df_cambio=df_cambio,
    manual_rf_values=manual_rf_values
)

# Consolidate
all_dates = set()
for b in multi.buckets.values():
    if not b.nav_series.empty:
        all_dates.update(b.nav_series.index)
idx = pd.DatetimeIndex(sorted(all_dates))

consolidated = consolidate_to_brl(multi.buckets, multi.fx_rates, df_cambio=df_cambio)
df_engine = consolidated.to_engine_input()

# YTD slice
data_max = df_engine.index.max()
start = pd.Timestamp(data_max.year, 1, 1)
df_slice = df_engine[(df_engine.index >= start) & (df_engine.index <= data_max)]
first_valid = df_slice[df_slice['nav'] > 0].first_valid_index()
if first_valid is not None:
    df_slice = df_slice.loc[first_valid:]
df_slice['nav'] = df_slice['nav'].replace(0, np.nan).ffill().fillna(0)

# TWR on slice
twr = calculate_canonical_twr(df_slice, DEFAULT_PREMISES)
print(f'\n=== TWR consolidado (YTD) ===')
print(f'TWR: {twr.total_twr:.4%}')
print(f'Period: {start.date()} to {data_max.date()}')
print(f'NAV initial: {df_slice["nav"].iloc[0]:,.2f}')
print(f'NAV final: {df_slice["nav"].iloc[-1]:,.2f}')

# Decompose with full buckets (current approach)
decomp = decompose_portfolio(multi.buckets, multi.fx_rates, consolidated_result=twr, premises=DEFAULT_PREMISES)
print(f'\n=== Decomposition (FULL PERIOD buckets) ===')
print(f'R_asset: {decomp.total_twr_asset:.4%}')
print(f'R_fx: {decomp.total_twr_fx:.4%}')
print(f'Theoretical: {(1+decomp.total_twr_asset)*(1+decomp.total_twr_fx)-1:.4%}')
print(f'Actual TWR: {twr.total_twr:.4%}')
print(f'Residual: {decomp.total_residual:.4%}')

print(f'\n=== Per-bucket detail (FULL period) ===')
total_nav_end = 0
for curr, bucket in multi.buckets.items():
    if not bucket.nav_series.empty:
        nav_last = bucket.nav_series.iloc[-1]
        base_curr = curr.replace('_DIRECT', '')
        if base_curr in multi.fx_rates and base_curr != 'BRL' and not curr.endswith('_DIRECT'):
            fx_last = multi.fx_rates[base_curr].asof(bucket.nav_series.index[-1])
            if pd.isna(fx_last): fx_last = 1.0
            nav_brl = nav_last * fx_last
        elif curr == 'BRL':
            nav_brl = nav_last
        else:
            base = curr.replace('_DIRECT', '')
            if base in multi.fx_rates:
                fx_last = multi.fx_rates[base].asof(bucket.nav_series.index[-1])
                if pd.isna(fx_last): fx_last = 1.0
                nav_brl = nav_last * fx_last
            else:
                nav_brl = nav_last
        total_nav_end += nav_brl

for curr, dec in decomp.decompositions.items():
    nav = multi.buckets[curr].nav_series
    nav_last = nav.iloc[-1]
    base_curr = curr.replace('_DIRECT', '')
    
    # Calculate weight
    if base_curr in multi.fx_rates and base_curr != 'BRL' and not curr.endswith('_DIRECT'):
        fx_last = multi.fx_rates[base_curr].asof(nav.index[-1])
        if pd.isna(fx_last): fx_last = 1.0
        nav_brl = nav_last * fx_last
    elif curr == 'BRL':
        nav_brl = nav_last
    else:
        base = curr.replace('_DIRECT', '')
        if base in multi.fx_rates:
            fx_last = multi.fx_rates[base].asof(nav.index[-1])
            if pd.isna(fx_last): fx_last = 1.0
            nav_brl = nav_last * fx_last
        else:
            nav_brl = nav_last
    
    w = nav_brl / total_nav_end if total_nav_end > 0 else 0
    
    print(f'\n  {curr}:')
    print(f'    Weight: {w:.4%}')
    print(f'    R_asset: {dec.twr_asset:.4%}')
    print(f'    R_fx: {dec.twr_fx:.4%}')
    print(f'    R_total: {dec.twr_total:.4%}')
    print(f'    NAV range: {nav.index.min().date()} to {nav.index.max().date()}')
    print(f'    Tickers: {multi.buckets[curr].tickers}')
    print(f'    FX: {dec.fx_start:.4f} -> {dec.fx_end:.4f}')

print('\nDONE')
