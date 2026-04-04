"""
12_Emails.py
============
Página para envio manual de relatórios por email.
Substitui temporariamente a automação do GitHub Actions enquanto ela é corrigida.
"""

import streamlit as st
import os
import smtplib
import sys
from pathlib import Path
from datetime import datetime

from core.auth import require_auth
from core.theme import inject_global_theme, render_back_button
from core.ui import render_fab

# --- AUTH CHECK ---
require_auth()

# --- PAGE CONFIG ---
st.set_page_config(
    page_title="Relatórios por Email",
    page_icon="✉️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

inject_global_theme()
render_fab()

# --- CSS ---
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

html, body, [class*="css"] { font-family: 'Outfit', sans-serif; }

section[data-testid="stSidebar"],
[data-testid="collapsedControl"] { display: none !important; }

/* ── Page header ── */
.email-page-header {
    text-align: center;
    padding: 48px 20px 32px;
}
.email-page-icon {
    font-size: 2.8rem;
    margin-bottom: 12px;
    display: block;
    filter: drop-shadow(0 0 12px rgba(6,182,212,0.5));
}
.email-page-title {
    font-size: 2.2rem;
    font-weight: 800;
    color: #f1f5f9;
    letter-spacing: 2px;
    margin-bottom: 8px;
}
.email-page-subtitle {
    font-size: 0.95rem;
    color: #64748b;
    letter-spacing: 1px;
}

/* ── Glass cards ── */
.email-glass-card {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 28px 32px;
    margin-bottom: 16px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    position: relative;
    overflow: hidden;
}
.email-glass-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 20px;
    padding: 1px;
    background: linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(8,145,178,0.08) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
}

.email-section-title {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #06b6d4;
    margin-bottom: 18px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.email-section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(6,182,212,0.2);
}

/* ── Status badges ── */
.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.5px;
}
.status-ok {
    background: rgba(52, 211, 153, 0.12);
    border: 1px solid rgba(52, 211, 153, 0.3);
    color: #34d399;
}
.status-warn {
    background: rgba(251, 146, 60, 0.12);
    border: 1px solid rgba(251, 146, 60, 0.3);
    color: #fb923c;
}
.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    animation: pulseDot 2s ease-in-out infinite;
}
@keyframes pulseDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.35; transform: scale(0.65); }
}

/* ── Config row ── */
.config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.config-row:last-child { border-bottom: none; }
.config-key {
    font-size: 0.82rem;
    color: #94a3b8;
    font-family: 'Courier New', monospace;
}
.config-val {
    font-size: 0.78rem;
    color: #64748b;
}

/* ── Preview iframe ── */
.preview-wrapper {
    background: #0b1120;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
    margin-top: 8px;
}

/* ── Streamlit widget overrides ── */
.stTextInput > div > div > input,
.stTextArea > div > div > textarea {
    background: rgba(15, 23, 42, 0.6) !important;
    border: 1px solid rgba(255,255,255,0.08) !important;
    border-radius: 10px !important;
    color: #f1f5f9 !important;
    font-family: 'Outfit', sans-serif !important;
}
.stTextInput > div > div > input:focus,
.stTextArea > div > div > textarea:focus {
    border-color: rgba(6,182,212,0.4) !important;
    box-shadow: 0 0 0 2px rgba(6,182,212,0.1) !important;
}
.stButton > button {
    border-radius: 12px !important;
    font-family: 'Outfit', sans-serif !important;
    font-weight: 600 !important;
    letter-spacing: 1px !important;
    transition: all 0.3s cubic-bezier(0.4,0,0.2,1) !important;
}
.stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%) !important;
    border: none !important;
    color: #0b1120 !important;
}
.stButton > button[kind="primary"]:hover {
    transform: translateY(-2px) !important;
    box-shadow: 0 8px 24px rgba(6,182,212,0.35) !important;
}
.stExpander {
    background: rgba(10, 18, 35, 0.4) !important;
    backdrop-filter: blur(18px) !important;
    -webkit-backdrop-filter: blur(18px) !important;
    border: 1px solid rgba(99, 102, 241, 0.08) !important;
    border-radius: 16px !important;
    margin-bottom: 12px !important;
}

/* ── Log box ── */
.log-box {
    background: rgba(8, 13, 26, 0.8);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    padding: 16px 20px;
    font-family: 'Courier New', monospace;
    font-size: 0.78rem;
    color: #94a3b8;
    max-height: 240px;
    overflow-y: auto;
    line-height: 1.7;
}
</style>
""", unsafe_allow_html=True)

# --- PAGE HEADER ---
render_back_button()

st.markdown("""
<div class="email-page-header">
    <span class="email-page-icon">✉️</span>
    <div class="email-page-title">RELATÓRIOS POR EMAIL</div>
    <div class="email-page-subtitle">Envio manual enquanto as automações são corrigidas</div>
</div>
""", unsafe_allow_html=True)

# ── Helpers ──────────────────────────────────────────────────────────────────

def _mask(val: str) -> str:
    """Mascara valor sensível para exibição."""
    if not val:
        return "—"
    if len(val) <= 6:
        return "●" * len(val)
    return val[:3] + "●" * (len(val) - 6) + val[-3:]


def _check_smtp(user: str, password: str) -> tuple[bool, str]:
    """Testa conexão SMTP sem enviar email."""
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=8) as s:
            s.login(user, password)
        return True, "Conexão SMTP bem-sucedida"
    except smtplib.SMTPAuthenticationError:
        return False, "Credenciais inválidas — verifique App Password"
    except Exception as e:
        return False, str(e)


# ── Ler variáveis de ambiente ─────────────────────────────────────────────────
env_gmail_user = os.environ.get("GMAIL_USER", "")
env_app_pass   = os.environ.get("GMAIL_APP_PASSWORD", "")
env_email_to   = os.environ.get("EMAIL_TO", "")

# ── 1. STATUS DA CONFIGURAÇÃO ─────────────────────────────────────────────────
st.markdown("""
<div class="email-glass-card">
    <div class="email-section-title">◉ Configuração de Credenciais</div>
""", unsafe_allow_html=True)

c1, c2, c3 = st.columns(3)

def _badge(label, value):
    ok = bool(value)
    cls = "status-ok" if ok else "status-warn"
    txt = "Configurado" if ok else "Ausente"
    return f'<span class="status-badge {cls}"><span class="status-dot"></span>{label}: {txt}</span>'

st.markdown(
    f'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">'
    f'{_badge("GMAIL_USER", env_gmail_user)}'
    f'{_badge("GMAIL_APP_PASSWORD", env_app_pass)}'
    f'{_badge("EMAIL_TO", env_email_to)}'
    f'</div>',
    unsafe_allow_html=True
)

with st.expander("Ver detalhes das variáveis"):
    st.markdown(
        f'<div class="config-row"><span class="config-key">GMAIL_USER</span><span class="config-val">{_mask(env_gmail_user) if env_gmail_user else "não definido"}</span></div>'
        f'<div class="config-row"><span class="config-key">GMAIL_APP_PASSWORD</span><span class="config-val">{_mask(env_app_pass) if env_app_pass else "não definido"}</span></div>'
        f'<div class="config-row"><span class="config-key">EMAIL_TO</span><span class="config-val">{env_email_to or "não definido (usa GMAIL_USER)"}</span></div>',
        unsafe_allow_html=True,
    )
    st.caption("Para configurar: defina as variáveis de ambiente antes de iniciar o Streamlit, ou use secrets do Streamlit Cloud.")

st.markdown("</div>", unsafe_allow_html=True)

# ── 2. CONFIGURAR ENVIO ───────────────────────────────────────────────────────
st.markdown("""
<div class="email-glass-card">
    <div class="email-section-title">▣ Configurar Envio</div>
""", unsafe_allow_html=True)

col_a, col_b = st.columns(2)

with col_a:
    gmail_user = st.text_input(
        "Remetente (Gmail)",
        value=env_gmail_user,
        placeholder="seu@gmail.com",
        help="Conta Gmail que vai enviar o relatório",
    )
    app_password = st.text_input(
        "App Password",
        value=env_app_pass,
        type="password",
        placeholder="xxxx xxxx xxxx xxxx",
        help="Senha de app gerada em myaccount.google.com → Segurança → Senhas de app",
    )

with col_b:
    email_to = st.text_input(
        "Destinatário",
        value=env_email_to or env_gmail_user,
        placeholder="destino@email.com",
        help="Para quem enviar o relatório (deixe igual ao remetente para autoenviio)",
    )
    subject_suffix = st.text_input(
        "Sufixo do assunto (opcional)",
        value="",
        placeholder="ex: — Teste Manual",
        help="Adicionado ao final do assunto padrão '📊 Relatório Diário – DD/MM/YYYY'",
    )

st.markdown("</div>", unsafe_allow_html=True)

# ── 3. AÇÕES ─────────────────────────────────────────────────────────────────
st.markdown("""
<div class="email-glass-card">
    <div class="email-section-title">◆ Ações</div>
""", unsafe_allow_html=True)

btn_col1, btn_col2, btn_col3 = st.columns([1, 1, 2])

with btn_col1:
    test_conn = st.button("🔌 Testar Conexão", use_container_width=True)
with btn_col2:
    preview_btn = st.button("👁 Pré-visualizar", use_container_width=True)
with btn_col3:
    send_btn = st.button("📤 Enviar Relatório Agora", type="primary", use_container_width=True)

st.markdown("</div>", unsafe_allow_html=True)

# ── Testar conexão ────────────────────────────────────────────────────────────
if test_conn:
    if not gmail_user or not app_password:
        st.error("Preencha o remetente e o App Password antes de testar.")
    else:
        with st.spinner("Testando conexão SMTP..."):
            ok, msg = _check_smtp(gmail_user, app_password)
        if ok:
            st.success(f"✅ {msg}")
        else:
            st.error(f"❌ {msg}")

# ── Build snapshot (cached) ───────────────────────────────────────────────────
@st.cache_data(ttl=300, show_spinner=False)
def _cached_snapshot():
    """Monta o snapshot do portfólio (cache 5 min)."""
    # Adiciona diretório raiz ao path para importar daily_report
    scripts_dir = str(Path(__file__).parent.parent / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    try:
        import importlib
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "daily_report",
            Path(__file__).parent.parent / "scripts" / "daily_report.py"
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        snap = mod.build_snapshot()
        html = mod.generate_html_report(snap)
        return snap, html, mod
    except Exception as e:
        return None, None, None, str(e)


# ── Pré-visualizar ────────────────────────────────────────────────────────────
if preview_btn or st.session_state.get("_email_preview_loaded"):
    st.session_state["_email_preview_loaded"] = True

    st.markdown("""
    <div class="email-glass-card">
        <div class="email-section-title">◉ Pré-visualização do Relatório</div>
    """, unsafe_allow_html=True)

    with st.spinner("Carregando dados do portfólio..."):
        result = _cached_snapshot()

    if len(result) == 4:  # erro
        st.error(f"Erro ao gerar snapshot: {result[3]}")
    else:
        snap, html_content, mod = result

        if snap is None or not snap.get("positions"):
            erros = snap.get("errors", []) if snap else []
            st.warning("Sem posições carregadas. Verifique a conexão com o Google Sheets.")
            for e in erros:
                st.caption(f"• {e}")
        else:
            # Métricas rápidas
            m1, m2, m3, m4 = st.columns(4)
            pct = snap.get("portfolio_pct", 0)
            pnl = snap.get("total_day_pnl", 0)
            pat = snap.get("total_mv", 0) + snap.get("rf_total", 0)

            with m1:
                st.metric("Ativos", snap.get("n_positions", 0))
            with m2:
                st.metric("Patrimônio", f"R$ {pat:,.0f}".replace(",", "."))
            with m3:
                sign = "+" if pct >= 0 else ""
                st.metric("Variação Hoje", f"{sign}{pct:.2f}%",
                          delta=f"R$ {'+' if pnl>=0 else ''}{pnl:,.2f}".replace(",", "."))
            with m4:
                st.metric("Renda Fixa", f"R$ {snap.get('rf_total',0):,.0f}".replace(",", "."))

            if html_content:
                st.markdown('<div class="preview-wrapper">', unsafe_allow_html=True)
                st.components.v1.html(html_content, height=700, scrolling=True)
                st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("</div>", unsafe_allow_html=True)

# ── Enviar ────────────────────────────────────────────────────────────────────
if send_btn:
    if not gmail_user or not app_password:
        st.error("Preencha o remetente e o App Password para enviar.")
    elif not email_to:
        st.error("Informe o destinatário.")
    else:
        st.markdown("""
        <div class="email-glass-card">
            <div class="email-section-title">◉ Log de Envio</div>
        """, unsafe_allow_html=True)

        log_lines = []
        log_placeholder = st.empty()

        def _log(msg: str):
            log_lines.append(msg)
            log_placeholder.markdown(
                '<div class="log-box">' + "<br>".join(log_lines) + "</div>",
                unsafe_allow_html=True,
            )

        with st.spinner("Gerando relatório e enviando..."):
            _log(f"[{datetime.now().strftime('%H:%M:%S')}] Iniciando geração do relatório...")

            result = _cached_snapshot()
            if len(result) == 4:
                _log(f"❌ Erro ao gerar snapshot: {result[3]}")
                st.error("Falha ao montar os dados do portfólio.")
            else:
                snap, html_content, mod = result

                if snap is None or not snap.get("positions"):
                    _log("❌ Sem posições carregadas. Abortando.")
                    st.error("Nenhuma posição encontrada. Verifique o Google Sheets.")
                elif html_content is None:
                    _log("❌ HTML do relatório não gerado.")
                    st.error("Erro ao gerar o HTML do relatório.")
                else:
                    _log(f"✅ Snapshot OK — {snap.get('n_positions', 0)} ativos, {len(snap.get('gainers', []))} altas, {len(snap.get('losers', []))} quedas")
                    _log(f"[{datetime.now().strftime('%H:%M:%S')}] Conectando ao Gmail SMTP...")

                    import email.mime.multipart
                    import email.mime.text

                    today_str = datetime.now().strftime("%d/%m/%Y")
                    subject = f"📊 Relatório Diário – {today_str}"
                    if subject_suffix.strip():
                        subject += f" {subject_suffix.strip()}"

                    msg = email.mime.multipart.MIMEMultipart("alternative")
                    msg["Subject"] = subject
                    msg["From"]    = gmail_user
                    msg["To"]      = email_to

                    msg.attach(email.mime.text.MIMEText(
                        "Veja seu relatório diário de investimentos no HTML.", "plain"
                    ))
                    msg.attach(email.mime.text.MIMEText(html_content, "html"))

                    try:
                        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
                            server.login(gmail_user, app_password)
                            _log(f"✅ Autenticado como {gmail_user}")
                            server.send_message(msg)
                        _log(f"✅ Email enviado com sucesso para {email_to}")
                        _log(f"   Assunto: {subject}")
                        st.success(f"✅ Relatório enviado para **{email_to}**!")
                    except smtplib.SMTPAuthenticationError:
                        _log("❌ Falha de autenticação — verifique App Password")
                        st.error("Credenciais inválidas. Verifique seu App Password do Gmail.")
                    except Exception as e:
                        _log(f"❌ Erro: {e}")
                        st.error(f"Erro ao enviar: {e}")

        st.markdown("</div>", unsafe_allow_html=True)

# ── 4. AJUDA ─────────────────────────────────────────────────────────────────
st.markdown("""
<div class="email-glass-card">
    <div class="email-section-title">◈ Como Configurar o App Password do Gmail</div>
""", unsafe_allow_html=True)

with st.expander("Passo a passo para gerar App Password"):
    st.markdown("""
**Por que App Password?**
O Gmail bloqueia login com senha comum em apps de terceiros.
O App Password é uma senha específica para este app.

**Como gerar:**
1. Acesse [myaccount.google.com](https://myaccount.google.com)
2. Vá em **Segurança** → **Verificação em duas etapas** (deve estar ativada)
3. Role até **Senhas de app** e clique
4. Em "Selecionar app" escolha **Outro (nome personalizado)** → escreva `BRTS`
5. Clique em **Gerar** — copie a senha de 16 caracteres
6. Use essa senha no campo **App Password** acima

**Para configurar via variáveis de ambiente:**
```bash
export GMAIL_USER="seu@gmail.com"
export GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
export EMAIL_TO="destino@email.com"
```

Ou adicione no `.streamlit/secrets.toml`:
```toml
GMAIL_USER = "seu@gmail.com"
GMAIL_APP_PASSWORD = "xxxx xxxx xxxx xxxx"
EMAIL_TO = "destino@email.com"
```
""")

st.markdown("</div>", unsafe_allow_html=True)

# Spacer
st.markdown("<div style='height: 60px'></div>", unsafe_allow_html=True)
