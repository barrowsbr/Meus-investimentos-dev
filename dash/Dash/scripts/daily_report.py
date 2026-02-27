#!/usr/bin/env python3
"""
daily_report.py
===============
Script standalone para enviar relatório diário de ganhadores/perdedores por email.
Projetado para rodar via GitHub Actions (sem dependência de Streamlit).
"""
from __future__ import annotations

import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Dict, Tuple

import pandas as pd
import yfinance as yf

# ── Configuração via variáveis de ambiente ──────────────────────────────────
GMAIL_USER = os.environ.get("GMAIL_USER")  # seu-email@gmail.com
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")  # App Password do Gmail
EMAIL_TO = os.environ.get("EMAIL_TO", GMAIL_USER)  # destinatário (default: mesmo email)

# ── Tickers do portfólio ────────────────────────────────────────────────────
PORTFOLIO_TICKERS = [
    # Brasil
    "KNCR11.SA", "ITUB4.SA", "CMIG4.SA",
    # EUA
    "KO", "SIVR", "IAU", "QQQ", "NVDA", "GOOGL", "TSM",
    "IBKR", "VRSN", "SPY", "MSFT", "META", "TTWO",
    # Europa
    "VWRA.L", "ASML.AS",
    # Canadá
    "DPM.TO",
    # Crypto
    "BTC-USD",
]


def fetch_market_data(tickers: List[str]) -> Tuple[Dict[str, float], Dict[str, float]]:
    """Busca preços e variações do dia via Yahoo Finance."""
    if not tickers:
        return {}, {}

    map_prices: Dict[str, float] = {}
    map_changes: Dict[str, float] = {}

    unique_tickers = list(set([t.strip().upper() for t in tickers if t.strip()]))
    print(f"   📡 Buscando {len(unique_tickers)} tickers: {unique_tickers}")

    # ── Tentativa 1: Batch download ──────────────────────────────────────
    try:
        raw = yf.download(unique_tickers, period="5d", progress=False, group_by="ticker")
        print(f"   📦 Shape retornado: {raw.shape}, Columns type: {type(raw.columns)}")

        if not raw.empty:
            for t in unique_tickers:
                try:
                    # yfinance >= 0.2.40 retorna MultiIndex: (Ticker, Price)
                    if isinstance(raw.columns, pd.MultiIndex):
                        if t in raw.columns.get_level_values(0):
                            close = raw[t]["Close"].dropna()
                        else:
                            continue
                    else:
                        # Single ticker → colunas simples
                        close = raw["Close"].dropna()

                    if len(close) < 2:
                        continue

                    price_now = float(close.iloc[-1])
                    price_prev = float(close.iloc[-2])

                    if pd.notna(price_now) and price_now > 0:
                        map_prices[t] = price_now
                        map_changes[t] = price_now - price_prev

                except Exception as ex:
                    print(f"   ⚠️ Erro processando {t} no batch: {ex}")
                    continue

    except Exception as e:
        print(f"   ❌ Batch download falhou: {e}")

    # ── Tentativa 2: Fallback individual para tickers que faltaram ────────
    missing = [t for t in unique_tickers if t not in map_prices]
    if missing:
        print(f"   🔄 Fallback individual para {len(missing)} tickers: {missing}")
        for t in missing:
            try:
                tk = yf.Ticker(t)
                hist = tk.history(period="5d")
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
            except Exception as ex:
                print(f"   ⚠️ Fallback falhou para {t}: {ex}")

    print(f"   ✅ Dados obtidos para {len(map_prices)}/{len(unique_tickers)} tickers")
    return map_prices, map_changes


def get_performers(tickers: List[str]) -> List[dict]:
    """Retorna lista ordenada de desempenho do dia."""
    if not tickers:
        return []

    map_prices, map_changes = fetch_market_data(tickers)
    result = []

    for t in tickers:
        price = map_prices.get(t, 0.0)
        change = map_changes.get(t, 0.0)
        prev = price - change

        if prev > 0 and price > 0:
            pct = (change / prev) * 100
            result.append({
                "ticker": t,
                "pct": round(pct, 2),
                "change": round(change, 2),
                "price": round(price, 2),
            })

    return sorted(result, key=lambda x: x["pct"], reverse=True)


def generate_html_report(performers: List[dict]) -> str:
    """Gera o HTML do relatório de email."""
    today = datetime.now().strftime("%d/%m/%Y")

    gainers = [p for p in performers if p["pct"] > 0]
    losers = [p for p in performers if p["pct"] < 0]

    def format_ticker(t: str) -> str:
        return t.replace(".SA", "").replace("-USD", "").replace("-BRL", "")

    def row_html(p: dict, is_gainer: bool) -> str:
        color = "#34d399" if is_gainer else "#f87171"
        sign = "+" if is_gainer else ""
        arrow = "▲" if is_gainer else "▼"
        return f"""
        <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #2d3748;">
                <strong style="color: #f1f5f9;">{format_ticker(p['ticker'])}</strong>
            </td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #2d3748; text-align: right;">
                R$ {p['price']:,.2f}
            </td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #2d3748; text-align: right; color: {color};">
                {arrow} {sign}{p['pct']:.2f}%
            </td>
        </tr>
        """

    gainers_rows = "".join(row_html(p, True) for p in gainers[:5])
    losers_rows = "".join(row_html(p, False) for p in losers[-5:])

    # Resumo do portfólio
    total_var = sum(p["pct"] for p in performers) / len(performers) if performers else 0
    portfolio_color = "#34d399" if total_var >= 0 else "#f87171"
    portfolio_sign = "+" if total_var >= 0 else ""

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Tahoma, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">

            <!-- Header -->
            <div style="text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px 16px 0 0; border: 1px solid #334155;">
                <h1 style="color: #f1f5f9; margin: 0; font-size: 24px;">📊 Relatório Diário</h1>
                <p style="color: #64748b; margin: 8px 0 0; font-size: 14px;">{today}</p>
            </div>

            <!-- Portfolio Summary -->
            <div style="background: #1e293b; padding: 20px; border-left: 1px solid #334155; border-right: 1px solid #334155;">
                <div style="text-align: center;">
                    <p style="color: #94a3b8; margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Variação média do portfólio</p>
                    <p style="color: {portfolio_color}; margin: 0; font-size: 32px; font-weight: bold;">{portfolio_sign}{total_var:.2f}%</p>
                </div>
            </div>

            <!-- Gainers Section -->
            <div style="background: #1e293b; padding: 20px; border-left: 1px solid #334155; border-right: 1px solid #334155;">
                <h2 style="color: #34d399; margin: 0 0 16px; font-size: 16px; display: flex; align-items: center;">
                    🚀 Maiores Altas
                </h2>
                <table style="width: 100%; border-collapse: collapse; color: #94a3b8; font-size: 14px;">
                    <thead>
                        <tr style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">
                            <th style="padding: 8px 16px; text-align: left; border-bottom: 1px solid #334155;">Ativo</th>
                            <th style="padding: 8px 16px; text-align: right; border-bottom: 1px solid #334155;">Preço</th>
                            <th style="padding: 8px 16px; text-align: right; border-bottom: 1px solid #334155;">Var.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gainers_rows if gainers_rows else '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #64748b;">Sem altas hoje</td></tr>'}
                    </tbody>
                </table>
            </div>

            <!-- Losers Section -->
            <div style="background: #1e293b; padding: 20px; border-left: 1px solid #334155; border-right: 1px solid #334155;">
                <h2 style="color: #f87171; margin: 0 0 16px; font-size: 16px; display: flex; align-items: center;">
                    🔻 Maiores Quedas
                </h2>
                <table style="width: 100%; border-collapse: collapse; color: #94a3b8; font-size: 14px;">
                    <thead>
                        <tr style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">
                            <th style="padding: 8px 16px; text-align: left; border-bottom: 1px solid #334155;">Ativo</th>
                            <th style="padding: 8px 16px; text-align: right; border-bottom: 1px solid #334155;">Preço</th>
                            <th style="padding: 8px 16px; text-align: right; border-bottom: 1px solid #334155;">Var.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {losers_rows if losers_rows else '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #64748b;">Sem quedas hoje</td></tr>'}
                    </tbody>
                </table>
            </div>

            <!-- Footer -->
            <div style="text-align: center; padding: 20px; background: #1e293b; border-radius: 0 0 16px 16px; border: 1px solid #334155; border-top: none;">
                <p style="color: #475569; margin: 0; font-size: 11px;">
                    Gerado automaticamente · Dados: Yahoo Finance
                </p>
            </div>

        </div>
    </body>
    </html>
    """
    return html


def send_email(html_content: str) -> bool:
    """Envia o email via Gmail SMTP."""
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        print("❌ Erro: GMAIL_USER e GMAIL_APP_PASSWORD devem estar configurados.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"📊 Relatório Diário - {datetime.now().strftime('%d/%m/%Y')}"
    msg["From"] = GMAIL_USER
    msg["To"] = EMAIL_TO or GMAIL_USER

    # Versão texto simples (fallback)
    text_part = MIMEText("Veja seu relatório diário de investimentos.", "plain")
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


def main():
    print("🚀 Iniciando relatório diário...")
    print(f"📅 Data: {datetime.now().strftime('%d/%m/%Y %H:%M')}")

    # Busca dados de mercado
    print(f"📈 Buscando dados para {len(PORTFOLIO_TICKERS)} tickers...")
    performers = get_performers(PORTFOLIO_TICKERS)

    if not performers:
        print("⚠️ Nenhum dado de mercado disponível. Abortando.")
        return

    gainers = [p for p in performers if p["pct"] > 0]
    losers = [p for p in performers if p["pct"] < 0]
    print(f"   ✅ {len(gainers)} altas | 🔻 {len(losers)} quedas")

    # Gera HTML
    html_report = generate_html_report(performers)

    # Envia email
    send_email(html_report)


if __name__ == "__main__":
    main()
