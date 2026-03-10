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
    --card:   rgba(30, 41, 59, 0.65);
    --card2:  rgba(15, 23, 42, 0.8);
    --border: rgba(255,255,255,0.07);
    --teal:   #2dd4bf;
    --coral:  #fb7185;
    --indigo: #818cf8;
    --amber:  #fbbf24;
    --purple: #c084fc;
    --cyan:   #22d3ee;
    --text:   #f8fafc;
    --muted:  #94a3b8;
    --dim:    #475569;
}

/* ═══════════════════════════════════════════ BASE */
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
    background: transparent;
    font-family: 'Outfit', sans-serif;
    color: var(--text);
    padding: 12px 14px 72px;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
}

.content { max-width: 720px; margin: 0 auto; }

/* ═══════════════════════════════════════════ HERO */
.hero {
    text-align: center;
    padding: 20px 0 24px;
}
.hero-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 2.5px;
    color: var(--teal);
    text-transform: uppercase;
    margin-bottom: 10px;
    opacity: 0.85;
}
.hero h1 {
    font-size: 1.75rem;
    font-weight: 800;
    line-height: 1.18;
    background: linear-gradient(135deg, #ffffff 0%, #94a3b8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 10px;
}
.hero-sub {
    font-size: 0.84rem;
    color: var(--muted);
    line-height: 1.6;
    margin-bottom: 20px;
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
}
.hero-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    max-width: 360px;
    margin: 0 auto;
}
.hero-stat {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 6px;
    text-align: center;
}
.hero-stat-val {
    font-size: 1.35rem;
    font-weight: 800;
    color: var(--teal);
    display: block;
    line-height: 1;
}
.hero-stat-lbl {
    font-size: 0.62rem;
    color: var(--muted);
    margin-top: 4px;
    line-height: 1.3;
}

/* ═══════════════════════════════════════════ SUMMARY CARD */
.summary-card {
    background: linear-gradient(135deg, rgba(45,212,191,0.06) 0%, rgba(129,140,248,0.06) 50%, rgba(192,132,252,0.06) 100%);
    border: 1px solid rgba(45,212,191,0.2);
    border-radius: 20px;
    padding: 20px 18px;
    margin-bottom: 28px;
    position: relative;
    overflow: hidden;
}
.summary-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, var(--teal), var(--indigo), var(--purple));
    border-radius: 20px 20px 0 0;
}
.summary-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
}
.summary-icon {
    font-size: 1.3rem;
}
.summary-title {
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--text);
    letter-spacing: 0.3px;
}
.summary-title-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    color: var(--teal);
    text-transform: uppercase;
    letter-spacing: 2px;
    display: block;
    opacity: 0.8;
}
.summary-lead {
    font-size: 0.88rem;
    color: #cbd5e1;
    line-height: 1.65;
    margin-bottom: 18px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
}
.summary-lead strong { color: var(--text); }
.sp-list { display: flex; flex-direction: column; gap: 12px; }
.sp {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}
.sp-dot-wrap {
    flex-shrink: 0;
    padding-top: 4px;
}
.sp-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    display: block;
}
.sp-text {
    font-size: 0.83rem;
    color: #94a3b8;
    line-height: 1.55;
}
.sp-text strong { color: var(--text); font-weight: 700; }

/* ═══════════════════════════════════════════ BADGES */
.new-badge {
    display: inline-block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.52rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(192,132,252,0.15);
    color: var(--purple);
    border: 1px solid rgba(192,132,252,0.3);
    letter-spacing: 1px;
    vertical-align: middle;
    margin-left: 5px;
    text-transform: uppercase;
}

/* ═══════════════════════════════════════════ SECTION LABEL */
.section-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 2.5px;
    color: var(--dim);
    text-transform: uppercase;
    margin-bottom: 12px;
    padding-left: 2px;
}

/* ═══════════════════════════════════════════ DIVIDER */
.divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 24px 0 20px;
}

/* ═══════════════════════════════════════════ PIPELINE — mobile vertical */
.pipeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-bottom: 28px;
}
.pipe-node {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 13px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    position: relative;
}
.pipe-step {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    position: absolute;
    top: -9px; left: 12px;
    background: #0f172a;
    padding: 0 6px;
    color: var(--dim);
    letter-spacing: 1px;
    text-transform: uppercase;
}
.pipe-node.c-amber  { border-left: 3px solid rgba(251,191,36,.6);  }
.pipe-node.c-indigo { border-left: 3px solid rgba(129,140,248,.6); }
.pipe-node.c-coral  { border-left: 3px solid rgba(251,113,133,.6); }
.pipe-node.c-teal   { border-left: 3px solid rgba(45,212,191,.6);  }
.pipe-node.c-purple { border-left: 3px solid rgba(192,132,252,.6); }
.pipe-node.c-cyan   { border-left: 3px solid rgba(34,211,238,.6);  }

.pipe-icon  { font-size: 1.4rem; flex-shrink: 0; }
.pipe-title { font-size: 0.87rem; font-weight: 700; color: var(--text); margin-bottom: 2px; }
.pipe-desc  { font-size: 0.72rem; color: var(--muted); line-height: 1.4; }

.pipe-connector {
    display: flex;
    align-items: center;
    padding: 2px 0 2px 26px;
    color: var(--teal);
    opacity: 0.4;
    font-size: 0.9rem;
    line-height: 1;
}
.pipe-connector::after { content: '↓'; }

/* ═══════════════════════════════════════════ LAYER CARD */
.layer-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 16px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    margin-bottom: 10px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
}
.layer-card.l-ai   { border-left: 3px solid rgba(192,132,252,.6); background: rgba(192,132,252,0.04); }
.layer-card.l-news { border-left: 3px solid rgba(34,211,238,.6);  background: rgba(34,211,238,0.03); }
.layer-icon  { font-size: 1.7rem; flex-shrink: 0; margin-top: 1px; }
.layer-title { font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 5px; }
.layer-desc  { font-size: 0.78rem; color: var(--muted); line-height: 1.55; margin-bottom: 10px; }
.layer-pills { display: flex; flex-wrap: wrap; gap: 5px; }
.layer-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    padding: 3px 8px;
    border-radius: 5px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--border);
    color: var(--muted);
}
.layer-pill.hi-purple { background: rgba(192,132,252,0.1); border-color: rgba(192,132,252,0.3); color: var(--purple); }
.layer-pill.hi-cyan   { background: rgba(34,211,238,0.1);  border-color: rgba(34,211,238,0.3);  color: var(--cyan); }

/* ═══════════════════════════════════════════ API CARDS */
.apis-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin-bottom: 28px;
}
.api-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
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
    width: 40px; height: 40px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.2rem;
    flex-shrink: 0;
}
.api-logo.yahoo  { background: linear-gradient(135deg, #7c3aed, #4f46e5); }
.api-logo.gsheet { background: linear-gradient(135deg, #16a34a, #15803d); }
.api-logo.stream { background: linear-gradient(135deg, #0ea5e9, #0284c7); }
.api-logo.py     { background: linear-gradient(135deg, #f59e0b, #d97706); }
.api-logo.gemini { background: linear-gradient(135deg, #7c3aed, #c026d3); }
.api-logo.news   { background: linear-gradient(135deg, #0891b2, #0e7490); }

.api-name { font-size: 0.92rem; font-weight: 700; color: var(--text); }
.api-role { font-size: 0.7rem; color: var(--muted); margin-top: 1px; }
.api-desc { font-size: 0.78rem; color: #cbd5e1; line-height: 1.55; margin-bottom: 10px; }
.api-items { list-style: none; display: flex; flex-direction: column; gap: 4px; }
.api-items li {
    font-size: 0.72rem;
    color: var(--muted);
    padding-left: 14px;
    position: relative;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1.45;
}
.api-items li::before { content: '→'; position: absolute; left: 0; color: var(--teal); }

/* ═══════════════════════════════════════════ CAPABILITIES */
.caps-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    margin-bottom: 28px;
}
.cap-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 13px 14px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 44px;
}
.cap-icon  { font-size: 1.3rem; flex-shrink: 0; margin-top: 1px; }
.cap-title { font-size: 0.85rem; font-weight: 700; color: var(--text); margin-bottom: 3px; }
.cap-desc  { font-size: 0.75rem; color: var(--muted); line-height: 1.5; }
.cap-tag {
    display: inline-block;
    margin-top: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(45,212,191,.1);
    color: var(--teal);
    border: 1px solid rgba(45,212,191,.22);
}
.cap-tag.t-purple { background: rgba(192,132,252,.1); color: var(--purple); border-color: rgba(192,132,252,.25); }
.cap-tag.t-cyan   { background: rgba(34,211,238,.1);  color: var(--cyan);   border-color: rgba(34,211,238,.25); }

/* ═══════════════════════════════════════════ TECH STACK */
.stack-section { margin-bottom: 28px; }
.stack-group   { margin-bottom: 12px; }
.stack-group-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.56rem;
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 6px;
}
.stack-row { display: flex; flex-wrap: wrap; gap: 6px; }
.stack-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    padding: 5px 11px;
    border-radius: 6px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--border);
    color: var(--muted);
    min-height: 30px;
    display: inline-flex; align-items: center;
}
.stack-badge.hi        { background: rgba(45,212,191,.1);  border-color: rgba(45,212,191,.28);  color: var(--teal); }
.stack-badge.hi-purple { background: rgba(192,132,252,.1); border-color: rgba(192,132,252,.28); color: var(--purple); }
.stack-badge.hi-cyan   { background: rgba(34,211,238,.1);  border-color: rgba(34,211,238,.28);  color: var(--cyan); }

/* ═══════════════════════════════════════════ FOOTER STATS */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
}
.stat-box {
    text-align: center;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 6px;
}
.stat-val {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--text);
    display: block;
    line-height: 1;
}
.stat-lbl {
    font-size: 0.56rem;
    color: var(--muted);
    margin-top: 4px;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1.35;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* ═══════════════════════════════════════════ DESKTOP */
@media (min-width: 580px) {
    body { padding: 20px 24px 64px; }

    .hero { padding: 32px 0 40px; }
    .hero h1 { font-size: 2.6rem; }
    .hero-sub { font-size: 0.95rem; }
    .hero-stats {
        grid-template-columns: repeat(3, auto);
        max-width: none;
        justify-content: center;
    }
    .hero-stat-val { font-size: 1.6rem; }

    /* Pipeline → horizontal */
    .pipeline { flex-direction: row; align-items: stretch; overflow-x: auto; gap: 0; }
    .pipe-node {
        flex: 1; min-width: 100px;
        flex-direction: column; text-align: center;
        padding: 16px 10px; gap: 8px;
        border-left: none;
    }
    .pipe-step { display: none; }
    .pipe-node.c-amber  { border-bottom: 3px solid rgba(251,191,36,.5);  border-left: none; }
    .pipe-node.c-indigo { border-bottom: 3px solid rgba(129,140,248,.5); border-left: none; }
    .pipe-node.c-coral  { border-bottom: 3px solid rgba(251,113,133,.5); border-left: none; }
    .pipe-node.c-teal   { border-bottom: 3px solid rgba(45,212,191,.5);  border-left: none; }
    .pipe-node.c-purple { border-bottom: 3px solid rgba(192,132,252,.5); border-left: none; }
    .pipe-node.c-cyan   { border-bottom: 3px solid rgba(34,211,238,.5);  border-left: none; }
    .pipe-connector { flex-shrink: 0; padding: 0 4px; align-self: center; justify-content: center; }
    .pipe-connector::after { content: '→'; }

    /* 2-col grids */
    .apis-grid { grid-template-columns: 1fr 1fr; }
    .caps-grid { grid-template-columns: 1fr 1fr; }

    /* Layer cards side-by-side */
    .layers-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 12px;
    }
    .layers-row .layer-card { margin-bottom: 0; }

    /* Stats → 1 row */
    .stats-grid { grid-template-columns: repeat(6, 1fr); }
}
</style>
</head>
<body>
<div class="content">

<!-- ══════════════════════════════════ HERO -->
<section class="hero">
    <p class="hero-eyebrow">BARROOTS · Sistema de Gestão Patrimonial · v3.0</p>
    <h1>Inteligência financeira<br>em tempo real</h1>
    <p class="hero-sub">Plataforma pessoal que conecta carteira, mercado, IA generativa e notícias — do aporte ao imposto.</p>
    <div class="hero-stats">
        <div class="hero-stat">
            <span class="hero-stat-val">5</span>
            <div class="hero-stat-lbl">APIs externas</div>
        </div>
        <div class="hero-stat">
            <span class="hero-stat-val">12</span>
            <div class="hero-stat-lbl">Módulos</div>
        </div>
        <div class="hero-stat">
            <span class="hero-stat-val">4</span>
            <div class="hero-stat-lbl">Moedas</div>
        </div>
    </div>
</section>

<!-- ══════════════════════════════════ RESUMO EXECUTIVO -->
<div class="summary-card">
    <div class="summary-header">
        <span class="summary-icon">⚡</span>
        <div>
            <span class="summary-title-sub">TL;DR · Resumo Executivo</span>
            <div class="summary-title">O que é e como funciona</div>
        </div>
    </div>
    <p class="summary-lead">
        O BARROOTS é uma plataforma <strong>100% pessoal</strong> que usa o <strong>Google Sheets como banco de dados</strong> de investimentos e o conecta automaticamente ao mercado em tempo real. Ele calcula métricas de nível institucional, responde perguntas com IA generativa e envia um relatório diário por e-mail — tudo sem servidor próprio, sem banco de dados extra e zero custo de infraestrutura.
    </p>
    <div class="sp-list">
        <div class="sp">
            <div class="sp-dot-wrap"><span class="sp-dot" style="background:var(--teal)"></span></div>
            <div class="sp-text"><strong>Dados ao vivo</strong> — cotações, câmbio e notícias atualizados a cada sessão via Yahoo Finance, Google News RSS e Reddit API. Sem polling manual.</div>
        </div>
        <div class="sp">
            <div class="sp-dot-wrap"><span class="sp-dot" style="background:var(--indigo)"></span></div>
            <div class="sp-text"><strong>Cálculos institucionais</strong> — TWR (Time-Weighted Return), Mark-to-Market, apuração de IRPF com compensação de prejuízos e suporte a 4 moedas em tempo real.</div>
        </div>
        <div class="sp">
            <div class="sp-dot-wrap"><span class="sp-dot" style="background:var(--purple)"></span></div>
            <div class="sp-text"><strong>IA generativa contextual</strong> — o Agente Gemini recebe todo o portfólio antes de cada resposta. Seleção manual de modelo (Flash/Pro/Preview), fallback automático de quota e busca web integrada.</div>
        </div>
        <div class="sp">
            <div class="sp-dot-wrap"><span class="sp-dot" style="background:var(--amber)"></span></div>
            <div class="sp-text"><strong>Zero infraestrutura</strong> — Google Sheets como banco, Streamlit Cloud como host, GitHub Actions para relatório diário por e-mail. Deploy automático a cada commit.</div>
        </div>
    </div>
</div>

<!-- ══════════════════════════════════ PIPELINE -->
<p class="section-label">// pipeline de dados</p>
<div class="pipeline">
    <div class="pipe-node c-amber">
        <span class="pipe-step">01 · entrada</span>
        <div class="pipe-icon">📋</div>
        <div>
            <div class="pipe-title">Google Sheets</div>
            <div class="pipe-desc">Transações e aportes</div>
        </div>
    </div>
    <div class="pipe-connector"></div>

    <div class="pipe-node c-indigo">
        <span class="pipe-step">02 · mercado</span>
        <div class="pipe-icon">📡</div>
        <div>
            <div class="pipe-title">Yahoo Finance</div>
            <div class="pipe-desc">Cotações em tempo real</div>
        </div>
    </div>
    <div class="pipe-connector"></div>

    <div class="pipe-node c-coral">
        <span class="pipe-step">03 · cálculo</span>
        <div class="pipe-icon">⚡</div>
        <div>
            <div class="pipe-title">Core Engine</div>
            <div class="pipe-desc">TWR · MTM · IRPF</div>
        </div>
    </div>
    <div class="pipe-connector"></div>

    <div class="pipe-node c-purple">
        <span class="pipe-step">04 · ia</span>
        <div class="pipe-icon">🤖</div>
        <div>
            <div class="pipe-title">Gemini AI</div>
            <div class="pipe-desc">Análise contextual + multi-model</div>
        </div>
    </div>
    <div class="pipe-connector"></div>

    <div class="pipe-node c-cyan">
        <span class="pipe-step">05 · notícias</span>
        <div class="pipe-icon">📰</div>
        <div>
            <div class="pipe-title">News + Reddit</div>
            <div class="pipe-desc">3 fontes agregadas</div>
        </div>
    </div>
    <div class="pipe-connector"></div>

    <div class="pipe-node c-teal">
        <span class="pipe-step">06 · saída</span>
        <div class="pipe-icon">📊</div>
        <div>
            <div class="pipe-title">Dashboard</div>
            <div class="pipe-desc">12 módulos interativos</div>
        </div>
    </div>
</div>

<!-- ══════════════════════════════════ CAMADAS IA & NOTÍCIAS -->
<hr class="divider">
<p class="section-label">// camadas inteligentes — novidades</p>
<div class="layers-row">
    <div class="layer-card l-ai">
        <div class="layer-icon">🤖</div>
        <div>
            <div class="layer-title">Agente IA <span class="new-badge">v3</span></div>
            <div class="layer-desc">Chat conversacional com Gemini. Seletor manual de modelos, contexto otimizado (~60-80% menos tokens), fallback automático de quota e busca web integrada.</div>
            <div class="layer-pills">
                <span class="layer-pill hi-purple">google-genai</span>
                <span class="layer-pill hi-purple">Multi-model</span>
                <span class="layer-pill">Streaming</span>
                <span class="layer-pill">Auto-fallback</span>
                <span class="layer-pill">Web Search</span>
            </div>
        </div>
    </div>

    <div class="layer-card l-news">
        <div class="layer-icon">📰</div>
        <div>
            <div class="layer-title">Feed de Notícias <span class="new-badge">v2</span></div>
            <div class="layer-desc">Notícias em tempo real de 3 fontes: Google News RSS, Yahoo Finance e Reddit API. Deduplicação automática, ranking por upvotes e filtragem por ticker.</div>
            <div class="layer-pills">
                <span class="layer-pill hi-cyan">Google News RSS</span>
                <span class="layer-pill hi-cyan">Yahoo Finance</span>
                <span class="layer-pill" style="background:rgba(255,69,0,0.1);border-color:rgba(255,69,0,0.3);color:#ff6b35;">Reddit API</span>
                <span class="layer-pill">Cache 5min</span>
            </div>
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
                <div class="api-role">Cotações, câmbio e notícias</div>
            </div>
        </div>
        <p class="api-desc">Consultada a cada sessão para cotações ao vivo de ativos brasileiros e internacionais, taxas de câmbio e feed de notícias por ticker.</p>
        <ul class="api-items">
            <li>Ações BR (B3) em tempo real</li>
            <li>Ações EUA, ETFs, REITs</li>
            <li>USD/BRL · EUR/BRL · CAD/BRL</li>
            <li>Histórico de preços para TWR</li>
            <li>News feed por ticker</li>
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
        <p class="api-desc">Acesso autenticado via Service Account. Fonte de verdade de todos os lançamentos — sem banco de dados extra, sem infraestrutura adicional.</p>
        <ul class="api-items">
            <li>Histórico completo de transações</li>
            <li>Lançamentos de proventos</li>
            <li>Composição da renda fixa</li>
            <li>Câmbio histórico (PTAX)</li>
        </ul>
    </div>

    <div class="api-card">
        <div class="api-header">
            <div class="api-logo gemini">🤖</div>
            <div>
                <div class="api-name">Gemini API</div>
                <div class="api-role">IA generativa com seletor de modelos</div>
            </div>
        </div>
        <p class="api-desc">O Agente IA envia contexto otimizado ao Gemini antes de cada resposta. Seleção manual de modelo, fallback automático de quota e busca web integrada.</p>
        <ul class="api-items">
            <li>Multi-model: Flash, Pro, Preview</li>
            <li>Fallback automático em erro 429</li>
            <li>Streaming + Web Search</li>
            <li>Contexto: posições, RF, proventos</li>
        </ul>
    </div>

    <div class="api-card">
        <div class="api-header">
            <div class="api-logo news">📰</div>
            <div>
                <div class="api-name">Google News RSS</div>
                <div class="api-role">Feed de notícias sem chave de API</div>
            </div>
        </div>
        <p class="api-desc">Busca notícias em português BR por ticker via RSS público. Combinado com Yahoo Finance News para máxima cobertura, com cache de 5 minutos.</p>
        <ul class="api-items">
            <li>Notícias em pt-BR por ticker</li>
            <li>Sem chave de API necessária</li>
            <li>Fusão com Yahoo Finance News</li>
            <li>Deduplicação automática</li>
        </ul>
    </div>

    <div class="api-card">
        <div class="api-header">
            <div class="api-logo" style="background:linear-gradient(135deg, #ff4500, #ff6b35);">🤖</div>
            <div>
                <div class="api-name">Reddit API <span class="new-badge">NEW</span></div>
                <div class="api-role">Discussões da comunidade financeira</div>
            </div>
        </div>
        <p class="api-desc">Busca posts e discussões sobre seus ativos em 8 subreddits financeiros. Sem autenticação — usa a API JSON pública com ranking por upvotes.</p>
        <ul class="api-items">
            <li>r/investimentos · r/farialimabets</li>
            <li>r/stocks · r/wallstreetbets</li>
            <li>Ranking por score e comentários</li>
            <li>API pública — sem API key</li>
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
            <li>yfinance · gspread · google-genai</li>
            <li>GitHub Actions para relatórios</li>
        </ul>
    </div>

</div>

<!-- ══════════════════════════════════ CAPABILITIES -->
<hr class="divider">
<p class="section-label">// o que o sistema calcula e entrega</p>
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
            <div class="cap-desc">Converte automaticamente posições em USD, EUR e CAD para BRL com cotação live. Suporte a PTAX histórico.</div>
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

    <div class="cap-card">
        <div class="cap-icon">🤖</div>
        <div>
            <div class="cap-title">Agente IA Multi-Model</div>
            <div class="cap-desc">Chat com Gemini que recebe todo o portfólio como contexto. Seletor manual de modelo, fallback automático, Web Search integrada.</div>
            <span class="cap-tag t-purple">Multi-model · auto-fallback · web search</span>
        </div>
    </div>

    <div class="cap-card">
        <div class="cap-icon">📰</div>
        <div>
            <div class="cap-title">Feed de Notícias Multi-Fonte</div>
            <div class="cap-desc">Notícias por ticker de 3 fontes: Google News, Yahoo Finance e Reddit. Upvotes, comentários e deduplicação automática.</div>
            <span class="cap-tag t-cyan">Google News · Yahoo · Reddit · dedup</span>
        </div>
    </div>

    <div class="cap-card">
        <div class="cap-icon">📧</div>
        <div>
            <div class="cap-title">Daily Report Automático <span class="new-badge">NEW</span></div>
            <div class="cap-desc">Relatório diário enviado por e-mail via GitHub Actions. P&L do dia, top gainers/losers, proventos recentes e composição por classe.</div>
            <span class="cap-tag">GitHub Actions · SMTP · cron diário</span>
        </div>
    </div>

    <div class="cap-card">
        <div class="cap-icon">📥</div>
        <div>
            <div class="cap-title">Import IBKR <span class="new-badge">NEW</span></div>
            <div class="cap-desc">Importa trades da Interactive Brokers (CSV) para o Google Sheets. Detecção automática de trades duplicados e inserção idempotente.</div>
            <span class="cap-tag">CSV parser · dedup · auto-sync</span>
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
        <div class="stack-group-label">IA &amp; Notícias</div>
        <div class="stack-row">
            <span class="stack-badge hi-purple">google-genai</span>
            <span class="stack-badge hi-purple">Multi-model selector</span>
            <span class="stack-badge hi-cyan">Google News RSS</span>
            <span class="stack-badge hi-cyan">Yahoo Finance News</span>
            <span class="stack-badge" style="background:rgba(255,69,0,.1);border-color:rgba(255,69,0,.28);color:#ff6b35;">Reddit API</span>
        </div>
    </div>
    <div class="stack-group">
        <div class="stack-group-label">Interface</div>
        <div class="stack-row">
            <span class="stack-badge">Streamlit</span>
            <span class="stack-badge">Plotly</span>
            <span class="stack-badge">HTML5 / CSS3</span>
            <span class="stack-badge">Glassmorphism UI</span>
        </div>
    </div>
    <div class="stack-group">
        <div class="stack-group-label">Infra &amp; CI/CD</div>
        <div class="stack-row">
            <span class="stack-badge">Streamlit Cloud</span>
            <span class="stack-badge">GitHub Actions</span>
            <span class="stack-badge">HTTPS / TLS</span>
            <span class="stack-badge">Service Account</span>
            <span class="stack-badge">Daily Report (cron)</span>
        </div>
    </div>
</div>

<!-- ══════════════════════════════════ STATS FOOTER -->
<div class="stats-grid">
    <div class="stat-box">
        <span class="stat-val">6</span>
        <div class="stat-lbl">camadas</div>
    </div>
    <div class="stat-box">
        <span class="stat-val">5</span>
        <div class="stat-lbl">APIs</div>
    </div>
    <div class="stat-box">
        <span class="stat-val">12</span>
        <div class="stat-lbl">módulos</div>
    </div>
    <div class="stat-box">
        <span class="stat-val">4</span>
        <div class="stat-lbl">moedas</div>
    </div>
    <div class="stat-box">
        <span class="stat-val">3</span>
        <div class="stat-lbl">notícias</div>
    </div>
    <div class="stat-box">
        <span class="stat-val">100%</span>
        <div class="stat-lbl">open src</div>
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

components.html(arch_html, height=5200, scrolling=True)
