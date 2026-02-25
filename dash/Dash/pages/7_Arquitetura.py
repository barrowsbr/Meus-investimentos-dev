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
    .stApp {
        background: #0f172a;
    }
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
    :root {
        --bg: #0f172a;
        --card: rgba(30, 41, 59, 0.6);
        --border: rgba(255,255,255,0.07);
        --teal: #2dd4bf;
        --coral: #fb7185;
        --indigo: #818cf8;
        --amber: #fbbf24;
        --green: #4ade80;
        --text: #f8fafc;
        --muted: #94a3b8;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
        background: transparent;
        font-family: 'Outfit', sans-serif;
        color: var(--text);
        padding: 24px 20px 60px;
        overflow-x: hidden;
    }

    /* ─── HERO ─── */
    .hero {
        text-align: center;
        padding: 40px 0 50px;
        position: relative;
    }
    .hero-eyebrow {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.72rem;
        letter-spacing: 3px;
        color: var(--teal);
        text-transform: uppercase;
        margin-bottom: 16px;
    }
    .hero h1 {
        font-size: clamp(2rem, 6vw, 3.2rem);
        font-weight: 800;
        line-height: 1.15;
        background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 16px;
    }
    .hero-sub {
        font-size: 1rem;
        color: var(--muted);
        max-width: 480px;
        margin: 0 auto 28px;
        line-height: 1.6;
    }
    .hero-badges {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 10px;
    }
    .hero-badge {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.72rem;
        padding: 6px 14px;
        border-radius: 20px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.04);
        color: var(--muted);
    }
    .hero-badge span {
        color: var(--teal);
        font-weight: 600;
    }

    /* ─── SECTION LABEL ─── */
    .section-label {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.68rem;
        letter-spacing: 2.5px;
        color: var(--muted);
        text-transform: uppercase;
        margin-bottom: 14px;
        padding-left: 4px;
    }

    /* ─── PIPELINE ─── */
    .pipeline {
        display: flex;
        align-items: stretch;
        gap: 0;
        margin-bottom: 48px;
        overflow-x: auto;
        padding-bottom: 8px;
    }
    .pipe-node {
        flex: 1;
        min-width: 130px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 18px 14px;
        text-align: center;
        position: relative;
        backdrop-filter: blur(10px);
    }
    .pipe-node .pipe-icon { font-size: 1.8rem; margin-bottom: 8px; }
    .pipe-node .pipe-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--text);
        margin-bottom: 4px;
    }
    .pipe-node .pipe-desc {
        font-size: 0.72rem;
        color: var(--muted);
        line-height: 1.4;
    }
    .pipe-arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
        color: var(--muted);
        font-size: 1rem;
        flex-shrink: 0;
    }
    /* Color accents */
    .pipe-node.c-teal   { border-color: rgba(45,212,191,.3);  }
    .pipe-node.c-indigo { border-color: rgba(129,140,248,.3); }
    .pipe-node.c-coral  { border-color: rgba(251,113,133,.3); }
    .pipe-node.c-amber  { border-color: rgba(251,191,36,.3);  }
    .pipe-node.c-green  { border-color: rgba(74,222,128,.3);  }

    /* ─── API CARDS ─── */
    .apis-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        margin-bottom: 48px;
    }
    @media (max-width: 520px) {
        .apis-grid { grid-template-columns: 1fr; }
        .pipeline { flex-direction: column; gap: 0; }
        .pipe-arrow { transform: rotate(90deg); padding: 6px 0; }
    }

    .api-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 20px;
        backdrop-filter: blur(10px);
        transition: border-color 0.25s;
    }
    .api-card:hover { border-color: rgba(255,255,255,0.15); }

    .api-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
    }
    .api-logo {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        flex-shrink: 0;
    }
    .api-logo.yahoo  { background: linear-gradient(135deg, #7c3aed, #4f46e5); }
    .api-logo.gsheet { background: linear-gradient(135deg, #16a34a, #15803d); }
    .api-logo.stream { background: linear-gradient(135deg, #0ea5e9, #0284c7); }
    .api-logo.cloud  { background: linear-gradient(135deg, #f59e0b, #d97706); }

    .api-name {
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--text);
    }
    .api-role {
        font-size: 0.75rem;
        color: var(--muted);
        margin-top: 2px;
    }
    .api-desc {
        font-size: 0.82rem;
        color: #cbd5e1;
        line-height: 1.55;
        margin-bottom: 12px;
    }
    .api-items {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .api-items li {
        font-size: 0.78rem;
        color: var(--muted);
        padding-left: 14px;
        position: relative;
        font-family: 'JetBrains Mono', monospace;
    }
    .api-items li::before {
        content: '→';
        position: absolute;
        left: 0;
        color: var(--teal);
    }

    /* ─── CAPABILITIES ─── */
    .caps-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 48px;
    }
    @media (max-width: 520px) {
        .caps-grid { grid-template-columns: 1fr; }
    }
    .cap-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 18px;
        backdrop-filter: blur(10px);
    }
    .cap-card .cap-icon { font-size: 1.4rem; margin-bottom: 8px; }
    .cap-card .cap-title {
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--text);
        margin-bottom: 6px;
    }
    .cap-card .cap-desc {
        font-size: 0.78rem;
        color: var(--muted);
        line-height: 1.5;
    }
    .cap-tag {
        display: inline-block;
        margin-top: 8px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.65rem;
        padding: 3px 8px;
        border-radius: 4px;
        background: rgba(45,212,191,.12);
        color: var(--teal);
        border: 1px solid rgba(45,212,191,.25);
    }

    /* ─── TECH STACK ─── */
    .stack-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
    }
    .stack-badge {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.72rem;
        padding: 5px 12px;
        border-radius: 6px;
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--border);
        color: var(--muted);
        transition: all 0.2s;
    }
    .stack-badge:hover {
        background: rgba(255,255,255,0.09);
        color: var(--text);
    }
    .stack-badge.highlight {
        background: rgba(45,212,191,.1);
        border-color: rgba(45,212,191,.3);
        color: var(--teal);
    }

    /* ─── FOOTER STAT ─── */
    .stats-bar {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 28px;
        padding: 28px 0 0;
        border-top: 1px solid var(--border);
    }
    .stat-item { text-align: center; }
    .stat-value {
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--text);
        display: block;
        line-height: 1;
    }
    .stat-label {
        font-size: 0.72rem;
        color: var(--muted);
        margin-top: 4px;
        font-family: 'JetBrains Mono', monospace;
    }

    /* ─── DIVIDER ─── */
    .divider {
        border: none;
        border-top: 1px solid var(--border);
        margin: 40px 0 28px;
    }

    /* ─── MAX WIDTH ─── */
    .content { max-width: 700px; margin: 0 auto; }
</style>
</head>
<body>
<div class="content">

    <!-- ═══════════════════════════════════ HERO -->
    <section class="hero">
        <p class="hero-eyebrow">BARROOTS · Sistema de Gestão Patrimonial</p>
        <h1>Inteligência financeira<br>em tempo real</h1>
        <p class="hero-sub">
            Uma plataforma completa que conecta sua carteira ao mercado, calcula métricas profissionais e entrega visibilidade total sobre seu patrimônio — do aporte ao imposto.
        </p>
        <div class="hero-badges">
            <div class="hero-badge"><span>2</span> APIs externas</div>
            <div class="hero-badge"><span>4</span> moedas suportadas</div>
            <div class="hero-badge"><span>10+</span> métricas calculadas</div>
            <div class="hero-badge"><span>100%</span> tempo real</div>
        </div>
    </section>

    <!-- ═══════════════════════════════════ PIPELINE -->
    <p class="section-label">// pipeline de dados</p>
    <div class="pipeline">

        <div class="pipe-node c-amber">
            <div class="pipe-icon">📋</div>
            <div class="pipe-title">Google Sheets</div>
            <div class="pipe-desc">Transações, aportes e histórico</div>
        </div>
        <div class="pipe-arrow">→</div>

        <div class="pipe-node c-indigo">
            <div class="pipe-icon">📡</div>
            <div class="pipe-title">Yahoo Finance</div>
            <div class="pipe-desc">Cotações e câmbio em tempo real</div>
        </div>
        <div class="pipe-arrow">→</div>

        <div class="pipe-node c-coral">
            <div class="pipe-icon">⚡</div>
            <div class="pipe-title">Core Engine</div>
            <div class="pipe-desc">Cálculos, TWR, MTM, IRPF</div>
        </div>
        <div class="pipe-arrow">→</div>

        <div class="pipe-node c-teal">
            <div class="pipe-icon">📊</div>
            <div class="pipe-title">Dashboard</div>
            <div class="pipe-desc">Gráficos e análises interativas</div>
        </div>

    </div>

    <!-- ═══════════════════════════════════ APIs -->
    <hr class="divider">
    <p class="section-label">// apis consumidas</p>
    <div class="apis-grid">

        <!-- Yahoo Finance -->
        <div class="api-card">
            <div class="api-header">
                <div class="api-logo yahoo">📈</div>
                <div>
                    <div class="api-name">Yahoo Finance</div>
                    <div class="api-role">Fonte de preços e câmbio</div>
                </div>
            </div>
            <p class="api-desc">
                Consultada a cada sessão para buscar cotações ao vivo de ativos brasileiros, americanos e internacionais, além das taxas de câmbio.
            </p>
            <ul class="api-items">
                <li>Ações BR (B3) em tempo real</li>
                <li>Ações EUA, ETFs, REITs</li>
                <li>USD/BRL · EUR/BRL · CAD/BRL</li>
                <li>Histórico de preços para TWR</li>
            </ul>
        </div>

        <!-- Google Sheets -->
        <div class="api-card">
            <div class="api-header">
                <div class="api-logo gsheet">📗</div>
                <div>
                    <div class="api-name">Google Sheets API</div>
                    <div class="api-role">Banco de dados da carteira</div>
                </div>
            </div>
            <p class="api-desc">
                Acesso autenticado via Service Account para leitura dos dados de carteira. Funciona como a fonte de verdade de todos os lançamentos.
            </p>
            <ul class="api-items">
                <li>Histórico completo de transações</li>
                <li>Lançamentos de proventos</li>
                <li>Composição da renda fixa</li>
                <li>Câmbio histórico (PTAX/manual)</li>
            </ul>
        </div>

        <!-- Streamlit Cloud -->
        <div class="api-card">
            <div class="api-header">
                <div class="api-logo stream">🚀</div>
                <div>
                    <div class="api-name">Streamlit Cloud</div>
                    <div class="api-role">Hosting e deploy contínuo</div>
                </div>
            </div>
            <p class="api-desc">
                Infraestrutura gerenciada que garante disponibilidade, HTTPS e deploy automático a cada commit. Zero manutenção de servidor.
            </p>
            <ul class="api-items">
                <li>HTTPS + domínio dedicado</li>
                <li>Deploy via GitHub (CI)</li>
                <li>Session state management</li>
                <li>Autenticação por senha</li>
            </ul>
        </div>

        <!-- Python Runtime -->
        <div class="api-card">
            <div class="api-header">
                <div class="api-logo cloud">🐍</div>
                <div>
                    <div class="api-name">Python Runtime</div>
                    <div class="api-role">Motor de cálculo</div>
                </div>
            </div>
            <p class="api-desc">
                Kernel de alta performance executando toda a lógica financeira: do cálculo de preço médio à apuração de imposto por mês de competência.
            </p>
            <ul class="api-items">
                <li>Python 3.13 + Pandas + NumPy</li>
                <li>Plotly para visualizações</li>
                <li>yfinance (wrapper Yahoo)</li>
                <li>gspread (Google Sheets SDK)</li>
            </ul>
        </div>

    </div>

    <!-- ═══════════════════════════════════ CAPABILITIES -->
    <hr class="divider">
    <p class="section-label">// o que o sistema calcula</p>
    <div class="caps-grid">

        <div class="cap-card">
            <div class="cap-icon">💰</div>
            <div class="cap-title">Lucro Realizado e Não Realizado</div>
            <div class="cap-desc">Separa com precisão o que já foi embolsado (vendas realizadas) do que ainda está em aberto nas posições ativas, ativo a ativo.</div>
            <span class="cap-tag">MTM · preço médio ponderado</span>
        </div>

        <div class="cap-card">
            <div class="cap-icon">📈</div>
            <div class="cap-title">Rentabilidade Total (TWR)</div>
            <div class="cap-desc">Calcula a rentabilidade real eliminando o efeito de aportes e retiradas ao longo do tempo — a mesma métrica usada por fundos de investimento.</div>
            <span class="cap-tag">Time-Weighted Return</span>
        </div>

        <div class="cap-card">
            <div class="cap-icon">💱</div>
            <div class="cap-title">Multi-Moeda em Tempo Real</div>
            <div class="cap-desc">Converte automaticamente posições em USD, EUR e CAD para BRL usando a cotação live do Yahoo Finance, com suporte a PTAX histórico.</div>
            <span class="cap-tag">USD · EUR · CAD · BRL</span>
        </div>

        <div class="cap-card">
            <div class="cap-icon">🦁</div>
            <div class="cap-title">Apuração de IRPF</div>
            <div class="cap-desc">Calcula o imposto mensal sobre vendas de renda variável, aplica compensação de prejuízos e identifica isenções (vendas abaixo de R$ 20k/mês).</div>
            <span class="cap-tag">DARFs · compensação de perdas</span>
        </div>

        <div class="cap-card">
            <div class="cap-icon">💎</div>
            <div class="cap-title">Proventos e Dividendos</div>
            <div class="cap-desc">Registra e consolida todos os proventos recebidos — dividendos, JCP, rendimentos de FIIs — por ativo, mês e total acumulado.</div>
            <span class="cap-tag">Yield · histórico completo</span>
        </div>

        <div class="cap-card">
            <div class="cap-icon">🌍</div>
            <div class="cap-title">Visão Global do Patrimônio</div>
            <div class="cap-desc">Consolida renda variável, renda fixa, cripto e caixa em uma única visão, com composição por classe, setor, moeda e custódia.</div>
            <span class="cap-tag">Portfólio 360°</span>
        </div>

    </div>

    <!-- ═══════════════════════════════════ TECH STACK -->
    <hr class="divider">
    <p class="section-label">// stack completo</p>
    <div style="margin-bottom: 48px;">
        <div class="stack-row">
            <span class="stack-badge highlight">Python 3.13</span>
            <span class="stack-badge highlight">Pandas</span>
            <span class="stack-badge highlight">NumPy</span>
            <span class="stack-badge highlight">yfinance</span>
            <span class="stack-badge highlight">gspread</span>
        </div>
        <div class="stack-row">
            <span class="stack-badge">Streamlit</span>
            <span class="stack-badge">Plotly</span>
            <span class="stack-badge">HTML5 / CSS3</span>
            <span class="stack-badge">Google Sheets API v4</span>
            <span class="stack-badge">Yahoo Finance API</span>
        </div>
        <div class="stack-row">
            <span class="stack-badge">Streamlit Cloud</span>
            <span class="stack-badge">GitHub CI/CD</span>
            <span class="stack-badge">HTTPS / TLS</span>
            <span class="stack-badge">Service Account Auth</span>
        </div>
    </div>

    <!-- ═══════════════════════════════════ STATS -->
    <div class="stats-bar">
        <div class="stat-item">
            <span class="stat-value">4</span>
            <div class="stat-label">camadas de sistema</div>
        </div>
        <div class="stat-item">
            <span class="stat-value">2</span>
            <div class="stat-label">APIs externas</div>
        </div>
        <div class="stat-item">
            <span class="stat-value">9</span>
            <div class="stat-label">módulos de análise</div>
        </div>
        <div class="stat-item">
            <span class="stat-value">4</span>
            <div class="stat-label">moedas suportadas</div>
        </div>
        <div class="stat-item">
            <span class="stat-value">100%</span>
            <div class="stat-label">open source stack</div>
        </div>
    </div>

</div>
</body>
</html>
"""

col1, col2 = st.columns([1, 10])
with col1:
    if st.button("◀ VOLTAR", use_container_width=True):
        st.switch_page("Home.py")

components.html(arch_html, height=2200, scrolling=True)
