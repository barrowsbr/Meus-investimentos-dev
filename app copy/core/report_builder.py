"""
report_builder.py
=================
Gerador de HTML compartilhado para o relatório de investimentos.
Importado por email_ui.py (preview Streamlit) e daily_report.py (Actions).
Ambos renderizam HTML idêntico — nunca duplicar lógica de template aqui.

Entrada:
  snap          — dict de get_portfolio_snapshot()
  indices       — dict {symbol: {"name", "price", "pct"}}
  div_total     — float total proventos (BRL)
  div_count     — int quantidade de pagamentos
  cfg           — dict com flags de conteúdo (ver DEFAULT_CFG)
  news          — dict {ticker: [{"titulo","link","data","fonte"}]}  (opcional)
  gemini_text   — str análise do Gemini para o dia                  (opcional)
  div_by_type   — dict {tipo: float} breakdown por tipo de provento (opcional)
  prov_periodo  — int dias de lookback para proventos (default 30)
"""
from __future__ import annotations
from collections import defaultdict
from datetime import datetime

# ─────────────────────────────────────────────────────────────────────────────
# Configuração padrão
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_CFG: dict = {
    # Patrimônio
    "patrimonio":    True,
    "variacao_dia":  True,
    "rf_saldo":      True,
    "pnl_acumulado": False,
    # Mercado
    "idx_ibov":      True,
    "idx_sp500":     True,
    "idx_usd_brl":   True,
    "idx_eur_brl":   False,
    "idx_cad_brl":   False,
    "idx_btc":       False,
    "idx_gold":      False,
    # Carteira
    "top_altas":     True,
    "top_quedas":    True,
    "n_top":         5,
    "pos_table":     False,
    "setor_alloc":   False,
    "exp_cambial":   False,
    # Proventos & extras
    "proventos":     True,
    "prov_count":    True,
    "prov_tipo":     False,
    "prov_periodo":  30,
    "noticias":      True,
    "gemini":        True,
}

# ─────────────────────────────────────────────────────────────────────────────
# Formatadores
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def _fmt_brl_compact(v: float) -> str:
    if abs(v) >= 1_000_000:
        return f"R$ {v/1_000_000:.1f}M".replace(".", ",")
    if abs(v) >= 1_000:
        return f"R$ {v/1_000:.1f}k".replace(".", ",")
    return _fmt_brl(v)

def _fmt_price_native(price: float, moeda: str) -> str:
    if moeda == "USD":  return f"$ {price:,.2f}"
    if moeda == "EUR":  return f"€ {price:,.2f}"
    if moeda == "CAD":  return f"CA$ {price:,.2f}"
    return _fmt_brl(price)

def _fmt_ticker(t: str) -> str:
    for s in (".SA", "-USD", "-BRL", ".L", ".AS", ".TO"):
        t = t.replace(s, "")
    return t

def _sign(v: float) -> str:
    return "+" if v >= 0 else ""

def _color(v: float) -> str:
    return "#34d399" if v >= 0 else "#f87171"

# ─────────────────────────────────────────────────────────────────────────────
# Blocos HTML internos
# ─────────────────────────────────────────────────────────────────────────────

_FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

_BASE_STYLE = f"""
body {{ margin:0; padding:0; background:#08101e; font-family:{_FONT}; color:#e2e8f0; }}
"""

def _header(today: str, weekday: str) -> str:
    return f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="
        background:linear-gradient(135deg,#0f172a 0%,#1a2540 50%,#0f172a 100%);
        border-radius:20px 20px 0 0;
        border:1px solid #1e3a5f;
        border-bottom:none;
        padding:28px 28px 22px;
        text-align:center;
    ">
      <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#334155;margin-bottom:12px;">
        BARROOTS INVESTIMENTOS
      </div>
      <div style="font-size:22px;font-weight:800;color:#f1f5f9;letter-spacing:1px;margin-bottom:6px;">
        📊 Relatório Diário
      </div>
      <div style="font-size:13px;color:#64748b;">{weekday}, {today}</div>
    </td></tr>
  </table>"""


def _hero(snap: dict, cfg: dict) -> str:
    pct   = snap["portfolio_day_pnl_pct"]
    pnl   = snap["portfolio_day_pnl_r"]
    pat   = snap.get("total_patrimonio_brl", 0.0)
    rf    = snap.get("rf_patrimonio_brl", 0.0)
    rv    = snap.get("rv_patrimonio_brl", 0.0)
    n_pos = len([p for p in snap.get("positions", []) if p.get("has_price")])
    c     = _color(pct)

    total_pnl = sum(
        p.get("total_pnl_brl", 0) or 0
        for p in snap.get("positions", [])
        if p.get("has_price")
    )

    cell_defs = []
    if cfg.get("patrimonio"):
        cell_defs.append(f"""
          <div style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#475569;margin-bottom:8px;">Patrimônio Total</div>
          <div style="font-size:26px;font-weight:800;color:#f1f5f9;letter-spacing:-0.5px;">{_fmt_brl(pat)}</div>
          <div style="margin-top:8px;font-size:10px;color:#334155;">
            <span style="color:#64748b;">RV</span> {_fmt_brl_compact(rv)}
            &nbsp;·&nbsp;
            <span style="color:#64748b;">RF</span> {_fmt_brl_compact(rf)}
          </div>
          <div style="margin-top:4px;font-size:10px;color:#334155;">{n_pos} ativos cotados</div>
        """)
    if cfg.get("variacao_dia"):
        cell_defs.append(f"""
          <div style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#475569;margin-bottom:8px;">Variação do Dia</div>
          <div style="font-size:30px;font-weight:800;color:{c};">{_sign(pct)}{pct:.2f}%</div>
          <div style="margin-top:6px;font-size:13px;color:{c};font-weight:600;">{_sign(pnl)}{_fmt_brl(pnl)}</div>
        """)
    if cfg.get("pnl_acumulado"):
        pnl_c = _color(total_pnl)
        cell_defs.append(f"""
          <div style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#475569;margin-bottom:8px;">PnL Acumulado</div>
          <div style="font-size:22px;font-weight:800;color:{pnl_c};">{_sign(total_pnl)}{_fmt_brl(abs(total_pnl))}</div>
          <div style="margin-top:4px;font-size:10px;color:#334155;">desde a primeira compra</div>
        """)

    if not cell_defs:
        return ""

    n = len(cell_defs)
    w = f"{100 // n}%"
    cells_html = ""
    for i, content in enumerate(cell_defs):
        border = "border-right:1px solid #1e3a5f;" if i < n - 1 else ""
        cells_html += f'<td style="text-align:center;padding:20px 12px;vertical-align:top;width:{w};{border}">{content}</td>'

    return f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:#111827;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>{cells_html}</tr></table>
    </td></tr>
  </table>"""


def _indices(indices: dict, cfg: dict) -> str:
    symbol_map = {
        "idx_ibov":    ("^BVSP",    "IBOV",    lambda p: f"R$ {p:,.0f}".replace(",",".")),
        "idx_sp500":   ("^GSPC",    "S&P 500", lambda p: f"$ {p:,.0f}".replace(",",".")),
        "idx_usd_brl": ("BRL=X",    "USD/BRL", lambda p: f"R$ {p:.4f}"),
        "idx_eur_brl": ("EURBRL=X", "EUR/BRL", lambda p: f"R$ {p:.4f}"),
        "idx_cad_brl": ("CADBRL=X", "CAD/BRL", lambda p: f"R$ {p:.4f}"),
        "idx_btc":     ("BTC-USD",  "BTC",     lambda p: f"$ {p:,.0f}".replace(",",".")),
        "idx_gold":    ("GC=F",     "Ouro",    lambda p: f"$ {p:,.0f}".replace(",",".")),
    }
    cells = []
    for key, (sym, label, fmt) in symbol_map.items():
        if not cfg.get(key):
            continue
        info = indices.get(sym)
        if not info:
            continue
        c = _color(info["pct"])
        s = _sign(info["pct"])
        cells.append(f"""
        <td style="text-align:center;padding:12px 8px;border-right:1px solid #1e2d45;">
          <div style="font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#475569;margin-bottom:5px;">{label}</div>
          <div style="font-size:13px;font-weight:700;color:#e2e8f0;">{fmt(info['price'])}</div>
          <div style="font-size:11px;font-weight:600;color:{c};margin-top:2px;">{s}{info['pct']:.2f}%</div>
        </td>""")
    if not cells:
        return ""
    cells[-1] = cells[-1].replace("border-right:1px solid #1e2d45;", "")
    return f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:#0d1829;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;border-bottom:1px solid #1e2d45;padding:4px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>{"".join(cells)}</tr></table>
    </td></tr>
  </table>"""


def _ativo_row(p: dict, is_up: bool) -> str:
    c       = _color(p["day_pnl_pct"])
    arr     = "▲" if is_up else "▼"
    s       = _sign(p["day_pnl_pct"])
    price   = p.get("current_price") or 0
    moeda   = p.get("moeda", "BRL")
    pnl_brl = p.get("day_pnl_brl", p.get("day_pnl_r", 0))
    mv_brl  = p.get("market_value_brl", p.get("market_value", 0))
    return f"""
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #1a2540;">
        <strong style="color:#f1f5f9;font-size:13px;">{_fmt_ticker(p['ticker'])}</strong>
        <div style="font-size:10px;color:#334155;margin-top:1px;">{p.get('setor','')}</div>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #1a2540;text-align:right;color:#64748b;font-size:12px;">
        {_fmt_price_native(price, moeda)}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #1a2540;text-align:right;color:{c};font-size:13px;font-weight:700;">
        {arr} {s}{p['day_pnl_pct']:.2f}%
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #1a2540;text-align:right;">
        <div style="color:{c};font-size:12px;font-weight:600;">{_sign(pnl_brl)}{_fmt_brl(abs(pnl_brl))}</div>
        <div style="color:#334155;font-size:10px;">pos: {_fmt_brl_compact(mv_brl)}</div>
      </td>
    </tr>"""


def _news_for_ticker(ticker: str, items: list[dict], accent: str) -> str:
    if not items:
        return ""
    rows = ""
    for n in items[:2]:
        fonte  = n.get("fonte", "")
        titulo = n.get("titulo", "")[:90]
        link   = n.get("link", "#")
        rows += f"""
      <tr>
        <td style="padding:5px 14px 5px 26px;">
          <a href="{link}" style="color:#94a3b8;text-decoration:none;font-size:11px;line-height:1.5;" target="_blank">
            <span style="color:{accent};margin-right:4px;">↳</span>{titulo}
            <span style="color:#334155;"> — {fonte}</span>
          </a>
        </td>
      </tr>"""
    return rows


def _performers_section(snap: dict, cfg: dict, news: dict, kind: str) -> str:
    n         = cfg.get("n_top", 5)
    key       = "top_gainers" if kind == "altas" else "top_losers"
    positions = snap.get(key, [])[:n]
    if not positions:
        return ""

    accent   = "#34d399" if kind == "altas" else "#f87171"
    title    = f"🚀 Top {n} Altas do Dia" if kind == "altas" else f"🔻 Top {n} Quedas do Dia"

    header = f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:#0e1a2e;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;padding:16px 14px 0;">
      <div style="font-size:13px;font-weight:700;color:{accent};letter-spacing:0.5px;border-left:3px solid {accent};padding-left:10px;margin-bottom:10px;">{title}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:11px;">
        <tr>
          <th style="padding:6px 14px;text-align:left;color:#334155;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;">Ativo</th>
          <th style="padding:6px 8px;text-align:right;color:#334155;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;">Preço</th>
          <th style="padding:6px 8px;text-align:right;color:#334155;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;">Var.</th>
          <th style="padding:6px 14px;text-align:right;color:#334155;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;">Δ (BRL)</th>
        </tr>"""

    is_up     = (kind == "altas")
    rows      = "".join(_ativo_row(p, is_up) for p in positions)

    news_rows = ""
    if cfg.get("noticias") and news:
        for p in positions:
            news_rows += _news_for_ticker(p["ticker"], news.get(p["ticker"], []), accent)

    news_section = ""
    if news_rows:
        news_section = f"""
        <tr><td colspan="4" style="padding:8px 0 0;">
          <div style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#334155;padding:6px 14px;">📰 Notícias relacionadas</div>
          <table width="100%" cellpadding="0" cellspacing="0">{news_rows}</table>
        </td></tr>"""

    return header + rows + news_section + """
      </table>
    </td></tr>
  </table>"""


def _sector_alloc(snap: dict, cfg: dict) -> str:
    positions = [
        p for p in snap.get("positions", [])
        if p.get("has_price") and p.get("market_value_brl", 0) > 1
    ]
    if not positions:
        return ""
    total = sum(p.get("market_value_brl", 0) for p in positions)
    if total <= 0:
        return ""

    by_sector: dict[str, float] = defaultdict(float)
    for p in positions:
        by_sector[p.get("setor", "Outros")] += p.get("market_value_brl", 0)
    sectors = sorted(by_sector.items(), key=lambda x: x[1], reverse=True)

    rows = ""
    for setor, val in sectors:
        pct = val / total * 100
        filled = max(1, int(pct / 5))
        bar = "█" * filled + "░" * (20 - filled)
        rows += f"""
        <tr>
          <td style="padding:7px 12px;border-bottom:1px solid #1a2540;color:#e2e8f0;font-size:11px;white-space:nowrap;">{setor}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #1a2540;color:#1e3a5f;font-size:9px;font-family:'Courier New',monospace;letter-spacing:-1px;">{bar}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #1a2540;text-align:right;color:#a5b4fc;font-size:11px;font-weight:700;white-space:nowrap;">{pct:.1f}%</td>
          <td style="padding:7px 12px;border-bottom:1px solid #1a2540;text-align:right;color:#64748b;font-size:10px;white-space:nowrap;">{_fmt_brl_compact(val)}</td>
        </tr>"""

    return f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:#0d1626;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;padding:16px 14px 4px;">
      <div style="font-size:13px;font-weight:700;color:#818cf8;letter-spacing:0.5px;border-left:3px solid #6366f1;padding-left:10px;margin-bottom:10px;">◈ Alocação por Setor</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <th style="padding:5px 12px;text-align:left;color:#334155;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;">Setor</th>
          <th style="padding:5px 8px;border-bottom:1px solid #1e2d45;"></th>
          <th style="padding:5px 8px;text-align:right;color:#334155;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;">%</th>
          <th style="padding:5px 12px;text-align:right;color:#334155;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;">Valor</th>
        </tr>
        {rows}
      </table>
    </td></tr>
  </table>"""


def _positions_table(snap: dict, cfg: dict) -> str:
    positions = sorted(
        [p for p in snap.get("positions", []) if p.get("has_price") and p.get("market_value_brl", 0) > 1],
        key=lambda p: p.get("market_value_brl", 0),
        reverse=True,
    )[:20]
    if not positions:
        return ""

    rows = ""
    for p in positions:
        c       = _color(p.get("day_pnl_pct", 0))
        s       = _sign(p.get("day_pnl_pct", 0))
        mv_brl  = p.get("market_value_brl", 0)
        pnl_pct = p.get("day_pnl_pct", 0)
        tot_pnl = p.get("total_pnl_brl", 0) or 0
        tc      = _color(tot_pnl)
        rows += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #1a2540;">
            <strong style="color:#f1f5f9;font-size:12px;">{_fmt_ticker(p['ticker'])}</strong>
            <div style="font-size:9px;color:#334155;">{p.get('setor','')}</div>
          </td>
          <td style="padding:8px 8px;border-bottom:1px solid #1a2540;text-align:right;color:#64748b;font-size:11px;">{_fmt_brl_compact(mv_brl)}</td>
          <td style="padding:8px 8px;border-bottom:1px solid #1a2540;text-align:right;color:{c};font-size:11px;font-weight:600;">{s}{pnl_pct:.2f}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1a2540;text-align:right;color:{tc};font-size:10px;">{_sign(tot_pnl)}{_fmt_brl_compact(abs(tot_pnl))}</td>
        </tr>"""

    return f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:#0e1a2e;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;padding:16px 14px 0;">
      <div style="font-size:13px;font-weight:700;color:#a5b4fc;letter-spacing:0.5px;border-left:3px solid #6366f1;padding-left:10px;margin-bottom:10px;">📋 Todas as Posições</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:11px;">
        <tr>
          <th style="padding:6px 12px;text-align:left;color:#334155;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;font-size:9px;">Ativo</th>
          <th style="padding:6px 8px;text-align:right;color:#334155;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;font-size:9px;">Posição</th>
          <th style="padding:6px 8px;text-align:right;color:#334155;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;font-size:9px;">Var.Dia</th>
          <th style="padding:6px 12px;text-align:right;color:#334155;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d45;font-size:9px;">PnL Total</th>
        </tr>
        {rows}
      </table>
    </td></tr>
  </table>"""


def _cambial_exposure(snap: dict, cfg: dict) -> str:
    positions = [
        p for p in snap.get("positions", [])
        if p.get("has_price") and p.get("market_value_brl", 0) > 1
    ]
    if not positions:
        return ""
    total = sum(p.get("market_value_brl", 0) for p in positions)
    if total <= 0:
        return ""

    by_moeda: dict[str, float] = defaultdict(float)
    for p in positions:
        moeda = "Cripto" if p.get("setor") == "Cripto" else p.get("moeda", "BRL")
        by_moeda[moeda] += p.get("market_value_brl", 0)

    moeda_colors = {
        "BRL": "#34d399", "USD": "#60a5fa", "EUR": "#a78bfa",
        "CAD": "#fb923c", "Cripto": "#f59e0b",
    }
    cell_list = sorted(by_moeda.items(), key=lambda x: x[1], reverse=True)

    cells_html = ""
    for i, (moeda, val) in enumerate(cell_list):
        pct    = val / total * 100
        c      = moeda_colors.get(moeda, "#94a3b8")
        border = "border-right:1px solid #1e2d45;" if i < len(cell_list) - 1 else ""
        cells_html += f"""
        <td style="text-align:center;padding:12px 8px;{border}">
          <div style="font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#475569;margin-bottom:5px;">{moeda}</div>
          <div style="font-size:18px;font-weight:800;color:{c};">{pct:.1f}%</div>
          <div style="font-size:10px;color:#334155;margin-top:2px;">{_fmt_brl_compact(val)}</div>
        </td>"""

    return f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:#0a1220;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;border-top:1px solid #1a2040;padding:10px 12px 4px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6366f1;margin-bottom:8px;padding-left:4px;">◆ Exposição Cambial</div>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>{cells_html}</tr></table>
    </td></tr>
  </table>"""


def _gemini_section(text: str) -> str:
    if not text or not text.strip():
        return ""
    lines = text.strip().split("\n")
    html_lines = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith(("- ", "• ", "* ")):
            item = line[2:].strip()
            html_lines.append(
                f'<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #1a2540;">'
                f'<span style="color:#6366f1;font-weight:700;flex-shrink:0;">▸</span>'
                f'<span style="color:#cbd5e1;font-size:12px;line-height:1.6;">{item}</span>'
                f'</div>'
            )
        elif line.startswith("#"):
            heading = line.lstrip("#").strip()
            html_lines.append(
                f'<div style="font-size:11px;font-weight:700;color:#818cf8;letter-spacing:1px;'
                f'text-transform:uppercase;padding:8px 0 4px;">{heading}</div>'
            )
        else:
            html_lines.append(
                f'<div style="color:#94a3b8;font-size:12px;line-height:1.6;padding:4px 0;">{line}</div>'
            )

    body = "".join(html_lines)
    return f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="
        background:linear-gradient(135deg,#0f1729 0%,#111827 100%);
        border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;
        border-top:1px solid #1e2d4f;padding:18px 20px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6366f1;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        <span style="background:#1e1b4b;border:1px solid #3730a3;border-radius:6px;padding:2px 8px;">🤖 Análise — Gemini IA</span>
      </div>
      <div style="background:#090e1a;border-radius:10px;border:1px solid #1e2d50;padding:14px 16px;">
        {body}
      </div>
      <div style="font-size:9px;color:#1e2d45;text-align:right;margin-top:8px;letter-spacing:0.5px;">
        Gerado automaticamente — pode conter imprecisões
      </div>
    </td></tr>
  </table>"""


def _proventos_section(
    div_total: float,
    div_count: int,
    cfg: dict,
    div_by_type: dict | None = None,
    prov_periodo: int = 30,
) -> str:
    if not cfg.get("proventos") or div_total <= 0:
        return ""

    periodo_label = f"{prov_periodo} dias"
    count_str = (
        f'<div style="font-size:10px;color:#334155;margin-top:3px;">'
        f'{div_count} pagamentos nos últimos {periodo_label}</div>'
        if cfg.get("prov_count") else ""
    )

    breakdown_html = ""
    if cfg.get("prov_tipo") and div_by_type:
        type_rows = ""
        for tipo, val in sorted(div_by_type.items(), key=lambda x: x[1], reverse=True):
            type_rows += (
                f'<tr>'
                f'<td style="padding:3px 0;color:#475569;font-size:10px;">{tipo}</td>'
                f'<td style="padding:3px 0;text-align:right;color:#34d399;font-size:10px;font-weight:600;">{_fmt_brl(val)}</td>'
                f'</tr>'
            )
        if type_rows:
            breakdown_html = (
                f'<div style="margin-top:10px;padding-top:8px;border-top:1px solid #1a3a1a;">'
                f'<table width="100%" cellpadding="0" cellspacing="0">{type_rows}</table>'
                f'</div>'
            )

    return f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:#0a1a0e;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;border-top:1px solid #1a2d1a;padding:16px 20px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="flex:1;">
          <div style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#166534;margin-bottom:4px;">💰 Proventos recebidos (últimos {periodo_label})</div>
          <div style="font-size:20px;font-weight:800;color:#34d399;">{_fmt_brl(div_total)}</div>
          {count_str}
          {breakdown_html}
        </div>
      </div>
    </td></tr>
  </table>"""


def _footer(now: datetime) -> str:
    return f"""
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="
        background:linear-gradient(135deg,#0a0f1a 0%,#0f172a 100%);
        border-radius:0 0 20px 20px;
        border:1px solid #1e3a5f;border-top:none;
        padding:16px 20px;text-align:center;">
      <div style="font-size:9px;color:#1e3a5f;letter-spacing:1px;text-transform:uppercase;">
        BARROOTS · {now.strftime('%d/%m/%Y às %H:%M')} · Yahoo Finance + Google Sheets + Gemini AI
      </div>
    </td></tr>
  </table>"""


# ─────────────────────────────────────────────────────────────────────────────
# Função pública
# ─────────────────────────────────────────────────────────────────────────────

def build_email_html(
    snap: dict,
    indices: dict,
    div_total: float,
    div_count: int,
    cfg: dict | None = None,
    news: dict | None = None,
    gemini_text: str = "",
    div_by_type: dict | None = None,
    prov_periodo: int = 30,
) -> str:
    _cfg          = {**DEFAULT_CFG, **(cfg or {})}
    _news         = news or {}
    _div_by_type  = div_by_type or {}
    _prov_periodo = _cfg.get("prov_periodo", prov_periodo)
    now           = datetime.now()
    today         = now.strftime("%d/%m/%Y")
    weekday       = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"][now.weekday()]

    sections = "".join([
        _header(today, weekday),
        _hero(snap, _cfg),
        _indices(indices, _cfg),
        _performers_section(snap, _cfg, _news, "altas")  if _cfg.get("top_altas")   else "",
        _performers_section(snap, _cfg, _news, "quedas") if _cfg.get("top_quedas")  else "",
        _sector_alloc(snap, _cfg)                         if _cfg.get("setor_alloc") else "",
        _positions_table(snap, _cfg)                      if _cfg.get("pos_table")   else "",
        _cambial_exposure(snap, _cfg)                     if _cfg.get("exp_cambial") else "",
        _gemini_section(gemini_text)                      if _cfg.get("gemini")      else "",
        _proventos_section(div_total, div_count, _cfg, _div_by_type, _prov_periodo),
        _footer(now),
    ])

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>{_BASE_STYLE}</style>
</head>
<body>
<div style="max-width:640px;margin:0 auto;padding:16px 8px;">
{sections}
</div>
</body>
</html>"""
