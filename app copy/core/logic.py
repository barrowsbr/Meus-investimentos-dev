def identificar_setor_ativo(ticker: str) -> str:
    """
    Identifies the asset sector/class based on the ticker symbol.
    """
    t = str(ticker).upper().strip()
    t_clean = t.replace('.SA', '').replace('.L', '')
    
    # 1. Crypto Exact Matches
    lista_cripto_exata = {'BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'HBAR', 'ADA', 'BTC-USD', 'ETH-USD'}
    if t_clean in lista_cripto_exata: return 'Cripto'
    
    # 2. Crypto Prefixes
    if (t_clean.startswith('BTC') or t_clean.startswith('ETH')) and len(t_clean) < 8:
        return 'Cripto'

    # 3. Brazilian ETFs
    etfs_br = {'IVVB11', 'BOVA11', 'SMAL11', 'HASH11', 'XINA11', 'EURP11', 'GOLD11', 'B5P211'}
    if t_clean in etfs_br: return 'ETF'

    # 4. Commodities (US)
    lista_commodities = {'IAU', 'SIVR', 'SLV', 'GLD', 'DBC', 'USO'}
    if t_clean in lista_commodities: return 'Commodities'

    # 4.5. Fixed Income USD ETFs (T-Bills, Bonds)
    renda_fixa_usd = {'SHV', 'BIL'}
    if t_clean in renda_fixa_usd: return 'Renda Fixa USD'

    # 5. International ETFs (US/Global)
    etfs_usa = {'SPY', 'QQQ', 'VWRA', 'VOO', 'VNQ', 'SCHD', 'VT'}
    if t_clean in etfs_usa: return 'ETF USA'

    # 6. Fixed Income Keywords
    termos_rf = ['TESOURO', 'NTN', 'LCI', 'LCA', 'CDB', 'LC', 'DEBENTURE', 'CASH', 'CAIXA']
    if any(x in t_clean for x in termos_rf): return 'Renda Fixa'

    # 7. Brazilian Equities vs FIIs logic
    # Ends in digit?
    if t_clean[-1].isdigit():
        # Suffix detection
        if t_clean.endswith(('3', '4', '5', '6')):
             return 'Ações Brasil'
        elif t_clean.endswith('11'):
            # Specific Units that are stocks, not FIIs
            units_acoes = {
                'KLBN11', 'SAPR11', 'TAEE11', 'ALUP11', 'SANB11', 
                'BPAC11', 'ITUB11', 'BBAS11', 'EGIE11', 'ENGI11', 'TIET11', 'CPFE11'
            }
            if t_clean in units_acoes:
                return 'Ações Brasil'
            else:
                return 'FIIs'
        elif t_clean.endswith(('32', '33', '34')):
            return 'BDRs'

    # Default fallback
    return 'Ações Internacional'

def normalize_ticker(ticker: str) -> str:
    """Standardizes ticker names."""
    t = str(ticker).upper().strip()
    if not t.endswith('.SA'):
        # Heuristic: 4 letters + digit usually implies BR ticker.
        # But we must be careful not to false positive US tickers that might match this (rare).
        # Standard BR format: XXXX3, XXXX4, XXXX11.
        if len(t) >= 5 and t[-1].isdigit():
             if t.endswith(('3', '4', '5', '6', '11')):
                 # Check if it looks like a BR ticker pattern (4 letters start)
                 # e.g. PETR4
                 return f"{t}.SA"
    return t
