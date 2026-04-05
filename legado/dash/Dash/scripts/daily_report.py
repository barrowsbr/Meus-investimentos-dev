#!/usr/bin/env python3
"""
daily_report.py
===============
Script standalone para enviar relatorio diario premium por email.
Conecta ao Google Sheets para ler posicoes reais da carteira,
busca precos de mercado via Yahoo Finance, e gera um email HTML rico.

Projetado para rodar via GitHub Actions (sem dependencia de Streamlit).
"""
from __future__ import annotations

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import json
import os
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Dict, Tuple, Optional

import pandas as pd
import yfinance as yf

# ── Configuração via variáveis de ambiente ──────────────────────────────────
GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
EMAIL_TO = os.environ.get("EMAIL_TO", GMAIL_USER)

# Google Sheets
SPREADSHEET_NAME = os.environ.get("SPREADSHEET_NAME", "gdados")
SERVICE_ACCOUNT_JSON = os.environ.get("SERVICE_ACCOUNT_JSON", "")  # JSON string

# Índices de mercado para contextualização
MARKET_INDICES = {
    "^BVSP": "IBOVESPA",
    "^GSPC": "S&P 500",
    "BRL=X": "USD/BRL",
}

# RF keywords (posições que não têm cotação no Yahoo)
_RF_KEYWORDS = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO', 'CDI', 'LFT', 'NTN']

def _is_market_ticker(ticker: str) -> bool:
    return not any(kw in ticker.upper() for kw in _RF_KEYWORDS)


# ═══════════════════════════════════════════════════════════════════════════
# 1. GOOGLE SHEETS — Carrega posições reais do portfólio
# ═══════════════════════════════════════════════════════════════════════════

def _get_gsheets_client():
    """Conecta ao Google Sheets usando service account."""
    try:
        import gspread
        from oauth2client.service_account import ServiceAccountCredentials
    except ImportError:
        print("❌ gspread / oauth2client não instalados")
        return None

    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']

    # 1. Tenta JSON da variável de ambiente (GitHub Actions)
    if SERVICE_ACCOUNT_JSON:
        try:
            creds_dict = json.loads(SERVICE_ACCOUNT_JSON)
            creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
            return gspread.authorize(creds)
        except Exception as e:
            print(f"⚠️ Erro ao usar SERVICE_ACCOUNT_JSON: {e}")

    # 2. Fallback: arquivo local
    local_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'service_account.json')
    if os.path.exists(local_file):
        creds = ServiceAccountCredentials.from_json_keyfile_name(local_file, scope)
        return gspread.authorize(creds)

    print("❌ Nenhuma credencial do Google Sheets encontrada")
    return None


def load_portfolio_from_sheets() -> pd.DataFrame:
    """Carrega a aba 'meus_ativos' do Google Sheets."""
    client = _get_gsheets_client()
    if not client:
        return pd.DataFrame()

    try:
        sh = client.open(SPREADSHEET_NAME)
        ws = sh.worksheet("meus_ativos")
        data = ws.get_all_records()
        df = pd.DataFrame(data)
        print(f"   📊 Loaded {len(df)} rows from 'meus_ativos'")
        return df
    except Exception as e:
        print(f"❌ Erro ao carregar meus_ativos: {e}")
        return pd.DataFrame()


def load_rf_from_sheets() -> pd.DataFrame:
    """Carrega a aba 'fixa_aberta' do Google Sheets."""
    client = _get_gsheets_client()
    if not client:
        return pd.DataFrame()

    try:
        sh = client.open(SPREADSHEET_NAME)
        ws = sh.worksheet("fixa_aberta")
        data = ws.get_all_records()
        df = pd.DataFrame(data)
        print(f"   📊 Loaded {len(df)} rows from 'fixa_aberta'")
        return df
    except Exception as e:
        print(f"⚠️ fixa_aberta não disponível: {e}")
        return pd.DataFrame()


def load_recent_dividends() -> pd.DataFrame:
    """Carrega proventos recentes (últimos 30 dias) do Google Sheets."""
    client = _get_gsheets_client()
    if not client:
        return pd.DataFrame()

    try:
        sh = client.open(SPREADSHEET_NAME)
        ws = sh.worksheet("meus_proventos")
        data = ws.get_all_records()
        df = pd.DataFrame(data)
        
        # Filtra últimos 30 dias
        if not df.empty and 'data' in df.columns:
            df['data_parsed'] = pd.to_datetime(df['data'], errors='coerce', dayfirst=True)
            cutoff = datetime.now() - timedelta(days=30)
            df = df[df['data_parsed'] >= cutoff]
        
        print(f"   💰 {len(df)} proventos nos últimos 30 dias")
        return df
    except Exception as e:
        print(f"⚠️ meus_proventos não disponível: {e}")
        return pd.DataFrame()


# ═══════════════════════════════════════════════════════════════════════════
# 2. CÁLCULO DE POSIÇÕES (simplificado a partir da lógica FIFO do projeto)
# ═══════════════════════════════════════════════════════════════════════════

def _parse_decimal(val) -> float:
    """Parse decimal brasileiro (vírgula) ou padrão."""
    if pd.isna(val) or val == '' or val is None:
        return 0.0
    s = str(val).strip()
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return 0.0


def calculate_positions(df: pd.DataFrame) -> pd.DataFrame:
    """Calcula posições abertas a partir do histórico de transações."""
    if df.empty:
        return pd.DataFrame()

    # Normalizar colunas (lowercase, strip)
    df.columns = [c.lower().strip() for c in df.columns]

    # Mapear para nomes padrão
    col_map = {
        'símbolo': 'ticker', 'simbolo': 'ticker', 'ativo': 'ticker', 'ticker': 'ticker',
        'tipo de transação': 'tipo', 'tipo de transacao': 'tipo', 'tipo': 'tipo', 'type': 'tipo',
        'quantidade': 'qtd', 'qtd': 'qtd', 'qty': 'qtd',
        'preço': 'preco', 'preco': 'preco', 'preço unitário': 'preco', 'preco_unitario': 'preco', 'price': 'preco',
        'moeda': 'moeda', 'currency': 'moeda',
    }

    rename = {}
    for col in df.columns:
        if col in col_map:
            rename[col] = col_map[col]
    df = df.rename(columns=rename)

    if 'ticker' not in df.columns:
        print(f"   [WARN] Col 'ticker' nao encontrada. Colunas: {list(df.columns)}")
        return pd.DataFrame()

    # Parse numéricos
    if 'qtd' not in df.columns:
        df['qtd'] = 0
    df['qtd'] = df['qtd'].apply(_parse_decimal)

    if 'preco' in df.columns:
        df['preco'] = df['preco'].apply(_parse_decimal)
    else:
        df['preco'] = 0.0

    if 'moeda' not in df.columns:
        df['moeda'] = 'BRL'

    # Ajustar sinal de quantidade com base no tipo de transação
    if 'tipo' in df.columns:
        df['tipo_lower'] = df['tipo'].astype(str).str.lower().str.strip()
        # Vendas: qtd negativa
        mask_sell = df['tipo_lower'].isin(['venda', 'sell', 'short'])
        df.loc[mask_sell, 'qtd'] = -df.loc[mask_sell, 'qtd'].abs()
        # Compras: qtd positiva
        mask_buy = df['tipo_lower'].isin(['compra', 'buy', 'long'])
        df.loc[mask_buy, 'qtd'] = df.loc[mask_buy, 'qtd'].abs()

    # Agrupa por ticker
    positions = []
    for ticker, group in df.groupby('ticker'):
        if pd.isna(ticker) or str(ticker).strip() == '':
            continue
        ticker = str(ticker).strip().upper()
        total_qty = group['qtd'].sum()
        if total_qty <= 0.001:  # posição zerada ou vendida
            continue

        # PM: custo total das compras / qty comprada
        buys = group[group['qtd'] > 0]
        total_cost = (buys['qtd'] * buys['preco']).sum()
        total_buy_qty = buys['qtd'].sum()
        pm = total_cost / total_buy_qty if total_buy_qty > 0 else 0

        moeda = group['moeda'].iloc[-1] if 'moeda' in group.columns else 'BRL'

        positions.append({
            'Ticker': ticker,
            'Qtd': round(total_qty, 6),
            'PM_Origem': round(pm, 4),
            'Moeda': str(moeda).strip().upper() if pd.notna(moeda) else 'BRL',
        })

    print(f"   [OK] {len(positions)} posicoes abertas calculadas")
    return pd.DataFrame(positions)


# ═══════════════════════════════════════════════════════════════════════════
# 3. MARKET DATA — Yahoo Finance (robusto com fallback)
# ═══════════════════════════════════════════════════════════════════════════

def fetch_market_data(tickers: List[str]) -> Tuple[Dict[str, float], Dict[str, float]]:
    """Busca preços e variações do dia via Yahoo Finance."""
    if not tickers:
        return {}, {}

    map_prices: Dict[str, float] = {}
    map_changes: Dict[str, float] = {}
    unique_tickers = list(set([t.strip().upper() for t in tickers if t.strip()]))
    print(f"   📡 Buscando {len(unique_tickers)} tickers...")

    # Batch download
    try:
        raw = yf.download(unique_tickers, period="5d", progress=False, group_by="ticker")
        if not raw.empty:
            for t in unique_tickers:
                try:
                    if isinstance(raw.columns, pd.MultiIndex):
                        if t in raw.columns.get_level_values(0):
                            close = raw[t]["Close"].dropna()
                        else:
                            continue
                    else:
                        close = raw["Close"].dropna()

                    if len(close) < 2:
                        continue

                    price_now = float(close.iloc[-1])
                    price_prev = float(close.iloc[-2])
                    if pd.notna(price_now) and price_now > 0:
                        map_prices[t] = price_now
                        map_changes[t] = price_now - price_prev
                except Exception:
                    continue
    except Exception as e:
        print(f"   ❌ Batch download falhou: {e}")

    # Fallback individual
    missing = [t for t in unique_tickers if t not in map_prices]
    if missing:
        print(f"   🔄 Fallback para {len(missing)} tickers...")
        for t in missing:
            try:
                hist = yf.Ticker(t).history(period="5d")
                if hist.empty or len(hist) < 2:
                    continue
                close = hist["Close"].dropna()
                if len(close) < 2:
                    continue
                price_now = float(close.iloc[-1])
                price_prev = float(close.iloc[-2])
                if pd.notna(price_now) and price_now > 0:
                    map_prices[t] = price_now
                    map_changes[t] = price_now - price_prev
            except Exception:
                continue

    print(f"   ✅ Dados obtidos para {len(map_prices)}/{len(unique_tickers)} tickers")
    return map_prices, map_changes


def fetch_indices() -> List[dict]:
    """Busca variação dos índices de mercado."""
    results = []
    for symbol, name in MARKET_INDICES.items():
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if hist.empty or len(hist) < 2:
                continue
            close = hist["Close"].dropna()
            price_now = float(close.iloc[-1])
            price_prev = float(close.iloc[-2])
            pct = ((price_now - price_prev) / price_prev) * 100
            results.append({"name": name, "price": price_now, "pct": round(pct, 2)})
        except Exception:
            continue
    return results


# ═══════════════════════════════════════════════════════════════════════════
# 4. SNAPSHOT — Monta o snapshot completo igual ao computed.py
# ═══════════════════════════════════════════════════════════════════════════

def build_snapshot() -> dict:
    """Monta snapshot do portfólio sem dependência de Streamlit."""
    errors = []

    # Carrega posições do Google Sheets
    df_rv = load_portfolio_from_sheets()
    df_rf = load_rf_from_sheets()
    df_dividends = load_recent_dividends()

    if df_rv.empty:
        return {"positions": [], "errors": ["Sem dados de meus_ativos"]}

    df_pos = calculate_positions(df_rv)
    if df_pos.empty:
        return {"positions": [], "errors": ["Sem posições abertas"]}

    # Tickers com cotação de mercado
    tickers_market = [t for t in df_pos['Ticker'].tolist() if _is_market_ticker(t)]

    # Busca preços
    map_prices, map_changes = fetch_market_data(tickers_market) if tickers_market else ({}, {})

    # Índices de mercado
    indices = fetch_indices()

    # Enriquece posições
    positions = []
    total_mv = 0.0
    total_day_pnl = 0.0

    for _, row in df_pos.iterrows():
        ticker = row['Ticker']
        qty = row['Qtd']
        pm = row['PM_Origem']
        moeda = row['Moeda']

        price = map_prices.get(ticker)
        change = map_changes.get(ticker, 0.0)

        if price and price > 0:
            prev = price - change
            mv = price * qty
            day_pnl = change * qty
            day_pct = (change / prev * 100) if prev > 0 else 0
            total_pnl = (price - pm) * qty
            total_pct = ((price / pm) - 1) * 100 if pm > 0 else 0
            has_price = True
        else:
            mv = pm * qty
            day_pnl = day_pct = total_pnl = total_pct = 0
            has_price = False

        total_mv += mv
        total_day_pnl += day_pnl

        positions.append({
            "ticker": ticker, "moeda": moeda, "qty": qty, "pm": pm,
            "price": round(price, 4) if price else None,
            "mv": round(mv, 2),
            "day_pnl": round(day_pnl, 2), "day_pct": round(day_pct, 2),
            "total_pnl": round(total_pnl, 2), "total_pct": round(total_pct, 2),
            "has_price": has_price,
        })

    positions.sort(key=lambda x: x["day_pct"], reverse=True)
    priced = [p for p in positions if p["has_price"]]

    # RF total
    rf_total = 0.0
    if not df_rf.empty:
        for col in ['Atual', 'atual', 'valor_atual', 'Valor Atual']:
            if col in df_rf.columns:
                rf_total = pd.to_numeric(df_rf[col].apply(_parse_decimal) if df_rf[col].dtype == object else df_rf[col], errors='coerce').fillna(0).sum()
                break

    # Proventos recentes
    div_total = 0.0
    div_count = 0
    if not df_dividends.empty:
        for col in ['valor', 'Valor', 'amount', 'total']:
            if col in df_dividends.columns:
                div_total = pd.to_numeric(df_dividends[col].apply(_parse_decimal) if df_dividends[col].dtype == object else df_dividends[col], errors='coerce').fillna(0).sum()
                div_count = len(df_dividends)
                break

    prev_total = total_mv - total_day_pnl
    portfolio_pct = (total_day_pnl / prev_total * 100) if prev_total > 0 else 0

    return {
        "positions": positions,
        "gainers": [p for p in priced if p["day_pct"] > 0][:5],
        "losers": list(reversed([p for p in priced if p["day_pct"] < 0][-5:])),
        "total_mv": round(total_mv, 2),
        "total_day_pnl": round(total_day_pnl, 2),
        "portfolio_pct": round(portfolio_pct, 2),
        "rf_total": round(rf_total, 2),
        "div_total": round(div_total, 2),
        "div_count": div_count,
        "indices": indices,
        "n_positions": len(priced),
        "errors": errors,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 5. HTML — Template premium para o email
# ═══════════════════════════════════════════════════════════════════════════

def _fmt_ticker(t: str) -> str:
    return t.replace(".SA", "").replace("-USD", "").replace("-BRL", "").replace(".L", "").replace(".AS", "").replace(".TO", "")

def _fmt_brl(val: float) -> str:
    return f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def _fmt_usd(val: float) -> str:
    return f"$ {val:,.2f}"

def generate_html_report(snap: dict) -> str:
    """Gera o HTML premium do relatório."""
    today = datetime.now().strftime("%d/%m/%Y")
    weekday = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"][datetime.now().weekday()]

    pct = snap["portfolio_pct"]
    pnl = snap["total_day_pnl"]
    pct_color = "#34d399" if pct >= 0 else "#f87171"
    pct_sign = "+" if pct >= 0 else ""
    pnl_sign = "+" if pnl >= 0 else ""

    # ── Índices ──────────────────────────────────────────────────────────
    indices_html = ""
    for idx in snap.get("indices", []):
        idx_color = "#34d399" if idx["pct"] >= 0 else "#f87171"
        idx_sign = "+" if idx["pct"] >= 0 else ""
        idx_price = _fmt_brl(idx["price"]) if "IBOV" in idx["name"] or "BRL" in idx["name"] else _fmt_usd(idx["price"])
        indices_html += f"""
        <td style="padding: 12px 8px; text-align: center; width: 33%;">
            <div style="color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">{idx['name']}</div>
            <div style="color: #f1f5f9; font-size: 14px; font-weight: 600;">{idx_price}</div>
            <div style="color: {idx_color}; font-size: 12px; font-weight: 600;">{idx_sign}{idx['pct']:.2f}%</div>
        </td>"""

    indices_section = f"""
    <div style="background: rgba(30,41,59,0.6); border-radius: 12px; padding: 4px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
            <tr>{indices_html}</tr>
        </table>
    </div>""" if indices_html else ""

    # ── Tabela de Gainers ────────────────────────────────────────────────
    def _row(p, is_up):
        color = "#34d399" if is_up else "#f87171"
        sign = "+" if is_up else ""
        arrow = "▲" if is_up else "▼"
        price_str = _fmt_usd(p["price"]) if p.get("moeda") == "USD" else _fmt_brl(p["price"])
        pnl_str = _fmt_brl(p["day_pnl"]) if p.get("moeda") != "USD" else _fmt_usd(p["day_pnl"])
        return f"""
        <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #2d3748;">
                <strong style="color: #f1f5f9;">{_fmt_ticker(p['ticker'])}</strong>
            </td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #2d3748; text-align: right; color: #94a3b8;">{price_str}</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #2d3748; text-align: right; color: {color}; font-weight: 600;">
                {arrow} {sign}{p['day_pct']:.2f}%
            </td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #2d3748; text-align: right; color: {color}; font-size: 12px;">
                {sign}{pnl_str}
            </td>
        </tr>"""

    gainers = snap.get("gainers", [])
    losers = snap.get("losers", [])

    gainer_rows = "".join(_row(p, True) for p in gainers) if gainers else '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #475569;">Sem altas hoje</td></tr>'
    loser_rows = "".join(_row(p, False) for p in losers) if losers else '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #475569;">Sem quedas hoje</td></tr>'

    # ── Métricas extra (RF + Proventos) ──────────────────────────────────
    extras = ""
    rf = snap.get("rf_total", 0)
    div_total = snap.get("div_total", 0)
    div_count = snap.get("div_count", 0)
    patrimonio = snap.get("total_mv", 0) + rf

    if rf > 0 or div_total > 0:
        rf_html = f"""
        <td style="padding: 14px; text-align: center; width: 50%;">
            <div style="color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">📦 Renda Fixa</div>
            <div style="color: #e2e8f0; font-size: 16px; font-weight: 700;">{_fmt_brl(rf)}</div>
        </td>""" if rf > 0 else ""

        div_html = f"""
        <td style="padding: 14px; text-align: center; width: 50%;">
            <div style="color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">💰 Proventos (30d)</div>
            <div style="color: #34d399; font-size: 16px; font-weight: 700;">{_fmt_brl(div_total)}</div>
            <div style="color: #475569; font-size: 11px;">{div_count} pagamentos</div>
        </td>""" if div_total > 0 else ""

        if rf_html or div_html:
            extras = f"""
            <div style="background: #1e293b; padding: 8px 16px; border-left: 1px solid #334155; border-right: 1px solid #334155;">
                <table style="width: 100%;"><tr>{rf_html}{div_html}</tr></table>
            </div>"""

    th_style = 'style="padding: 8px 14px; text-align: left; border-bottom: 1px solid #334155; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;"'
    th_right = 'style="padding: 8px 14px; text-align: right; border-bottom: 1px solid #334155; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;"'

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0b1120; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #e2e8f0;">
        <div style="max-width: 620px; margin: 0 auto; padding: 16px;">

            <!-- Header -->
            <div style="text-align: center; padding: 28px 20px 20px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px 16px 0 0; border: 1px solid #334155; border-bottom: none;">
                <h1 style="color: #f1f5f9; margin: 0; font-size: 22px; letter-spacing: 1px;">📊 Relatório Diário</h1>
                <p style="color: #64748b; margin: 6px 0 0; font-size: 13px;">{weekday}, {today}</p>
            </div>

            <!-- Portfolio Summary -->
            <div style="background: #1e293b; padding: 24px 20px; border-left: 1px solid #334155; border-right: 1px solid #334155;">
                <table style="width: 100%;"><tr>
                    <td style="text-align: center; width: 50%; vertical-align: top;">
                        <div style="color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px;">Patrimônio Total</div>
                        <div style="color: #f1f5f9; font-size: 22px; font-weight: 800;">{_fmt_brl(patrimonio)}</div>
                        <div style="color: #475569; font-size: 11px; margin-top: 2px;">{snap['n_positions']} ativos</div>
                    </td>
                    <td style="width: 1px; background: #334155;"></td>
                    <td style="text-align: center; width: 50%; vertical-align: top;">
                        <div style="color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px;">Variação Hoje</div>
                        <div style="color: {pct_color}; font-size: 28px; font-weight: 800;">{pct_sign}{pct:.2f}%</div>
                        <div style="color: {pct_color}; font-size: 12px; margin-top: 2px;">{pnl_sign}{_fmt_brl(pnl)}</div>
                    </td>
                </tr></table>
            </div>

            <!-- Índices de Mercado -->
            <div style="background: #1e293b; padding: 0 16px 12px; border-left: 1px solid #334155; border-right: 1px solid #334155;">
                {indices_section}
            </div>

            <!-- Gainers -->
            <div style="background: #1e293b; padding: 16px 16px 8px; border-left: 1px solid #334155; border-right: 1px solid #334155;">
                <h2 style="color: #34d399; margin: 0 0 12px; font-size: 15px;">🚀 Maiores Altas</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead><tr>
                        <th {th_style}>Ativo</th>
                        <th {th_right}>Preço</th>
                        <th {th_right}>Var.</th>
                        <th {th_right}>P&L</th>
                    </tr></thead>
                    <tbody>{gainer_rows}</tbody>
                </table>
            </div>

            <!-- Losers -->
            <div style="background: #1e293b; padding: 16px 16px 8px; border-left: 1px solid #334155; border-right: 1px solid #334155;">
                <h2 style="color: #f87171; margin: 0 0 12px; font-size: 15px;">🔻 Maiores Quedas</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead><tr>
                        <th {th_style}>Ativo</th>
                        <th {th_right}>Preço</th>
                        <th {th_right}>Var.</th>
                        <th {th_right}>P&L</th>
                    </tr></thead>
                    <tbody>{loser_rows}</tbody>
                </table>
            </div>

            {extras}

            <!-- Footer -->
            <div style="text-align: center; padding: 18px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 0 0 16px 16px; border: 1px solid #334155; border-top: none;">
                <p style="color: #334155; margin: 0; font-size: 10px; letter-spacing: 0.5px;">
                    BARROOTS · Gerado automaticamente · Yahoo Finance + Google Sheets
                </p>
            </div>

        </div>
    </body>
    </html>"""
    return html


# ═══════════════════════════════════════════════════════════════════════════
# 6. EMAIL — Envia via Gmail SMTP
# ═══════════════════════════════════════════════════════════════════════════

def send_email(html_content: str) -> bool:
    """Envia o email via Gmail SMTP."""
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        print("❌ GMAIL_USER e GMAIL_APP_PASSWORD não configurados.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"📊 Relatório Diário – {datetime.now().strftime('%d/%m/%Y')}"
    msg["From"] = GMAIL_USER
    msg["To"] = EMAIL_TO or GMAIL_USER

    text_part = MIMEText("Veja seu relatório diário de investimentos no HTML.", "plain")
    html_part = MIMEText(html_content, "html")
    msg.attach(text_part)
    msg.attach(html_part)

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.send_message(msg)
        print(f"✅ Email enviado para {EMAIL_TO or GMAIL_USER}")
        return True
    except Exception as e:
        print(f"❌ Erro ao enviar email: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════
# 7. MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print(f"🚀 BARROOTS – Relatório Diário")
    print(f"📅 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print("=" * 60)

    # Monta snapshot completo
    snap = build_snapshot()

    if not snap["positions"]:
        print("⚠️ Nenhuma posição disponível. Abortando.")
        if snap.get("errors"):
            for e in snap["errors"]:
                print(f"   ❌ {e}")
        return

    g = len(snap.get("gainers", []))
    l = len(snap.get("losers", []))
    print(f"\n📊 Resumo: {snap['n_positions']} ativos | {g} altas | {l} quedas")
    print(f"   Patrimônio: {_fmt_brl(snap['total_mv'] + snap['rf_total'])}")
    print(f"   P&L Dia: {'+' if snap['total_day_pnl'] >= 0 else ''}{_fmt_brl(snap['total_day_pnl'])} ({'+' if snap['portfolio_pct'] >= 0 else ''}{snap['portfolio_pct']:.2f}%)")

    if snap.get("errors"):
        print("\n⚠️ Avisos:")
        for e in snap["errors"]:
            print(f"   - {e}")

    # Gera e envia
    html = generate_html_report(snap)
    send_email(html)
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
