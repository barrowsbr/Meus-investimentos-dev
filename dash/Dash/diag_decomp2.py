"""Diagnostic script for decomposition residual bug - writes to file."""
import sys; sys.path.insert(0, '.')
import pandas as pd, numpy as np
from core.data.loader import load_assets, load_proventos, load_fixed_income, load_cambio, load_fixed_income_manual
from core.data.market import fetch_historical_data
from core.engine import reconstruct_history_multicurrency
from core.consolidator import consolidate_to_brl
from core.performance.calculator import calculate_canonical_twr, DEFAULT_PREMISES
from core.performance.decomposition import decompose_portfolio
from datetime import datetime, timedelta

out = open('diag_result.txt', 'w', encoding='utf-8')

def p(msg):
    print(msg)
    out.write(msg + '\n')
    out.flush()

p('Loading data...')
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

p('Fetching prices...')
df_hist = fetch_historical_data(list(set(tickers_dl)), min_date)

days_lookback = (datetime.now() - min_date).days + 10
p('Running engine...')
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
p(f'\n=== TWR consolidado (YTD) ===')
p(f'TWR: {twr.total_twr:.4%}')
p(f'Period: {start.date()} to {data_max.date()}')
p(f'NAV initial: {df_slice["nav"].iloc[0]:,.2f}')
p(f'NAV final: {df_slice["nav"].iloc[-1]:,.2f}')

# BUG: Decompose uses FULL buckets, not period-sliced
decomp = decompose_portfolio(multi.buckets, multi.fx_rates, consolidated_result=twr, premises=DEFAULT_PREMISES)
p(f'\n=== Decomposition (FULL PERIOD - BUG) ===')
p(f'R_asset (weighted): {decomp.total_twr_asset:.4%}')
p(f'R_fx (weighted): {decomp.total_twr_fx:.4%}')
p(f'Theoretical: {(1+decomp.total_twr_asset)*(1+decomp.total_twr_fx)-1:.4%}')
p(f'Actual TWR (YTD): {twr.total_twr:.4%}')
p(f'Residual: {decomp.total_residual:.4%}')

p(f'\n=== Per-bucket ===')
for curr, dec in decomp.decompositions.items():
    nav = multi.buckets[curr].nav_series
    p(f'{curr}: R_asset={dec.twr_asset:.4%} R_fx={dec.twr_fx:.4%} '
      f'R_total={dec.twr_total:.4%} '
      f'range={nav.index.min().date()}->{nav.index.max().date()} '
      f'tickers={multi.buckets[curr].tickers[:3]}...')

# Now try with SLICED buckets
p(f'\n=== Attempting SLICED buckets ===')
from core.consolidator import CurrencyBucket
sliced_buckets = {}
for curr, bucket in multi.buckets.items():
    nav_s = bucket.nav_series
    flow_s = bucket.flow_series
    income_s = bucket.income_series
    fz = bucket.force_zero_series
    ft = bucket.flow_timing_series
    
    # Slice to YTD
    nav_s = nav_s[(nav_s.index >= start) & (nav_s.index <= data_max)]
    flow_s = flow_s.reindex(nav_s.index).fillna(0)
    income_s = income_s.reindex(nav_s.index).fillna(0)
    fz = fz.reindex(nav_s.index).fillna(False)
    ft = ft.reindex(nav_s.index).fillna(0)
    
    # Skip empty
    fv = nav_s[nav_s > 0].first_valid_index()
    if fv is not None:
        nav_s = nav_s.loc[fv:]
        flow_s = flow_s.loc[fv:]
        income_s = income_s.loc[fv:]
        fz = fz.loc[fv:]
        ft = ft.loc[fv:]
    
    if not nav_s.empty and len(nav_s) >= 2:
        sliced_buckets[curr] = CurrencyBucket(
            currency=curr,
            nav_series=nav_s,
            flow_series=flow_s,
            income_series=income_s,
            force_zero_series=fz,
            flow_timing_series=ft,
            tickers=bucket.tickers,
        )

decomp2 = decompose_portfolio(sliced_buckets, multi.fx_rates, consolidated_result=twr, premises=DEFAULT_PREMISES)
p(f'R_asset (weighted): {decomp2.total_twr_asset:.4%}')
p(f'R_fx (weighted): {decomp2.total_twr_fx:.4%}')
p(f'Theoretical: {(1+decomp2.total_twr_asset)*(1+decomp2.total_twr_fx)-1:.4%}')
p(f'Actual TWR: {twr.total_twr:.4%}')
p(f'Residual: {decomp2.total_residual:.4%}')

out.close()
print('\nWrote results to diag_result.txt')
