import streamlit as st
import streamlit.components.v1 as components
from core.auth import require_auth

# --- AUTH ---
require_auth()

# --- CONFIG ---
st.set_page_config(
    page_title="Arquitetura do Sistema",
    page_icon="🧬",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS ---
st.markdown("""
<style>
    #MainMenu, footer, header {visibility: hidden;}
    section[data-testid="stSidebar"] {display: none;}
    .stApp { background: #0f172a; }
</style>
""", unsafe_allow_html=True)

# --- ARCHITECTURE PAGE ---
arch_html = """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
/* ═══════════════════════════════════════════ TOKENS */
:root {
    --card: rgba(30, 41, 59, 0.65);
    --border: rgba(255,255,255,0.07);
    --teal: #2dd4bf;
    --coral: #fb7185;
    --indigo: #818cf8;
    --amber: #fbbf24;
    --text: #f8fafc;
    --muted: #94a3b8;
}

/* ═══════════════════════════════════════════ BASE — MOBILE FIRST */
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
    background: transparent;
    font-family: 'Outfit', sans-serif;
    color: var(--text);
    padding: 16px 16px 64px;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
}

.content { max-width: 720px; margin: 0 auto; }

/* ═══════════════════════════════════════════ HERO */
.hero {
    text-align: center;
    padding: 24px 0 28px;
}
.hero-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 2.5px;
    color: var(--teal);
    text-transform: uppercase;
    margin-bottom: 12px;
    opacity: 0.85;
}
.hero h1 {
    font-size: 1.9rem;
    font-weight: 800;
    line-height: 1.18;
    background: linear-gradient(135deg, #ffffff 0%, #94a3b8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 12px;
}
.hero-sub {
    font-size: 0.88rem;
    color: var(--muted);
    line-height: 1.65;
    margin-bottom: 22px;
}

/* Hero stats: 2×2 grid on mobile */
.hero-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    max-width: 300px;
    margin: 0 auto;
}
.hero-stat {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 8px;
    text-align: center;
}
.hero-stat-val {
    font-family: 'Outfit', sans-serif;
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--teal);
    display: block;
    line-height: 1;
}
.hero-stat-lbl {
    font-size: 0.68rem;
    color: var(--muted);
    margin-top: 4px;
    line-height: 1.3;
}

/* ═══════════════════════════════════════════ SECTION LABEL */
.section-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 2.5px;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: 12px;
    padding-left: 2px;
    opacity: 0.7;
}

/* ═══════════════════════════════════════════ DIVIDER */
.divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 28px 0 22px;
}

/* ═══════════════════════════════════════════ PIPELINE — vertical on mobile */
.pipeline {
    display: flex;
    flex-direction: column;
    margin-bottom: 32px;
}
.pipe-node {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}
.pipe-node.c-amber  { border-left: 3px solid rgba(251,191,36,.55);  }
.pipe-node.c-indigo { border-left: 3px solid rgba(129,140,248,.55); }
.pipe-node.c-coral  { border-left: 3px solid rgba(251,113,133,.55); }
.pipe-node.c-teal   { border-left: 3px solid rgba(45,212,191,.55);  }

.pipe-icon { font-size: 1.5rem; flex-shrink: 0; }
.pipe-title { font-size: 0.9rem; font-weight: 700; color: var(--text); margin-bottom: 2px; }
.pipe-desc  { font-size: 0.74rem; color: var(--muted); line-height: 1.4; }

.pipe-arrow {
    display: flex;
    align-items: center;
    padding: 3px 0 3px 30px;
    color: var(--teal);
    opacity: 0.5;
    font-size: 1rem;
    line-height: 1;
}
.pipe-arrow::after { content: '↓'; }

/* ═══════════════════════════════════════════ API CARDS — 1 col mobile */
.apis-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 32px;
}
.api-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}
.api-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
}
.api-logo {
    width: 42px; height: 42px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.3rem;
    flex-shrink: 0;
}
.api-logo.yahoo  { background: linear-gradient(135deg, #7c3aed, #4f46e5); }
.api-logo.gsheet { background: linear-gradient(135deg, #16a34a, #15803d); }
.api-logo.stream { background: linear-gradient(135deg, #0ea5e9, #0284c7); }
.api-logo.py     { background: linear-gradient(135deg, #f59e0b, #d97706); }

.api-name { font-size: 0.95rem; font-weight: 700; color: var(--text); }
.api-role { font-size: 0.73rem; color: var(--muted); margin-top: 2px; }
.api-desc {
    font-size: 0.82rem;
    color: #cbd5e1;
    line-height: 1.55;
    margin-bottom: 10px;
}
.api-items { list-style: none; display: flex; flex-direction: column; gap: 5px; }
.api-items li {
    font-size: 0.75rem;
    color: var(--muted);
    padding-left: 14px;
    position: relative;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1.45;
}
.api-items li::before { content: '→'; position: absolute; left: 0; color: var(--teal); }

/* ═══════════════════════════════════════════ CAPABILITIES — 1 col mobile */
.caps-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin-bottom: 32px;
}
.cap-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 16px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: flex-start;
    gap: 14px;
}
.cap-icon { font-size: 1.5rem; flex-shrink: 0; margin-top: 1px; }
.cap-title { font-size: 0.88rem; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.cap-desc  { font-size: 0.78rem; color: var(--muted); line-height: 1.5; }
.cap-tag {
    display: inline-block;
    margin-top: 7px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(45,212,191,.1);
    color: var(--teal);
    border: 1px solid rgba(45,212,191,.22);
}

/* ═══════════════════════════════════════════ TECH STACK */
.stack-section { margin-bottom: 32px; }
.stack-group   { margin-bottom: 12px; }
.stack-group-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 6px;
    opacity: 0.65;
}
.stack-row { display: flex; flex-wrap: wrap; gap: 7px; }
.stack-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    padding: 6px 12px;
    border-radius: 6px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--border);
    color: var(--muted);
}
.stack-badge.hi {
    background: rgba(45,212,191,.1);
    border-color: rgba(45,212,191,.28);
    color: var(--teal);
}

/* ═══════════════════════════════════════════ FOOTER STATS — 3-col on mobile */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
}
.stat-box {
    text-align: center;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 6px;
}
.stat-val {
    font-size: 1.45rem;
    font-weight: 800;
    color: var(--text);
    display: block;
    line-height: 1;
}
.stat-lbl {
    font-size: 0.58rem;
    color: var(--muted);
    margin-top: 5px;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1.35;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* ═══════════════════════════════════════════ DESKTOP OVERRIDES */
@media (min-width: 580px) {
    body { padding: 20px 24px 64px; }

    .hero { padding: 32px 0 40px; }
    .hero h1 { font-size: 2.6rem; }
    .hero-sub { font-size: 0.95rem; }
    .hero-stats {
        grid-template-columns: repeat(4, auto);
        max-width: none;
        justify-content: center;
    }
    .hero-stat-val { font-size: 1.6rem; }

    /* Pipeline → horizontal */
    .pipeline { flex-direction: row; align-items: stretch; overflow-x: auto; }
    .pipe-node {
        flex: 1; min-width: 110px;
        flex-direction: column; text-align: center;
        padding: 18px 12px; gap: 8px;
        border-left: none;
    }
    .pipe-node.c-amber  { border-bottom: 3px solid rgba(251,191,36,.5);  border-left: none; }
    .pipe-node.c-indigo { border-bottom: 3px solid rgba(129,140,248,.5); border-left: none; }
    .pipe-node.c-coral  { border-bottom: 3px solid rgba(251,113,133,.5); border-left: none; }
    .pipe-node.c-teal   { border-bottom: 3px solid rgba(45,212,191,.5);  border-left: none; }
    .pipe-arrow {
        flex-shrink: 0; padding: 0 4px;
        align-self: center; justify-content: center;
    }
    .pipe-arrow::after { content: '→'; }

    /* 2-col grids */
    .apis-grid { grid-template-columns: 1fr 1fr; }
    .caps-grid { grid-template-columns: 1fr 1fr; }

    /* Stats → 1 row */
    .stats-grid { grid-template-columns: repeat(5, 1fr); }
}
</style>
</head>
<body>
<div class="content">

<!-- ══════════════════════════════════ HERO -->
<section class="hero">
    <p class="hero-eyebrow">BARROOTS · Sistema de Gestão Patrimonial</p>
    <h1>Inteligência financeira<br>em tempo real</h1>
    <p class="hero-sub">Uma plataforma completa que conecta sua carteira ao mercado, calcula métricas de nível institucional e entrega visibilidade total sobre seu patrimônio — do aporte ao imposto.</p>
    <div class="hero-stats">
        <div class="hero-stat">
            <span class="hero-stat-val">2</span>
            <div class="hero-stat-lbl">APIs externas</div>
        </div>
        <div class="hero-stat">
            <span class="hero-stat-val">4</span>
            <div class="hero-stat-lbl">Moedas suportadas</div>
        </div>
        <div class="hero-stat">
            <span class="hero-stat-val">10+</span>
            <div class="hero-stat-lbl">Métricas calculadas</div>
        </div>
        <div class="hero-stat">
            <span class="hero-stat-val">9</span>
            <div class="hero-stat-lbl">Módulos de análise</div>
        </div>
    </div>
</section>

<!-- ══════════════════════════════════ PIPELINE -->
<p class="section-label">// pipeline de dados</p>
<div class="pipeline">
    <div class="pipe-node c-amber">
        <div class="pipe-icon">📋</div>
        <div>
            <div class="pipe-title">Google Sheets</div>
            <div class="pipe-desc">Transações e aportes</div>
        </div>
    </div>
    <div class="pipe-arrow"></div>

    <div class="pipe-node c-indigo">
        <div class="pipe-icon">📡</div>
        <div>
            <div class="pipe-title">Yahoo Finance</div>
            <div class="pipe-desc">Cotações em tempo real</div>
        </div>
    </div>
    <div class="pipe-arrow"></div>

    <div class="pipe-node c-coral">
        <div class="pipe-icon">⚡</div>
        <div>
            <div class="pipe-title">Core Engine</div>
            <div class="pipe-desc">TWR, MTM, IRPF</div>
        </div>
    </div>
    <div class="pipe-arrow"></div>

    <div class="pipe-node c-teal">
        <div class="pipe-icon">📊</div>
        <div>
            <div class="pipe-title">Dashboard</div>
            <div class="pipe-desc">Análises interativas</div>
        </div>
    </div>
</div>

<!-- ══════════════════════════════════ APIS -->
<hr class="divider">
<p class="section-label">// apis consumidas</p>
<div class="apis-grid">

    <div class="api-card">
        <div class="api-header">
            <div class="api-logo yahoo">📈</div>
            <div>
                <div class="api-name">Yahoo Finance</div>
                <div class="api-role">Fonte de preços e câmbio</div>
            </div>
        </div>
        <p class="api-desc">Consultada a cada sessão para buscar cotações ao vivo de ativos brasileiros, americanos e internacionais, além das taxas de câmbio live.</p>
        <ul class="api-items">
            <li>Ações BR (B3) em tempo real</li>
            <li>Ações EUA, ETFs, REITs</li>
            <li>USD/BRL · EUR/BRL · CAD/BRL</li>
            <li>Histórico de preços para TWR</li>
        </ul>
    </div>

    <div class="api-card">
        <div class="api-header">
            <div class="api-logo gsheet">📗</div>
            <div>
                <div class="api-name">Google Sheets API</div>
                <div class="api-role">Banco de dados da carteira</div>
            </div>
        </div>
        <p class="api-desc">Acesso autenticado via Service Account. Funciona como fonte de verdade de todos os lançamentos — sem banco de dados extra, sem infra adicional.</p>
        <ul class="api-items">
            <li>Histórico completo de transações</li>
            <li>Lançamentos de proventos</li>
            <li>Composição da renda fixa</li>
            <li>Câmbio histórico (PTAX)</li>
        </ul>
    </div>

    <div class="api-card">
        <div class="api-header">
            <div class="api-logo stream">🚀</div>
            <div>
                <div class="api-name">Streamlit Cloud</div>
                <div class="api-role">Hosting e deploy contínuo</div>
            </div>
        </div>
        <p class="api-desc">Infraestrutura gerenciada com HTTPS, disponibilidade 24/7 e deploy automático a cada commit no GitHub. Zero manutenção de servidor.</p>
        <ul class="api-items">
            <li>HTTPS + domínio dedicado</li>
            <li>Deploy automático via GitHub</li>
            <li>Session state management</li>
            <li>Autenticação por senha</li>
        </ul>
    </div>

    <div class="api-card">
        <div class="api-header">
            <div class="api-logo py">🐍</div>
            <div>
                <div class="api-name">Python Runtime</div>
                <div class="api-role">Motor de cálculo financeiro</div>
            </div>
        </div>
        <p class="api-desc">Kernel de alta performance executando toda a lógica financeira: do preço médio ponderado à apuração de imposto por mês de competência.</p>
        <ul class="api-items">
            <li>Python 3.13 + Pandas + NumPy</li>
            <li>Plotly para visualizações</li>
            <li>yfinance (SDK Yahoo Finance)</li>
            <li>gspread (SDK Google Sheets)</li>
        </ul>
    </div>

</div>

<!-- ══════════════════════════════════ CAPABILITIES -->
<hr class="divider">
<p class="section-label">// o que o sistema calcula</p>
<div class="caps-grid">

    <div class="cap-card">
        <div class="cap-icon">💰</div>
        <div>
            <div class="cap-title">Lucro Realizado e Não Realizado</div>
            <div class="cap-desc">Separa o que já foi embolsado (vendas) do que ainda está em aberto nas posições ativas, ativo a ativo.</div>
            <span class="cap-tag">MTM · preço médio ponderado</span>
        </div>
    </div>

    <div class="cap-card">
        <div class="cap-icon">📈</div>
        <div>
            <div class="cap-title">Rentabilidade Total (TWR)</div>
            <div class="cap-desc">Elimina o efeito de aportes e retiradas no cálculo de retorno — a mesma métrica usada por fundos de investimento.</div>
            <span class="cap-tag">Time-Weighted Return</span>
        </div>
    </div>

    <div class="cap-card">
        <div class="cap-icon">💱</div>
        <div>
            <div class="cap-title">Multi-Moeda em Tempo Real</div>
            <div class="cap-desc">Converte automaticamente posições em USD, EUR e CAD para BRL com a cotação live. Suporte a PTAX histórico.</div>
            <span class="cap-tag">USD · EUR · CAD · BRL</span>
        </div>
    </div>

    <div class="cap-card">
        <div class="cap-icon">🦁</div>
        <div>
            <div class="cap-title">Apuração de IRPF</div>
            <div class="cap-desc">Calcula imposto sobre vendas RV, aplica compensação de prejuízos e identifica isenções abaixo de R$ 20k/mês.</div>
            <span class="cap-tag">DARFs · compensação de perdas</span>
        </div>
    </div>

    <div class="cap-card">
        <div class="cap-icon">💎</div>
        <div>
            <div class="cap-title">Proventos e Dividendos</div>
            <div class="cap-desc">Consolida dividendos, JCP e rendimentos de FIIs por ativo, por mês e acumulado total.</div>
            <span class="cap-tag">Yield · histórico completo</span>
        </div>
    </div>

    <div class="cap-card">
        <div class="cap-icon">🌍</div>
        <div>
            <div class="cap-title">Visão Global do Patrimônio</div>
            <div class="cap-desc">Consolida renda variável, renda fixa, cripto e caixa com composição por classe, setor, moeda e custódia.</div>
            <span class="cap-tag">Portfólio 360°</span>
        </div>
    </div>

</div>

<!-- ══════════════════════════════════ TECH STACK -->
<hr class="divider">
<p class="section-label">// stack tecnológico</p>
<div class="stack-section">
    <div class="stack-group">
        <div class="stack-group-label">Core</div>
        <div class="stack-row">
            <span class="stack-badge hi">Python 3.13</span>
            <span class="stack-badge hi">Pandas</span>
            <span class="stack-badge hi">NumPy</span>
            <span class="stack-badge hi">yfinance</span>
            <span class="stack-badge hi">gspread</span>
        </div>
    </div>
    <div class="stack-group">
        <div class="stack-group-label">Interface</div>
        <div class="stack-row">
            <span class="stack-badge">Streamlit</span>
            <span class="stack-badge">Plotly</span>
            <span class="stack-badge">HTML5 / CSS3</span>
        </div>
    </div>
    <div class="stack-group">
        <div class="stack-group-label">Infra & Auth</div>
        <div class="stack-row">
            <span class="stack-badge">Streamlit Cloud</span>
            <span class="stack-badge">GitHub CI/CD</span>
            <span class="stack-badge">HTTPS / TLS</span>
            <span class="stack-badge">Service Account</span>
        </div>
    </div>
</div>

<!-- ══════════════════════════════════ STATS FOOTER -->
<div class="stats-grid">
    <div class="stat-box">
        <span class="stat-val">4</span>
        <div class="stat-lbl">camadas de sistema</div>
    </div>
    <div class="stat-box">
        <span class="stat-val">2</span>
        <div class="stat-lbl">APIs externas</div>
    </div>
    <div class="stat-box">
        <span class="stat-val">9</span>
        <div class="stat-lbl">módulos de análise</div>
    </div>
    <div class="stat-box">
        <span class="stat-val">4</span>
        <div class="stat-lbl">moedas suportadas</div>
    </div>
    <div class="stat-box">
        <span class="stat-val">100%</span>
        <div class="stat-lbl">open source stack</div>
    </div>
</div>

</div><!-- /content -->
</body>
</html>
"""

col1, col2 = st.columns([1, 10])
with col1:
    if st.button("◀ VOLTAR", use_container_width=True):
        st.switch_page("Home.py")

components.html(arch_html, height=3200, scrolling=True)
