#!/usr/bin/env python3
"""
daily_report.py
===============
Relatório diário via GitHub Actions.
Importa os mesmos módulos core/ do Streamlit — patrimônio idêntico ao dashboard.
"""
from __future__ import annotations

import sys, io, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── Mock Streamlit ANTES de qualquer import do core ────────────────────────
# Permite reutilizar core/ sem dependência real do Streamlit
class _FakeCache:
    def __call__(self, func=None, **kwargs):
        return func if func is not None else lambda f: f
    def clear(self): pass

class _FakeSecrets:
    """Expõe env vars como st.secrets para os módulos core/."""
    def __contains__(self, key):
        if key == 'gcp_service_account':
            return bool(os.environ.get('SERVICE_ACCOUNT_JSON'))
        return bool(os.environ.get(key))

    def __getitem__(self, key):
        if key == 'gcp_service_account':
            creds = json.loads(os.environ['SERVICE_ACCOUNT_JSON'])
            if 'private_key' in creds:
                creds['private_key'] = creds['private_key'].replace('\\n', '\n')
            return creds
        val = os.environ.get(key)
        if val is None:
            raise KeyError(key)
        return val

    def get(self, key, default=None):
        try:
            return self[key]
        except Exception:
            return default

class _FakeST:
    cache_data     = _FakeCache()
    cache_resource = _FakeCache()
    secrets        = _FakeSecrets()
    def error(self, msg, *a, **kw):   print(f"[ERR]  {msg}")
    def warning(self, msg, *a, **kw): print(f"[WARN] {msg}")
    def info(self, *a, **kw):    pass
    def success(self, *a, **kw): pass

sys.modules['streamlit'] = _FakeST()

# ── Adiciona app/ ao sys.path para importar core/ ─────────────────────────
_APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import pandas as pd
import yfinance as yf

# ── Imports do core — mesmos módulos do Streamlit app ─────────────────────
from core.computed import get_portfolio_snapshot
from core.data.provider import DataProvider
from core.report_builder import build_email_html

# ── Configuração via env vars (GitHub Actions secrets) ────────────────────
GMAIL_USER         = os.environ.get("GMAIL_USER")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
EMAIL_TO           = os.environ.get("EMAIL_TO", GMAIL_USER)
FORCE_SEND         = os.environ.get("FORCE_SEND", "false").lower() in ("true", "1", "yes")

MARKET_INDICES = {
    "^BVSP":    "IBOVESPA",
    "^GSPC":    "S&P 500",
    "BRL=X":    "USD/BRL",
    "EURBRL=X": "EUR/BRL",
    "CADBRL=X": "CAD/BRL",
    "GC=F":     "Ouro",
    "BTC-USD":  "BTC/USD",
}

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or "AIzaSyDtlceSFQNzV7aWOxtw98COt6uDW9SvQX4"


# ═══════════════════════════════════════════════════════════════════════════
# SCHEDULING — lê config do Google Sheets via DataProvider
# ═══════════════════════════════════════════════════════════════════════════

def _should_send_now(cfg: dict) -> bool:
    if FORCE_SEND:
        print("   ⚡ FORCE_SEND=true — ignorando horário")
        return True

    ativo = cfg.get("ativo", "nao").lower()
    if ativo not in ("sim", "true", "1", "yes"):
        print("   ⏸ Envio automático desativado.")
        return False

    from datetime import timezone
    BRT = timezone(timedelta(hours=-3))
    now = datetime.now(BRT)
    current_hour = now.hour
    current_day  = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"][now.weekday()]

    # Parsing robusto: aceita "8", "8.0", "08" — qualquer representação numérica
    horas_cfg = []
    for h in cfg.get("horas", "").split(","):
        try:
            horas_cfg.append(int(float(h.strip())))
        except (ValueError, TypeError):
            pass

    dias_cfg = [d.strip().lower() for d in cfg.get("dias", "").split(",") if d.strip()]

    print(f"   ⏰ Agora: {current_day} {current_hour:02d}h BRT | Configurado: dias={dias_cfg} horas={horas_cfg}")

    if not horas_cfg:
        print("   ⚠️  Nenhum horário configurado — verifique a aba email_config no Sheets.")
        return False
    if current_day not in dias_cfg:
        print(f"   ⏭ Hoje ({current_day}) fora dos dias configurados.")
        return False
    if current_hour not in horas_cfg:
        print(f"   ⏭ {current_hour}h BRT não está nos horários configurados.")
        return False

    print(f"   ✅ {current_hour}h BRT de {current_day} — programação confirmada.")
    return True


def _resolve_recipients(cfg: dict) -> list[str]:
    dest = cfg.get("destinatarios", "")
    if dest:
        return [e.strip() for e in dest.split(",") if e.strip()]
    if EMAIL_TO:
        return [e.strip() for e in EMAIL_TO.split(",") if e.strip()]
    return [GMAIL_USER] if GMAIL_USER else []


# ═══════════════════════════════════════════════════════════════════════════
# ÍNDICES DE MERCADO
# ═══════════════════════════════════════════════════════════════════════════

def fetch_indices() -> dict:
    """Retorna dict {symbol: {name, price, pct}} — formato do report_builder."""
    out = {}
    for symbol, name in MARKET_INDICES.items():
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if hist.empty or len(hist) < 2:
                continue
            close = hist["Close"].dropna()
            price_now  = float(close.iloc[-1])
            price_prev = float(close.iloc[-2])
            pct = (price_now - price_prev) / price_prev * 100
            out[symbol] = {"name": name, "price": price_now, "pct": round(pct, 2)}
        except Exception:
            continue
    return out


def fetch_news_for_report(tickers: list[str]) -> dict:
    """Busca notícias dos tickers via Google News RSS + Yahoo Finance."""
    try:
        from core.agent.news_fetcher import fetch_news_for_tickers
        return fetch_news_for_tickers(
            tickers, max_per_ticker=3,
            max_tickers=len(tickers),
            include_market=False,
        )
    except Exception as e:
        print(f"   ⚠️ Notícias: {e}")
        return {}


def _gemini_analysis(snap: dict, news: dict) -> str:
    """Gera análise textual do dia via Gemini. Retorna string vazia se falhar."""
    if not GEMINI_API_KEY:
        return ""
    try:
        # Import isolado para não corromper google.auth (usado pelo gspread)
        import importlib
        _genai = importlib.import_module("google.genai")
        client = _genai.Client(api_key=GEMINI_API_KEY)

        pct = snap.get("portfolio_day_pnl_pct", 0)
        pat = snap.get("total_patrimonio_brl", 0)
        rv  = snap.get("rv_patrimonio_brl", 0)
        rf  = snap.get("rf_patrimonio_brl", 0)

        gainers = snap.get("top_gainers", [])
        losers  = snap.get("top_losers", [])
        gainers_text = ", ".join(
            f"{p['ticker']} (+{p['day_pnl_pct']:.1f}%)" for p in gainers[:3]
        ) or "Nenhum"
        losers_text = ", ".join(
            f"{p['ticker']} ({p['day_pnl_pct']:.1f}%)" for p in losers[:3]
        ) or "Nenhum"

        news_lines = ""
        for ticker, items in list(news.items())[:6]:
            if items:
                headlines = "; ".join(n["titulo"][:80] for n in items[:2])
                news_lines += f"\n- {ticker}: {headlines}"

        prompt = (
            "Você é um analista de investimentos conciso. "
            "Analise o dia do portfólio abaixo e forneça 4-6 bullet points objetivos "
            "sobre os eventos mais relevantes.\n\n"
            f"PORTFÓLIO DO DIA:\n"
            f"- Patrimônio: R$ {pat:,.0f}  |  RV: R$ {rv:,.0f}  |  RF: R$ {rf:,.0f}\n"
            f"- Variação: {'+' if pct >= 0 else ''}{pct:.2f}%\n"
            f"- Maiores altas: {gainers_text}\n"
            f"- Maiores quedas: {losers_text}\n\n"
            f"NOTÍCIAS:{news_lines or ' Nenhuma disponível'}\n\n"
            "Forneça 4-6 pontos-chave curtos (máximo 2 linhas cada) sobre o que "
            "aconteceu, possíveis causas e o que monitorar. "
            "Use bullets com '- '. Seja direto, sem introdução."
        )

        resp = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        return resp.text or ""
    except Exception as e:
        print(f"   ⚠️ Gemini: {e}")
        return ""


# ═══════════════════════════════════════════════════════════════════════════
# PROVENTOS RECENTES — via DataProvider (mesmo do app)
# ═══════════════════════════════════════════════════════════════════════════

def load_recent_dividends(period: int = 30) -> tuple[float, int, dict]:
    try:
        df = DataProvider.get_proventos()
        if df.empty:
            return 0.0, 0, {}
        date_col = next((c for c in df.columns if any(k in c.lower() for k in ['data', 'pagamento'])), None)
        val_col  = next((c for c in df.columns if 'valor' in c.lower()), None)
        if not date_col or not val_col:
            return 0.0, 0, {}
        df['_dt'] = pd.to_datetime(df[date_col], errors='coerce', dayfirst=True)
        cutoff = pd.Timestamp.now() - pd.Timedelta(days=period)
        df_rec = df[df['_dt'] >= cutoff]
        total = pd.to_numeric(df_rec[val_col], errors='coerce').fillna(0).sum()
        div_by_type: dict = {}
        type_col = next(
            (c for c in df_rec.columns if c.lower() in ("lancamento", "lançamento", "tipo", "evento")),
            None,
        )
        if type_col is not None and not df_rec.empty:
            for tp, grp in df_rec.groupby(type_col):
                tp_str = str(tp).strip()
                if tp_str and tp_str.upper() not in ("IMPOSTO", "TAX"):
                    div_by_type[tp_str] = round(
                        float(pd.to_numeric(grp[val_col], errors='coerce').fillna(0).sum()), 2
                    )
        return float(total), len(df_rec), div_by_type
    except Exception:
        return 0.0, 0, {}


# ═══════════════════════════════════════════════════════════════════════════
# FORMATADOR LOCAL — apenas para logging no terminal
# ═══════════════════════════════════════════════════════════════════════════

def _fmt_brl(val: float) -> str:
    return f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# kept for backward compat — não mais chamada; HTML gerado por report_builder
def _generate_html_legacy(snap: dict, indices: dict, div_total: float, div_count: int) -> str:
    today   = datetime.now().strftime("%d/%m/%Y")
    weekday = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"][datetime.now().weekday()]

    # Campos do get_portfolio_snapshot()
    patrimonio  = snap["total_patrimonio_brl"]
    pct         = snap["portfolio_day_pnl_pct"]
    pnl         = snap["portfolio_day_pnl_r"]
    rf          = snap["rf_patrimonio_brl"]
    n_positions = len([p for p in snap["positions"] if p["has_price"]])
    gainers     = snap["top_gainers"]
    losers      = snap["top_losers"]

    pct_color = "#34d399" if pct >= 0 else "#f87171"
    pct_sign  = "+" if pct >= 0 else ""
    pnl_sign  = "+" if pnl >= 0 else ""

    # ── Índices ──────────────────────────────────────────────────────────
    idx_html = ""
    for idx in indices:
        c = "#34d399" if idx["pct"] >= 0 else "#f87171"
        s = "+" if idx["pct"] >= 0 else ""
        price_str = _fmt_brl(idx["price"]) if "IBOV" in idx["name"] else _fmt_usd(idx["price"])
        idx_html += f"""
        <td style="padding:12px 8px;text-align:center;width:33%;">
            <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">{idx['name']}</div>
            <div style="color:#f1f5f9;font-size:14px;font-weight:600;">{price_str}</div>
            <div style="color:{c};font-size:12px;font-weight:600;">{s}{idx['pct']:.2f}%</div>
        </td>"""

    indices_section = f"""
    <div style="background:rgba(30,41,59,0.6);border-radius:12px;padding:4px;margin:16px 0;">
        <table style="width:100%;border-collapse:collapse;"><tr>{idx_html}</tr></table>
    </div>""" if idx_html else ""

    # ── Linhas de ativos ─────────────────────────────────────────────────
    def _row(p, is_up):
        color   = "#34d399" if is_up else "#f87171"
        sign    = "+" if is_up else ""
        arrow   = "▲" if is_up else "▼"
        moeda   = p.get("moeda", "BRL")
        price   = p.get("current_price") or 0
        day_pct = p.get("day_pnl_pct", 0)
        # day_pnl_brl já convertido para BRL (campo adicionado em computed.py)
        # fallback para day_pnl_r se campo ausente (compatibilidade)
        pnl_brl = p.get("day_pnl_brl", p.get("day_pnl_r", 0))
        price_str = _fmt_price_native(price, moeda)
        pnl_str   = _fmt_brl(pnl_brl)   # sempre BRL
        return f"""
        <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #2d3748;"><strong style="color:#f1f5f9;">{_fmt_ticker(p['ticker'])}</strong></td>
            <td style="padding:10px 14px;border-bottom:1px solid #2d3748;text-align:right;color:#94a3b8;">{price_str}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #2d3748;text-align:right;color:{color};font-weight:600;">{arrow} {sign}{day_pct:.2f}%</td>
            <td style="padding:10px 14px;border-bottom:1px solid #2d3748;text-align:right;color:{color};font-size:12px;">{sign}{pnl_str}</td>
        </tr>"""

    th_l = 'style="padding:8px 14px;text-align:left;border-bottom:1px solid #334155;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;"'
    th_r = 'style="padding:8px 14px;text-align:right;border-bottom:1px solid #334155;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;"'

    gainer_rows = "".join(_row(p, True) for p in gainers) if gainers else '<tr><td colspan="4" style="padding:16px;text-align:center;color:#475569;">Sem altas hoje</td></tr>'
    loser_rows  = "".join(_row(p, False) for p in losers)  if losers  else '<tr><td colspan="4" style="padding:16px;text-align:center;color:#475569;">Sem quedas hoje</td></tr>'

    # ── RF + Proventos ───────────────────────────────────────────────────
    extras = ""
    if rf > 0 or div_total > 0:
        rf_html  = f'<td style="padding:14px;text-align:center;width:50%;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">📦 Renda Fixa</div><div style="color:#e2e8f0;font-size:16px;font-weight:700;">{_fmt_brl(rf)}</div></td>' if rf > 0 else ""
        div_html = f'<td style="padding:14px;text-align:center;width:50%;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">💰 Proventos (30d)</div><div style="color:#34d399;font-size:16px;font-weight:700;">{_fmt_brl(div_total)}</div><div style="color:#475569;font-size:11px;">{div_count} pagamentos</div></td>' if div_total > 0 else ""
        if rf_html or div_html:
            extras = f'<div style="background:#1e293b;padding:8px 16px;border-left:1px solid #334155;border-right:1px solid #334155;"><table style="width:100%;"><tr>{rf_html}{div_html}</tr></table></div>'

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0b1120;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#e2e8f0;">
<div style="max-width:620px;margin:0 auto;padding:16px;">

    <div style="text-align:center;padding:28px 20px 20px;background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:16px 16px 0 0;border:1px solid #334155;border-bottom:none;">
        <h1 style="color:#f1f5f9;margin:0;font-size:22px;letter-spacing:1px;">📊 Relatório Diário</h1>
        <p style="color:#64748b;margin:6px 0 0;font-size:13px;">{weekday}, {today}</p>
    </div>

    <div style="background:#1e293b;padding:24px 20px;border-left:1px solid #334155;border-right:1px solid #334155;">
        <table style="width:100%;"><tr>
            <td style="text-align:center;width:50%;vertical-align:top;">
                <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Patrimônio Total</div>
                <div style="color:#f1f5f9;font-size:22px;font-weight:800;">{_fmt_brl(patrimonio)}</div>
                <div style="color:#475569;font-size:11px;margin-top:2px;">{n_positions} ativos</div>
            </td>
            <td style="width:1px;background:#334155;"></td>
            <td style="text-align:center;width:50%;vertical-align:top;">
                <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Variação Hoje</div>
                <div style="color:{pct_color};font-size:28px;font-weight:800;">{pct_sign}{pct:.2f}%</div>
                <div style="color:{pct_color};font-size:12px;margin-top:2px;">{pnl_sign}{_fmt_brl(pnl)}</div>
            </td>
        </tr></table>
    </div>

    <div style="background:#1e293b;padding:0 16px 12px;border-left:1px solid #334155;border-right:1px solid #334155;">
        {indices_section}
    </div>

    <div style="background:#1e293b;padding:16px 16px 8px;border-left:1px solid #334155;border-right:1px solid #334155;">
        <h2 style="color:#34d399;margin:0 0 12px;font-size:15px;">🚀 Maiores Altas</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr><th {th_l}>Ativo</th><th {th_r}>Preço</th><th {th_r}>Var.</th><th {th_r}>Δ (BRL)</th></tr></thead>
            <tbody>{gainer_rows}</tbody>
        </table>
    </div>

    <div style="background:#1e293b;padding:16px 16px 8px;border-left:1px solid #334155;border-right:1px solid #334155;">
        <h2 style="color:#f87171;margin:0 0 12px;font-size:15px;">🔻 Maiores Quedas</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr><th {th_l}>Ativo</th><th {th_r}>Preço</th><th {th_r}>Var.</th><th {th_r}>Δ (BRL)</th></tr></thead>
            <tbody>{loser_rows}</tbody>
        </table>
    </div>

    {extras}

    <div style="text-align:center;padding:18px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:0 0 16px 16px;border:1px solid #334155;border-top:none;">
        <p style="color:#334155;margin:0;font-size:10px;letter-spacing:0.5px;">BARROOTS · Gerado automaticamente · Yahoo Finance + Google Sheets</p>
    </div>

</div>
</body>
</html>"""


# ═══════════════════════════════════════════════════════════════════════════
# EMAIL
# ═══════════════════════════════════════════════════════════════════════════

def send_email(html_content: str, recipients: list[str]) -> bool:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        print("❌ GMAIL_USER/GMAIL_APP_PASSWORD não configurados.")
        return False
    if not recipients:
        print("❌ Nenhum destinatário.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"📊 Relatório Diário – {datetime.now().strftime('%d/%m/%Y')}"
    msg["From"]    = GMAIL_USER
    msg["To"]      = ", ".join(recipients)
    msg.attach(MIMEText("Veja seu relatório diário de investimentos no HTML.", "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, recipients, msg.as_string())
        print(f"✅ Email enviado para {', '.join(recipients)}")
        return True
    except Exception as e:
        print(f"❌ Erro ao enviar email: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════
# PREFERÊNCIAS DE CONTEÚDO — lidas da aba email_config (chaves pref_*)
# ═══════════════════════════════════════════════════════════════════════════

def _build_report_cfg(email_cfg: dict) -> dict:
    """
    Constrói o dict de flags de conteúdo a partir das preferências salvas
    na aba email_config (chaves pref_*). Usa defaults se não encontrado.
    Mesma lógica de _pref() do 12_Emails.py — mantidas em sincronia.
    """
    def _b(key: str, default: bool) -> bool:
        raw = email_cfg.get(f"pref_{key}", "")
        return default if not raw else raw.lower() not in ("false", "0", "nao", "no")

    def _i(key: str, default: int) -> int:
        try:
            return int(float(email_cfg.get(f"pref_{key}", default)))
        except (ValueError, TypeError):
            return default

    return {
        "patrimonio":    _b("patrimonio",    True),
        "variacao_dia":  _b("variacao_dia",  True),
        "rf_saldo":      _b("rf_saldo",      True),
        "pnl_acumulado": _b("pnl_acumulado", False),
        "idx_ibov":      _b("idx_ibov",      True),
        "idx_sp500":     _b("idx_sp500",     True),
        "idx_usd_brl":   _b("idx_usd_brl",   True),
        "idx_eur_brl":   _b("idx_eur_brl",   False),
        "idx_cad_brl":   _b("idx_cad_brl",   False),
        "idx_btc":       _b("idx_btc",       False),
        "idx_gold":      _b("idx_gold",      False),
        "top_altas":     _b("top_altas",     True),
        "top_quedas":    _b("top_quedas",    True),
        "n_top":         _i("n_top",         5),
        "pos_table":     _b("pos_table",     False),
        "setor_alloc":   _b("setor_alloc",   False),
        "exp_cambial":   _b("exp_cambial",   False),
        "proventos":     _b("proventos",     True),
        "prov_count":    _b("prov_count",    True),
        "prov_tipo":     _b("prov_tipo",     False),
        "prov_periodo":  _i("prov_periodo",  30),
        "noticias":      _b("noticias",      True),
        "gemini":        _b("gemini",        True),
    }


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print(f"🚀 BARROOTS – Relatório Diário")
    print(f"📅 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print("=" * 60)

    print("\n📋 Verificando configuração de envio...")
    try:
        email_cfg = DataProvider.get_email_config()
        if email_cfg:
            print(f"   Config lida do Sheets: {email_cfg}")
        else:
            print("   ⚠️ email_config vazia ou aba não encontrada no Google Sheets.")
    except Exception as e:
        print(f"   ⚠️ Erro ao ler email_config: {e}")
        email_cfg = {}

    if not _should_send_now(email_cfg):
        print("⏸ Nada a enviar neste ciclo. Encerrando.")
        return

    recipients = _resolve_recipients(email_cfg)
    print(f"   📬 Destinatários: {', '.join(recipients)}")

    print("\n📊 Calculando snapshot do portfólio (core/computed.py)...")
    snap = get_portfolio_snapshot()

    if snap.get("errors"):
        for e in snap["errors"]:
            print(f"   ⚠️ {e}")

    if not snap.get("positions"):
        print("❌ Nenhuma posição disponível. Abortando.")
        return

    print(f"   Patrimônio: {_fmt_brl(snap['total_patrimonio_brl'])}")
    print(f"   RV:         {_fmt_brl(snap['rv_patrimonio_brl'])}")
    print(f"   RF:         {_fmt_brl(snap['rf_patrimonio_brl'])}")
    pnl = snap['portfolio_day_pnl_r']
    pct = snap['portfolio_day_pnl_pct']
    print(f"   P&L Dia:    {'+' if pnl >= 0 else ''}{_fmt_brl(pnl)} ({'+' if pct >= 0 else ''}{pct:.2f}%)")

    print("\n📡 Buscando índices de mercado...")
    indices = fetch_indices()

    report_cfg = _build_report_cfg(email_cfg)
    prov_periodo = report_cfg.get("prov_periodo", 30)
    print(f"\n💰 Carregando proventos recentes (últimos {prov_periodo}d)...")
    div_total, div_count, div_by_type = load_recent_dividends(prov_periodo)

    # Tickers para buscar notícias (gainers + losers, sem duplicatas)
    news_tickers = list({
        p["ticker"]
        for p in (snap.get("top_gainers", [])[:3] + snap.get("top_losers", [])[:3])
    })
    print(f"\n📰 Buscando notícias para: {', '.join(news_tickers) or 'nenhum'}...")
    news = fetch_news_for_report(news_tickers)
    print(f"   {sum(len(v) for v in news.values())} notícias encontradas")

    print("\n🤖 Gerando análise Gemini...")
    gemini_text = _gemini_analysis(snap, news)
    if gemini_text:
        print(f"   ✅ Análise gerada ({len(gemini_text)} chars)")
    else:
        print("   ⚠️ Análise Gemini indisponível")

    print(f"\n⚙️  Preferências do relatório: {report_cfg}")

    html = build_email_html(
        snap, indices, div_total, div_count,
        cfg=report_cfg, news=news, gemini_text=gemini_text,
        div_by_type=div_by_type, prov_periodo=prov_periodo,
    )
    send_email(html, recipients)
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
