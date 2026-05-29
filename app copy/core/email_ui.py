"""
email_ui.py
===========
Reusable email configuration and sending UI for the Ferramentas (Config) page.
Call render_email_section() inside a st.expander to get the full UI.
"""
from __future__ import annotations

import os
import smtplib
import email.mime.multipart
import email.mime.text
from datetime import datetime, timedelta, timezone

import streamlit as st
import yfinance as yf

from core.computed import get_portfolio_snapshot
from core.data.loader import load_proventos
from core.data.provider import DataProvider
from core.report_builder import build_email_html


# ── Helpers ───────────────────────────────────────────────────────────────────

def _secret(key: str, default: str = "") -> str:
    try:
        return st.secrets[key] or default
    except Exception:
        return os.environ.get(key, default)


def _mask(val: str) -> str:
    if not val or len(val) <= 4:
        return "●●●●"
    return val[:2] + "●●●" + val[-2:]


def _fmt_brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_ticker(t: str) -> str:
    for suf in (".SA", "-USD", "-BRL", ".L", ".AS", ".TO"):
        t = t.replace(suf, "")
    return t


def _next_send_label(horas: list[int], dias: list[str], ativo: bool) -> str:
    if not ativo or not horas or not dias:
        return "Envio automático desativado."
    BRT = timezone(timedelta(hours=-3))
    now = datetime.now(BRT)
    dia_map = {"seg": 0, "ter": 1, "qua": 2, "qui": 3, "sex": 4, "sab": 5, "dom": 6}
    dias_num = sorted([dia_map[d] for d in dias if d in dia_map])
    for delta_days in range(8):
        candidate = now + timedelta(days=delta_days)
        if candidate.weekday() not in dias_num:
            continue
        for h in sorted(horas):
            dt = candidate.replace(hour=h, minute=0, second=0, microsecond=0)
            if dt > now:
                diff_min = int((dt - now).total_seconds() / 60)
                if diff_min < 60:
                    return f"Próximo envio em <strong>{diff_min} min</strong> ({dt.strftime('%H:%M')} BRT)"
                elif diff_min < 1440:
                    return f"Próximo envio em <strong>{diff_min // 60}h {diff_min % 60}min</strong> ({dt.strftime('%d/%m %H:%M')} BRT)"
                else:
                    return f"Próximo envio: <strong>{dt.strftime('%a, %d/%m às %H:%M')} BRT</strong>"
    return "Nenhum horário encontrado nos próximos dias."


# ── Cached data functions (module-level for proper caching) ───────────────────

@st.cache_data(ttl=30, show_spinner=False)
def _load_email_config() -> dict:
    return DataProvider.get_email_config()


@st.cache_data(ttl=90, show_spinner=False)
def _fetch_indices_raw() -> dict:
    pairs = {
        "^BVSP":    ("IBOVESPA",  "brl"),
        "^GSPC":    ("S&P 500",   "usd"),
        "BRL=X":    ("USD/BRL",   "brl"),
        "EURBRL=X": ("EUR/BRL",   "brl"),
        "CADBRL=X": ("CAD/BRL",   "brl"),
        "GC=F":     ("Ouro",      "usd"),
        "BTC-USD":  ("BTC/USD",   "usd"),
    }
    out = {}
    for symbol, (name, _) in pairs.items():
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if hist.empty or len(hist) < 2:
                continue
            close = hist["Close"].dropna()
            now_p, prev_p = float(close.iloc[-1]), float(close.iloc[-2])
            out[symbol] = {"name": name, "price": now_p, "pct": round(((now_p - prev_p) / prev_p) * 100, 2)}
        except Exception:
            continue
    return out


@st.cache_data(ttl=120, show_spinner=False)
def _build_report_cached(prov_periodo: int = 30) -> tuple:
    try:
        snap = get_portfolio_snapshot()
    except Exception as e:
        return None, None, 0.0, 0, {}, f"Erro ao carregar portfólio: {e}"
    if not snap.get("positions"):
        erros = "; ".join(snap.get("errors", [])) or "Sem posições"
        return snap, None, 0.0, 0, {}, f"Portfólio vazio: {erros}"
    indices_raw = _fetch_indices_raw()
    try:
        df = load_proventos()
        cutoff = datetime.now() - timedelta(days=prov_periodo)
        df_rec = df[df["data"] >= cutoff] if not df.empty and "data" in df.columns else df.iloc[0:0]
        div_total = round(float(df_rec["valor"].fillna(0).sum()), 2)
        div_count = len(df_rec)
        div_by_type: dict = {}
        if not df_rec.empty:
            type_col = next(
                (c for c in df_rec.columns if c.lower() in ("lancamento", "lançamento", "tipo", "evento")),
                None,
            )
            if type_col:
                for tp, grp in df_rec.groupby(type_col):
                    tp_str = str(tp).strip()
                    if tp_str and tp_str.upper() not in ("IMPOSTO", "TAX"):
                        div_by_type[tp_str] = round(float(grp["valor"].fillna(0).sum()), 2)
    except Exception:
        div_total, div_count, div_by_type = 0.0, 0, {}
    return snap, indices_raw, div_total, div_count, div_by_type, None


@st.cache_data(ttl=300, show_spinner=False)
def _fetch_news_cached(tickers_key: str) -> dict:
    tickers = [t for t in tickers_key.split(",") if t]
    try:
        from core.agent.news_fetcher import fetch_news_for_tickers
        return fetch_news_for_tickers(tickers, max_per_ticker=3, max_tickers=len(tickers), include_market=False)
    except Exception:
        return {}


def _get_gemini_text(snap: dict, news: dict) -> str:
    try:
        gemini_key = st.secrets.get("GEMINI_API_KEY", "") or ""
        import importlib
        _genai = importlib.import_module("google.genai")
        client = _genai.Client(api_key=gemini_key)
        pct = snap.get("portfolio_day_pnl_pct", 0)
        pat = snap.get("total_patrimonio_brl", 0)
        rv  = snap.get("rv_patrimonio_brl", 0)
        rf  = snap.get("rf_patrimonio_brl", 0)
        gainers_text = ", ".join(f"{p['ticker']} (+{p['day_pnl_pct']:.1f}%)" for p in snap.get("top_gainers", [])[:3]) or "Nenhum"
        losers_text  = ", ".join(f"{p['ticker']} ({p['day_pnl_pct']:.1f}%)"  for p in snap.get("top_losers",  [])[:3]) or "Nenhum"
        news_lines = "".join(
            f"\n- {ticker}: " + "; ".join(n["titulo"][:80] for n in items[:2])
            for ticker, items in list(news.items())[:6] if items
        )
        prompt = (
            "Você é um analista de investimentos conciso. Analise o dia do portfólio "
            "e forneça 4-6 bullet points objetivos sobre os eventos mais relevantes.\n\n"
            f"PORTFÓLIO:\n- Patrimônio: R$ {pat:,.0f}  |  RV: R$ {rv:,.0f}  |  RF: R$ {rf:,.0f}\n"
            f"- Variação: {'+' if pct >= 0 else ''}{pct:.2f}%\n"
            f"- Maiores altas: {gainers_text}\n- Maiores quedas: {losers_text}\n\n"
            f"NOTÍCIAS:{news_lines or ' Nenhuma disponível'}\n\n"
            "Forneça 4-6 pontos-chave curtos (máximo 2 linhas cada). Use bullets '- '. Seja direto."
        )
        resp = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        return resp.text or ""
    except Exception:
        return ""


# ── Main render function ───────────────────────────────────────────────────────

def render_email_section() -> None:
    """Render the complete email configuration and sending UI inside an expander."""

    env_gmail_user = _secret("GMAIL_USER")
    env_app_pass   = _secret("GMAIL_APP_PASSWORD")
    saved_cfg      = _load_email_config()
    auto_ativo     = saved_cfg.get("ativo", "nao").lower() in ("sim", "true", "1", "yes")

    def _pref(key: str, default: bool = True) -> bool:
        raw = saved_cfg.get(f"pref_{key}", "")
        return default if not raw else raw.lower() not in ("false", "0", "nao", "no")

    def _pref_int(key: str, default: int = 5) -> int:
        try:
            return int(float(saved_cfg.get(f"pref_{key}", default)))
        except (ValueError, TypeError):
            return default

    def _badge(label: str, value: str, extra_cls: str = "") -> str:
        cls = "ep-badge-ok" if value else "ep-badge-warn"
        txt = _mask(value) if value else "Ausente"
        return f'<span class="ep-badge {cls} {extra_cls}"><span class="ep-dot"></span>{label}: {txt}</span>'

    def _resolve_recipients() -> list[str]:
        cfg_dest = saved_cfg.get("destinatarios", "")
        if cfg_dest:
            return [e.strip() for e in cfg_dest.split(",") if e.strip()]
        return [e.strip() for e in _secret("EMAIL_TO", env_gmail_user).split(",") if e.strip()]

    def _build_cfg() -> dict:
        return {
            "patrimonio":    st.session_state.get("ep_inc_patrimonio",  True),
            "variacao_dia":  st.session_state.get("ep_inc_variacao",    True),
            "rf_saldo":      st.session_state.get("ep_inc_rf",          True),
            "pnl_acumulado": st.session_state.get("ep_inc_pnl_acum",   False),
            "idx_ibov":      st.session_state.get("ep_inc_ibov",        True),
            "idx_sp500":     st.session_state.get("ep_inc_sp500",       True),
            "idx_usd_brl":   st.session_state.get("ep_inc_usd_brl",    True),
            "idx_eur_brl":   st.session_state.get("ep_inc_eur_brl",    False),
            "idx_cad_brl":   st.session_state.get("ep_inc_cad_brl",    False),
            "idx_btc":       st.session_state.get("ep_inc_btc",        False),
            "idx_gold":      st.session_state.get("ep_inc_gold",       False),
            "top_altas":     st.session_state.get("ep_inc_altas",       True),
            "top_quedas":    st.session_state.get("ep_inc_quedas",      True),
            "n_top":         st.session_state.get("ep_n_top",           5),
            "pos_table":     st.session_state.get("ep_inc_pos_table",  False),
            "setor_alloc":   st.session_state.get("ep_inc_setor",      False),
            "exp_cambial":   st.session_state.get("ep_inc_cambial",    False),
            "proventos":     st.session_state.get("ep_inc_prov",        True),
            "prov_count":    st.session_state.get("ep_inc_prov_count",  True),
            "prov_tipo":     st.session_state.get("ep_inc_prov_tipo",  False),
            "prov_periodo":  st.session_state.get("ep_prov_periodo",   30),
            "noticias":      st.session_state.get("ep_inc_noticias",    True),
            "gemini":        st.session_state.get("ep_inc_gemini",      True),
        }

    # CSS (inline, scoped to ep- classes)
    st.markdown("""
<style>
.ep-section-title {
    font-size:.78rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;
    color:#06b6d4;margin:18px 0 12px;display:flex;align-items:center;gap:8px;
}
.ep-section-title::after{content:'';flex:1;height:1px;background:rgba(6,182,212,0.15);}
.ep-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;
    border-radius:20px;font-size:.72rem;font-weight:600;letter-spacing:.5px;margin:2px;}
.ep-badge-ok  {background:rgba(52,211,153,.1);color:#34d399;border:1px solid rgba(52,211,153,.2);}
.ep-badge-warn{background:rgba(248,113,113,.1);color:#f87171;border:1px solid rgba(248,113,113,.2);}
.ep-badge-info{background:rgba(99,102,241,.1);color:#818cf8;border:1px solid rgba(99,102,241,.2);}
.ep-dot{width:6px;height:6px;border-radius:50%;background:currentColor;}
.ep-next-box{background:rgba(6,182,212,.06);border:1px solid rgba(6,182,212,.15);
    border-radius:12px;padding:12px 16px;margin:10px 0;font-size:.82rem;color:#94a3b8;}
.ep-next-box strong{color:#06b6d4;}
.ep-log{background:rgba(8,13,26,.8);border-radius:12px;border:1px solid rgba(255,255,255,.06);
    padding:14px 18px;font-family:'Courier New',monospace;font-size:.76rem;
    color:#94a3b8;max-height:220px;overflow-y:auto;line-height:1.7;}
</style>
""", unsafe_allow_html=True)

    # ── 1. STATUS ────────────────────────────────────────────────────────────
    st.markdown('<div class="ep-section-title">◆ Status do Servidor de Email</div>', unsafe_allow_html=True)
    status_auto = (
        '<span class="ep-badge ep-badge-ok"><span class="ep-dot"></span>Automático: Ativo</span>'
        if auto_ativo else
        '<span class="ep-badge ep-badge-warn"><span class="ep-dot"></span>Automático: Inativo</span>'
    )
    st.markdown(
        f'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">'
        f'{_badge("Remetente", env_gmail_user)}{_badge("App Password", env_app_pass)}{status_auto}</div>',
        unsafe_allow_html=True,
    )
    st.caption("Remetente e senha configurados via `.streamlit/secrets.toml`. Destinatários e programação abaixo.")

    st.markdown('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:14px 0;">', unsafe_allow_html=True)

    # ── 2. DESTINATÁRIOS ─────────────────────────────────────────────────────
    st.markdown('<div class="ep-section-title">◎ Destinatários</div>', unsafe_allow_html=True)
    saved_recipients = saved_cfg.get("destinatarios", _secret("EMAIL_TO", env_gmail_user))
    dest_input = st.text_area(
        "Emails de destino (um por linha ou separados por vírgula)",
        value=saved_recipients.replace(",", "\n"),
        height=90,
        placeholder="email1@gmail.com\nemail2@empresa.com",
        key="ep_dest_input",
    )
    col_ds, col_di = st.columns([1, 3])
    with col_ds:
        dest_save_btn = st.button("💾 Salvar destinatários", key="ep_dest_save", use_container_width=True)
    with col_di:
        dest_preview = [e.strip() for e in dest_input.replace("\n", ",").split(",") if e.strip()]
        if dest_preview:
            badges = "".join(f'<span class="ep-badge ep-badge-info"><span class="ep-dot"></span>{e}</span>' for e in dest_preview)
            st.markdown(f'<div style="margin-top:8px;">{badges}</div>', unsafe_allow_html=True)
    if dest_save_btn:
        new_cfg = {**saved_cfg, "destinatarios": ",".join(dest_preview)}
        if DataProvider.save_email_config(new_cfg):
            st.success(f"✅ {len(dest_preview)} destinatário(s) salvos.")
            st.cache_data.clear()
            st.rerun()
        else:
            st.error("❌ Erro ao salvar. Verifique o acesso ao Google Sheets.")

    st.markdown('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:14px 0;">', unsafe_allow_html=True)

    # ── 3. PROGRAMAÇÃO ───────────────────────────────────────────────────────
    st.markdown('<div class="ep-section-title">⏰ Programação Automática (GitHub Actions)</div>', unsafe_allow_html=True)
    st.caption("A programação é salva no Google Sheets e lida pelo GitHub Actions a cada hora.")

    sc1, _ = st.columns([1, 2])
    with sc1:
        sched_ativo = st.toggle("Envio automático ativo", value=auto_ativo, key="ep_sched_ativo")

    dia_labels = {"seg": "Seg", "ter": "Ter", "qua": "Qua", "qui": "Qui", "sex": "Sex", "sab": "Sáb", "dom": "Dom"}
    saved_dias = [d.strip() for d in saved_cfg.get("dias", "seg,ter,qua,qui,sex").split(",") if d.strip() in dia_labels]
    st.markdown("**Dias da semana:**")
    dias_cols = st.columns(7)
    selected_dias = []
    for i, (k, lbl) in enumerate(dia_labels.items()):
        with dias_cols[i]:
            if st.checkbox(lbl, value=(k in saved_dias), key=f"ep_dia_{k}"):
                selected_dias.append(k)

    saved_horas = [int(h.strip()) for h in saved_cfg.get("horas", "8").split(",") if h.strip().isdigit()]
    hora_options = list(range(6, 23))
    selected_horas = st.multiselect(
        "Horários de envio (BRT — Brasília)",
        options=hora_options,
        default=[h for h in saved_horas if h in hora_options],
        format_func=lambda h: f"{h:02d}:00",
        key="ep_sched_horas",
    )
    st.markdown(f'<div class="ep-next-box">{_next_send_label(selected_horas, selected_dias, sched_ativo)}</div>', unsafe_allow_html=True)

    col_ss, col_st = st.columns([2, 1])
    with col_ss:
        sched_save_btn = st.button("💾 Salvar Programação", type="primary", key="ep_sched_save", use_container_width=True)
    with col_st:
        test_btn = st.button("⚡ Testar agora", key="ep_sched_test", use_container_width=True)

    if sched_save_btn:
        new_cfg = {**saved_cfg,
                   "ativo": "sim" if sched_ativo else "nao",
                   "dias":  ",".join(selected_dias),
                   "horas": ",".join(str(h) for h in sorted(selected_horas))}
        if DataProvider.save_email_config(new_cfg):
            st.success("✅ Programação salva.")
            st.cache_data.clear()
            st.rerun()
        else:
            st.error("❌ Erro ao salvar.")

    if test_btn:
        github_pat = _secret("GITHUB_PAT", "")
        if not github_pat:
            st.warning("Adicione `GITHUB_PAT` em `.streamlit/secrets.toml` (token com escopo `workflow`).")
        else:
            import urllib.request, urllib.error, json as _json
            _url = "https://api.github.com/repos/barrowsbr/Meus-investimentos/actions/workflows/daily-report.yml/dispatches"
            _payload = _json.dumps({"ref": "main", "inputs": {"force_send": "true"}}).encode()
            _req = urllib.request.Request(_url, data=_payload, method="POST", headers={
                "Authorization": f"Bearer {github_pat}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            })
            try:
                with urllib.request.urlopen(_req, timeout=10) as _resp:
                    if _resp.status == 204:
                        st.success("✅ Workflow disparado!")
            except urllib.error.HTTPError as _e:
                st.error(f"❌ Erro HTTP {_e.code}: {_e.read().decode()}")

    st.markdown('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:14px 0;">', unsafe_allow_html=True)

    # ── 4. CONTEÚDO ──────────────────────────────────────────────────────────
    st.markdown('<div class="ep-section-title">▣ Conteúdo do Relatório</div>', unsafe_allow_html=True)

    col_pat, col_mkt, col_cart, col_prov = st.columns(4)
    with col_pat:
        st.markdown("**Patrimônio**")
        st.toggle("Patrimônio total",   value=_pref("patrimonio",    True),  key="ep_inc_patrimonio")
        st.toggle("Variação do dia",    value=_pref("variacao_dia",  True),  key="ep_inc_variacao")
        st.toggle("Saldo Renda Fixa",   value=_pref("rf_saldo",      True),  key="ep_inc_rf")
        st.toggle("PnL Acumulado",      value=_pref("pnl_acumulado", False), key="ep_inc_pnl_acum")
    with col_mkt:
        st.markdown("**Mercado**")
        st.toggle("IBOVESPA",  value=_pref("idx_ibov",    True),  key="ep_inc_ibov")
        st.toggle("S&P 500",   value=_pref("idx_sp500",   True),  key="ep_inc_sp500")
        st.toggle("USD/BRL",   value=_pref("idx_usd_brl", True),  key="ep_inc_usd_brl")
        st.toggle("EUR/BRL",   value=_pref("idx_eur_brl", False), key="ep_inc_eur_brl")
        st.toggle("CAD/BRL",   value=_pref("idx_cad_brl", False), key="ep_inc_cad_brl")
        st.toggle("BTC/USD",   value=_pref("idx_btc",     False), key="ep_inc_btc")
        st.toggle("Ouro (GC)", value=_pref("idx_gold",    False), key="ep_inc_gold")
    with col_cart:
        st.markdown("**Carteira**")
        st.toggle("Top altas do dia",       value=_pref("top_altas",   True),  key="ep_inc_altas")
        st.toggle("Top quedas do dia",      value=_pref("top_quedas",  True),  key="ep_inc_quedas")
        _n = _pref_int("n_top", 5)
        st.select_slider("Qtd. top ativos", options=[3, 5, 7, 10], value=(_n if _n in (3, 5, 7, 10) else 5), key="ep_n_top")
        st.toggle("Tabela de posições",     value=_pref("pos_table",   False), key="ep_inc_pos_table")
        st.toggle("Alocação por setor",     value=_pref("setor_alloc", False), key="ep_inc_setor")
        st.toggle("Exposição cambial",      value=_pref("exp_cambial", False), key="ep_inc_cambial")
    with col_prov:
        st.markdown("**Proventos & Extras**")
        st.toggle("Proventos recebidos",    value=_pref("proventos",   True),  key="ep_inc_prov")
        st.toggle("Nº de pagamentos",       value=_pref("prov_count",  True),  key="ep_inc_prov_count")
        st.toggle("Detalhe por tipo",       value=_pref("prov_tipo",   False), key="ep_inc_prov_tipo")
        _pp = _pref_int("prov_periodo", 30)
        st.select_slider("Período (dias)", options=[7, 15, 30, 60, 90], value=(_pp if _pp in (7, 15, 30, 60, 90) else 30), key="ep_prov_periodo")
        st.toggle("Notícias dos ativos",    value=_pref("noticias",    True),  key="ep_inc_noticias")
        st.toggle("Análise Gemini IA",      value=_pref("gemini",      True),  key="ep_inc_gemini")

    _, _pb = st.columns([3, 1])
    with _pb:
        if st.button("💾 Salvar Preferências", key="ep_prefs_save", use_container_width=True):
            _updates = {
                "pref_patrimonio":    str(st.session_state.get("ep_inc_patrimonio",  True)).lower(),
                "pref_variacao_dia":  str(st.session_state.get("ep_inc_variacao",    True)).lower(),
                "pref_rf_saldo":      str(st.session_state.get("ep_inc_rf",          True)).lower(),
                "pref_pnl_acumulado": str(st.session_state.get("ep_inc_pnl_acum",   False)).lower(),
                "pref_idx_ibov":      str(st.session_state.get("ep_inc_ibov",        True)).lower(),
                "pref_idx_sp500":     str(st.session_state.get("ep_inc_sp500",       True)).lower(),
                "pref_idx_usd_brl":   str(st.session_state.get("ep_inc_usd_brl",    True)).lower(),
                "pref_idx_eur_brl":   str(st.session_state.get("ep_inc_eur_brl",    False)).lower(),
                "pref_idx_cad_brl":   str(st.session_state.get("ep_inc_cad_brl",    False)).lower(),
                "pref_idx_btc":       str(st.session_state.get("ep_inc_btc",        False)).lower(),
                "pref_idx_gold":      str(st.session_state.get("ep_inc_gold",       False)).lower(),
                "pref_top_altas":     str(st.session_state.get("ep_inc_altas",       True)).lower(),
                "pref_top_quedas":    str(st.session_state.get("ep_inc_quedas",      True)).lower(),
                "pref_n_top":         str(st.session_state.get("ep_n_top",           5)),
                "pref_pos_table":     str(st.session_state.get("ep_inc_pos_table",  False)).lower(),
                "pref_setor_alloc":   str(st.session_state.get("ep_inc_setor",      False)).lower(),
                "pref_exp_cambial":   str(st.session_state.get("ep_inc_cambial",    False)).lower(),
                "pref_proventos":     str(st.session_state.get("ep_inc_prov",        True)).lower(),
                "pref_prov_count":    str(st.session_state.get("ep_inc_prov_count",  True)).lower(),
                "pref_prov_tipo":     str(st.session_state.get("ep_inc_prov_tipo",  False)).lower(),
                "pref_prov_periodo":  str(st.session_state.get("ep_prov_periodo",   30)),
                "pref_noticias":      str(st.session_state.get("ep_inc_noticias",    True)).lower(),
                "pref_gemini":        str(st.session_state.get("ep_inc_gemini",      True)).lower(),
            }
            if DataProvider.save_email_config({**saved_cfg, **_updates}):
                st.success("✅ Preferências salvas!")
                st.cache_data.clear()
            else:
                st.error("❌ Erro ao salvar preferências.")

    st.markdown('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:14px 0;">', unsafe_allow_html=True)

    # ── 5. AÇÕES ─────────────────────────────────────────────────────────────
    st.markdown('<div class="ep-section-title">◈ Enviar Relatório</div>', unsafe_allow_html=True)

    btn_a, btn_b, btn_c = st.columns([1, 1, 2])
    with btn_a:
        preview_btn = st.button("👁 Pré-visualizar", key="ep_preview_btn", use_container_width=True)
    with btn_b:
        clear_btn = st.button("✕ Limpar preview", key="ep_clear_prev", use_container_width=True)
    with btn_c:
        send_btn = st.button("📤 Enviar Agora", type="primary", key="ep_send_btn", use_container_width=True)

    if clear_btn:
        st.session_state.pop("_ep_preview_loaded", None)
        st.rerun()
    if preview_btn:
        st.session_state["_ep_preview_loaded"] = True

    # Preview
    if st.session_state.get("_ep_preview_loaded"):
        st.markdown('<div class="ep-section-title">◉ Pré-visualização</div>', unsafe_allow_html=True)
        _prev_cfg = _build_cfg()
        _prev_periodo = _prev_cfg.get("prov_periodo", 30)
        with st.spinner("Carregando dados..."):
            result = _build_report_cached(_prev_periodo)
        snap, indices_raw, div_total, div_count, div_by_type, err = result
        if err:
            st.error(f"❌ {err}")
        else:
            cfg = _prev_cfg
            news: dict = {}
            if cfg.get("noticias"):
                news_tickers = list({p["ticker"] for p in (snap.get("top_gainers", [])[:3] + snap.get("top_losers", [])[:3])})
                if news_tickers:
                    with st.spinner("Buscando notícias..."):
                        news = _fetch_news_cached(",".join(sorted(news_tickers)))
            gemini_text = ""
            if cfg.get("gemini"):
                with st.spinner("Gerando análise Gemini..."):
                    gemini_text = _get_gemini_text(snap, news)

            html_content = build_email_html(
                snap, indices_raw, div_total, div_count,
                cfg=cfg, news=news, gemini_text=gemini_text,
                div_by_type=div_by_type, prov_periodo=_prev_periodo,
            )
            pct = snap["portfolio_day_pnl_pct"]
            pnl = snap["portfolio_day_pnl_r"]
            pat = snap.get("total_patrimonio_brl", 0.0)
            n   = len([p for p in snap["positions"] if p["has_price"]])
            m1, m2, m3, m4 = st.columns(4)
            with m1: st.metric("Ativos cotados", n)
            with m2: st.metric("Patrimônio", f"R$ {pat:,.0f}".replace(",", "."))
            with m3:
                sg = "+" if pct >= 0 else ""
                st.metric("Variação Hoje", f"{sg}{pct:.2f}%", delta=f"R$ {sg}{pnl:,.2f}".replace(",", "."))
            with m4: st.metric(f"Proventos {_prev_periodo}d", f"R$ {div_total:,.0f}".replace(",", "."))
            st.caption(f"Será enviado para: {', '.join(_resolve_recipients())}")
            st.components.v1.html(html_content, height=800, scrolling=True)

    # Send
    if send_btn:
        if not env_gmail_user or not env_app_pass:
            st.error("❌ Configure GMAIL_USER e GMAIL_APP_PASSWORD em `.streamlit/secrets.toml`.")
        else:
            st.markdown('<div class="ep-section-title">◉ Log de Envio</div>', unsafe_allow_html=True)
            log_lines: list[str] = []
            log_ph = st.empty()

            def _log(msg: str) -> None:
                log_lines.append(msg)
                log_ph.markdown(f'<div class="ep-log">{"<br>".join(log_lines)}</div>', unsafe_allow_html=True)

            with st.spinner("Gerando e enviando relatório..."):
                _send_cfg = _build_cfg()
                _send_periodo = _send_cfg.get("prov_periodo", 30)
                _log(f"[{datetime.now():%H:%M:%S}] Carregando portfólio...")
                result = _build_report_cached(_send_periodo)
                snap, indices_raw, div_total, div_count, div_by_type, err = result
                if err:
                    _log(f"❌ {err}")
                    st.error("Falha ao montar os dados.")
                else:
                    n_pos = len([p for p in snap["positions"] if p["has_price"]])
                    _log(f"✅ Portfólio OK — {n_pos} ativos")
                    cfg = _send_cfg
                    news, gemini_text = {}, ""
                    if cfg.get("noticias"):
                        _log(f"[{datetime.now():%H:%M:%S}] Buscando notícias...")
                        tks = list({p["ticker"] for p in (snap.get("top_gainers", [])[:3] + snap.get("top_losers", [])[:3])})
                        news = _fetch_news_cached(",".join(sorted(tks))) if tks else {}
                        _log(f"   {sum(len(v) for v in news.values())} notícias")
                    if cfg.get("gemini"):
                        _log(f"[{datetime.now():%H:%M:%S}] Gerando análise Gemini...")
                        gemini_text = _get_gemini_text(snap, news)
                        _log(f"   {'✅ Gerado' if gemini_text else '⚠️ Indisponível'}")
                    html_content = build_email_html(
                        snap, indices_raw, div_total, div_count,
                        cfg=cfg, news=news, gemini_text=gemini_text,
                        div_by_type=div_by_type, prov_periodo=_send_periodo,
                    )
                    recipients = _resolve_recipients()
                    _log(f"[{datetime.now():%H:%M:%S}] Para: {', '.join(recipients)}")
                    subject = f"📊 Relatório de Investimentos — {datetime.now().strftime('%d/%m/%Y')}"
                    msg = email.mime.multipart.MIMEMultipart("alternative")
                    msg["Subject"] = subject
                    msg["From"]    = env_gmail_user
                    msg["To"]      = ", ".join(recipients)
                    msg.attach(email.mime.text.MIMEText("Relatório disponível no HTML.", "plain"))
                    msg.attach(email.mime.text.MIMEText(html_content, "html"))
                    _log(f"[{datetime.now():%H:%M:%S}] Conectando ao Gmail SMTP...")
                    try:
                        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as server:
                            server.login(env_gmail_user, env_app_pass)
                            _log(f"✅ Autenticado como {env_gmail_user}")
                            server.sendmail(env_gmail_user, recipients, msg.as_string())
                        _log(f"✅ Enviado para {', '.join(recipients)}")
                        st.success(f"✅ Relatório enviado para **{', '.join(recipients)}**!")
                    except smtplib.SMTPAuthenticationError:
                        _log("❌ Falha de autenticação — verifique o App Password")
                        st.error("Credenciais inválidas.")
                    except Exception as exc:
                        _log(f"❌ Erro: {exc}")
                        st.error(f"Erro ao enviar: {exc}")
