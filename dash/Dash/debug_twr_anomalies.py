import pandas as pd
import numpy as np
import os
import sys

# Add project root to path
sys.path.append(os.path.abspath(r"g:\Meu Drive\Finanças\Investimentos\Meus-investimentos\dash\Dash"))

from core.data_loader import load_assets, load_proventos
from core.engine import reconstruct_history
from core.performance_engine import PerformanceEngine
from config import FILE_PTAX

def run_diagnosis():
    print("--- TWR DIAGNOSIS START ---")
    
    # 1. Load Data
    try:
        df_assets = load_assets()
        df_prov = load_proventos()
        print(f"Loaded {len(df_assets)} assets and {len(df_prov)} proventos.")
    except Exception as e:
        print(f"Error loading data: {e}")
        return

    # 2. Reconstruct History (Run Engine)
    # We use a dummy lookback since we want full history
    print("Running Engine Reconstruction...")
    v_pat, v_flux, v_inc, v_force, extra = reconstruct_history(df_assets, df_prov, 99999)
    
    if v_pat.empty:
        print("Engine returned empty data.")
        return

    # 3. Build TWR Input
    df_eng = pd.DataFrame({
        'nav': v_pat,
        'flow': v_flux,
        'income': v_inc,
        'flow_timing': extra.get('flow_timing', pd.Series(0, index=v_pat.index))
    }).sort_index()

    # 4. Calculate Daily Returns explicitly here to inspect
    # (Simplified logic from PerformanceEngine to find the culprit dates)
    df_eng['nav_start'] = df_eng['nav'].shift(1).fillna(0)
    
    # Adjust Denominator based on Flow Timing
    # If Timing=1 (SoD), Denom = Start + Flow
    # If Timing=0 (EoD), Denom = Start
    df_eng['capital_base'] = np.where(
        df_eng['flow_timing'] == 1,
        df_eng['nav_start'] + df_eng['flow'],
        df_eng['nav_start']
    )
    
    # Numerator is always same: End - Start - Flow
    df_eng['economic_gain'] = df_eng['nav'] - df_eng['nav_start'] - df_eng['flow']
    
    # Calculate Return
    # Avoid div/0
    df_eng['ret_daily'] = np.where(
        df_eng['capital_base'].abs() > 1.0,
        df_eng['economic_gain'] / df_eng['capital_base'],
        0.0
    )

    # 5. Find Worst Days
    worst_days = df_eng.sort_values('ret_daily').head(10)
    print("\n--- TOP 10 WORST DAYS ---")
    print(worst_days[['nav', 'flow', 'capital_base', 'ret_daily']])

    # 6. Deep Dive into the Worst Day
    if not worst_days.empty:
        bad_date = worst_days.index[0]
        print(f"\n--- DEEP DIVE: {bad_date.date()} ---")
        
        # Check Transactions on this day
        # Need to normalize correcty like engine does
        df_ops = df_assets.copy()
        df_ops['data'] = pd.to_datetime(df_ops['data']).dt.normalize()
        
        # We need to consider the Weekend Alignment logic
        # Ideally we should inspect the 'effective_date' from engine, but we can't easily access internal variable 'df_ops' from here.
        # We will check transactions STRICTLY on this date, and proximate dates.
        
        ops_on_day = df_ops[df_ops['data'] == bad_date]
        if ops_on_day.empty:
            print("No simple transactions found on this EXACT date. Checking surrounding days (-3 to +3)...")
            start_w = bad_date - pd.Timedelta(days=3)
            end_w = bad_date + pd.Timedelta(days=3)
            ops_near = df_ops[(df_ops['data'] >= start_w) & (df_ops['data'] <= end_w)]
            print(ops_near[['data', 'ticker', 'tipo', 'quantidade', 'preco']])
        else:
            print("Transactions causing this (supposedly):")
            print(ops_on_day[['ticker', 'tipo', 'quantidade', 'preco']])

        # Check Prices used
        prices_df = extra.get('prices', pd.DataFrame())
        if not prices_df.empty and bad_date in prices_df.index:
            print("\nMarket Prices on this day (Yahoo):")
            # Filter for assets relevant to the OPS
            tickers_of_interest = ops_on_day['ticker'].unique() if not ops_on_day.empty else []
            for t in tickers_of_interest:
                p = prices_df.at[bad_date, t] if t in prices_df.columns else "NOT FOUND"
                print(f"Ticker: {t} | Yahoo: {p}")
        else:
            print("No Price Data available for this day in 'extra'.")

if __name__ == "__main__":
    run_diagnosis()
