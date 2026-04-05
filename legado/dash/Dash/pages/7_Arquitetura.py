import streamlit as st
import streamlit.components.v1 as components
from core.auth import require_auth

require_auth()

st.set_page_config(
    page_title="Arquitetura · BRTS",
    page_icon=None,
    layout="wide",
    initial_sidebar_state="collapsed"
)

st.markdown("""
<style>
    #MainMenu, footer, header { visibility: hidden; }
    section[data-testid="stSidebar"] { display: none; }
    .stApp { background: #080e1a; }
    .block-container { padding: 0 !important; max-width: 100% !important; }
    iframe { border: none !important; }
</style>
""", unsafe_allow_html=True)

PAGE_HTML = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
/* ── RESET & BASE ─────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:      #080e1a;
  --bg2:     #0f172a;
  --bg3:     rgba(30,41,59,0.55);
  --border:  rgba(255,255,255,0.07);
  --text:    #f1f5f9;
  --muted:   #94a3b8;
  --dim:     #475569;
  --teal:    #2dd4bf;
  --indigo:  #818cf8;
  --coral:   #fb7185;
  --amber:   #fbbf24;
  --purple:  #c084fc;
  --cyan:    #22d3ee;
  --green:   #4ade80;
  --r:       18px;
  --r-sm:    12px;
  --gap:     14px;
}
html { background: var(--bg); }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  padding: 0 0 80px;
  overflow-x: hidden;
}
a { color: inherit; text-decoration: none; }

/* ── LAYOUT ───────────────────────────────────────────────────────────── */
.wrap { max-width: 640px; margin: 0 auto; padding: 0 16px; }

/* ── HERO ─────────────────────────────────────────────────────────────── */
.hero {
  text-align: center;
  padding: 36px 16px 28px;
  position: relative;
}
.hero-badge {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--teal);
  background: rgba(45,212,191,0.08);
  border: 1px solid rgba(45,212,191,0.2);
  border-radius: 20px;
  padding: 4px 12px;
  margin-bottom: 16px;
}
.hero h1 {
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 800;
  letter-spacing: -1px;
  background: linear-gradient(135deg, #fff 30%, #94a3b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.1;
  margin-bottom: 10px;
}
.hero-sub {
  font-size: 0.88rem;
  color: var(--muted);
  max-width: 340px;
  margin: 0 auto 24px;
  line-height: 1.6;
}
.hero-pills {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.pill {
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.pill-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── SECTION HEADER ───────────────────────────────────────────────────── */
.section { margin-bottom: 28px; }
.section-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 12px;
  padding-left: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* ── CARD ─────────────────────────────────────────────────────────────── */
.card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r);
  backdrop-filter: blur(12px);
  position: relative;
  overflow: hidden;
}
.card-top {
  height: 2px;
  border-radius: var(--r) var(--r) 0 0;
}
.card-body { padding: 18px 16px; }

/* ── PIPELINE ─────────────────────────────────────────────────────────── */
.pipeline { display: flex; flex-direction: column; gap: 4px; }
.pipe-step {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  position: relative;
}
.pipe-num {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 800;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.pipe-content { flex: 1; min-width: 0; }
.pipe-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}
.pipe-desc {
  font-size: 0.75rem;
  color: var(--muted);
}
.pipe-arrow {
  font-size: 0.75rem;
  color: var(--dim);
  flex-shrink: 0;
}
.pipe-connector {
  width: 2px;
  height: 8px;
  background: linear-gradient(to bottom, rgba(255,255,255,0.06), transparent);
  margin: 0 auto 0 23px;
}

/* ── PAGES GRID ───────────────────────────────────────────────────────── */
.pages-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.page-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 14px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: border-color 0.2s;
}
.page-icon {
  font-size: 1.2rem;
  line-height: 1;
  flex-shrink: 0;
}
.page-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}
.page-sub {
  font-size: 0.68rem;
  color: var(--dim);
  margin-top: 2px;
}

/* ── ACCORDION (CSS-only) ─────────────────────────────────────────────── */
.accordion { display: flex; flex-direction: column; gap: 6px; }
.acc-item input[type="checkbox"] { display: none; }
.acc-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: background 0.2s, border-color 0.2s;
  gap: 10px;
}
.acc-label:active { background: rgba(255,255,255,0.06); }
.acc-label-left { display: flex; align-items: center; gap: 10px; }
.acc-icon { font-size: 1.1rem; flex-shrink: 0; }
.acc-title { font-size: 0.88rem; font-weight: 700; color: var(--text); }
.acc-subtitle { font-size: 0.7rem; color: var(--dim); margin-top: 1px; }
.acc-chevron {
  color: var(--dim);
  font-size: 0.7rem;
  flex-shrink: 0;
  transition: transform 0.25s;
}
.acc-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4,0,0.2,1);
}
.acc-inner {
  padding: 14px 16px;
  background: rgba(15,23,42,0.6);
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--r-sm) var(--r-sm);
  margin-top: -6px;
}
input[type="checkbox"]:checked ~ .acc-label { border-color: rgba(255,255,255,0.14); }
input[type="checkbox"]:checked ~ .acc-label .acc-chevron { transform: rotate(180deg); }
input[type="checkbox"]:checked ~ .acc-body { max-height: 600px; }

/* ── TAGS ─────────────────────────────────────────────────────────────── */
.tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.tag {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 3px 8px;
  border-radius: 6px;
  color: var(--text);
  opacity: 0.85;
}
.acc-list {
  font-size: 0.8rem;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 4px;
}
.acc-list li { display: flex; align-items: baseline; gap: 7px; list-style: none; }
.acc-list li::before { content: '·'; color: var(--dim); flex-shrink: 0; }

/* ── CAPABILITIES GRID ────────────────────────────────────────────────── */
.cap-grid { display: flex; flex-direction: column; gap: 6px; }
.cap-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 14px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.cap-emoji { font-size: 1.1rem; flex-shrink: 0; line-height: 1.3; }
.cap-text { flex: 1; min-width: 0; }
.cap-title { font-size: 0.85rem; font-weight: 700; color: var(--text); }
.cap-desc { font-size: 0.75rem; color: var(--muted); margin-top: 2px; line-height: 1.45; }

/* ── TECH STACK ───────────────────────────────────────────────────────── */
.tech-group { margin-bottom: 16px; }
.tech-group-name {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 8px;
}
.tech-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.tech-pill {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 8px;
  padding: 6px 11px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 5px;
}

/* ── STATS BAR ────────────────────────────────────────────────────────── */
.stats-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}
.stat-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 14px 10px;
  text-align: center;
}
.stat-val {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--teal);
  line-height: 1;
}
.stat-lbl { font-size: 0.65rem; color: var(--dim); margin-top: 4px; }

/* ── BACK LINK ────────────────────────────────────────────────────────── */
.back-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 600;
}
.back-link span { opacity: 0.6; }

/* ── DIVIDER ──────────────────────────────────────────────────────────── */
.divider { height: 1px; background: var(--border); margin: 4px 0 20px; }

/* ── DESKTOP BREAKPOINT ───────────────────────────────────────────────── */
@media (min-width: 580px) {
  body { font-size: 16px; }
  .hero { padding: 48px 16px 36px; }
  .hero h1 { font-size: 3rem; }
  .pages-grid { grid-template-columns: repeat(3, 1fr); }
  .stats-bar { grid-template-columns: repeat(6, 1fr); }
}
</style>
</head>
<body>

<!-- BACK NAV -->
<a href="javascript:history.back()" class="back-link">
  <span>←</span> Voltar
</a>

<div class="wrap">

  <!-- ── HERO ─────────────────────────────────────────────────────────── -->
  <div class="hero">
    <div class="hero-badge">Arquitetura do Sistema</div>
    <h1>BRTS</h1>
    <p class="hero-sub">Plataforma pessoal de gestão patrimonial — da planilha ao dashboard com IA em tempo real</p>
    <div class="hero-pills">
      <span class="pill"><span class="pill-dot" style="background:var(--teal)"></span>v3.0 · 2025</span>
      <span class="pill"><span class="pill-dot" style="background:var(--indigo)"></span>Streamlit Cloud</span>
      <span class="pill"><span class="pill-dot" style="background:var(--purple)"></span>Gemini AI</span>
    </div>
  </div>

  <!-- ── STATS ─────────────────────────────────────────────────────────── -->
  <div class="section">
    <div class="stats-bar">
      <div class="stat-card"><div class="stat-val" style="color:var(--teal)">10</div><div class="stat-lbl">Páginas</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--indigo)">5</div><div class="stat-lbl">APIs</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--purple)">4</div><div class="stat-lbl">Moedas</div></div>
    </div>
  </div>

  <!-- ── PIPELINE ───────────────────────────────────────────────────────── -->
  <div class="section">
    <div class="section-label">Pipeline de dados</div>
    <div class="pipeline">

      <div class="pipe-step">
        <div class="pipe-num" style="background:rgba(45,212,191,0.12);color:var(--teal)">01</div>
        <div class="pipe-content">
          <div class="pipe-title">Entrada</div>
          <div class="pipe-desc">Google Sheets · transações e aportes</div>
        </div>
        <div class="pipe-arrow">↓</div>
      </div>
      <div class="pipe-connector"></div>

      <div class="pipe-step">
        <div class="pipe-num" style="background:rgba(34,211,238,0.12);color:var(--cyan)">02</div>
        <div class="pipe-content">
          <div class="pipe-title">Mercado</div>
          <div class="pipe-desc">Yahoo Finance · cotações em tempo real</div>
        </div>
        <div class="pipe-arrow">↓</div>
      </div>
      <div class="pipe-connector"></div>

      <div class="pipe-step">
        <div class="pipe-num" style="background:rgba(129,140,248,0.12);color:var(--indigo)">03</div>
        <div class="pipe-content">
          <div class="pipe-title">Cálculo</div>
          <div class="pipe-desc">Core Engine · TWR · MTM · IRPF</div>
        </div>
        <div class="pipe-arrow">↓</div>
      </div>
      <div class="pipe-connector"></div>

      <div class="pipe-step">
        <div class="pipe-num" style="background:rgba(192,132,252,0.12);color:var(--purple)">04</div>
        <div class="pipe-content">
          <div class="pipe-title">IA</div>
          <div class="pipe-desc">Gemini · análise contextual multi-model</div>
        </div>
        <div class="pipe-arrow">↓</div>
      </div>
      <div class="pipe-connector"></div>

      <div class="pipe-step">
        <div class="pipe-num" style="background:rgba(251,191,36,0.12);color:var(--amber)">05</div>
        <div class="pipe-content">
          <div class="pipe-title">Notícias</div>
          <div class="pipe-desc">Google News · Yahoo · Reddit · 3 fontes</div>
        </div>
        <div class="pipe-arrow">↓</div>
      </div>
      <div class="pipe-connector"></div>

      <div class="pipe-step">
        <div class="pipe-num" style="background:rgba(74,222,128,0.12);color:var(--green)">06</div>
        <div class="pipe-content">
          <div class="pipe-title">Dashboard</div>
          <div class="pipe-desc">10 módulos interativos · mobile-first</div>
        </div>
      </div>

    </div>
  </div>

  <!-- ── PAGES ──────────────────────────────────────────────────────────── -->
  <div class="section">
    <div class="section-label">Módulos do sistema</div>
    <div class="pages-grid">
      <div class="page-card">
        <div class="page-icon">🏠</div>
        <div><div class="page-name">Home</div><div class="page-sub">Visão geral</div></div>
      </div>
      <div class="page-card">
        <div class="page-icon">📈</div>
        <div><div class="page-name">Investimentos</div><div class="page-sub">RV · RF · Proventos</div></div>
      </div>
      <div class="page-card">
        <div class="page-icon">💳</div>
        <div><div class="page-name">Finanças</div><div class="page-sub">Controle pessoal</div></div>
      </div>
      <div class="page-card">
        <div class="page-icon">⚡</div>
        <div><div class="page-name">Performance</div><div class="page-sub">TWR · Benchmarks</div></div>
      </div>
      <div class="page-card">
        <div class="page-icon">🛠️</div>
        <div><div class="page-name">Ferramentas</div><div class="page-sub">Calculadoras</div></div>
      </div>
      <div class="page-card">
        <div class="page-icon">✏️</div>
        <div><div class="page-name">Editor</div><div class="page-sub">Transações</div></div>
      </div>
      <div class="page-card">
        <div class="page-icon">📊</div>
        <div><div class="page-name">Histórico</div><div class="page-sub">Patrimônio</div></div>
      </div>
      <div class="page-card">
        <div class="page-icon">📰</div>
        <div><div class="page-name">Notícias</div><div class="page-sub">Multi-fonte</div></div>
      </div>
      <div class="page-card">
        <div class="page-icon">🤖</div>
        <div><div class="page-name">Agente IA</div><div class="page-sub">Gemini Chat</div></div>
      </div>
      <div class="page-card">
        <div class="page-icon">🧬</div>
        <div><div class="page-name">Arquitetura</div><div class="page-sub">Esta página</div></div>
      </div>
    </div>
  </div>

  <!-- ── APIS ───────────────────────────────────────────────────────────── -->
  <div class="section">
    <div class="section-label">APIs consumidas</div>
    <div class="accordion">

      <div class="acc-item">
        <input type="checkbox" id="api1">
        <label class="acc-label" for="api1">
          <div class="acc-label-left">
            <span class="acc-icon">📊</span>
            <div><div class="acc-title">Yahoo Finance</div><div class="acc-subtitle">Cotações · câmbio · histórico</div></div>
          </div>
          <span class="acc-chevron">▼</span>
        </label>
        <div class="acc-body">
          <div class="acc-inner">
            <ul class="acc-list">
              <li>Ações BR (B3) em tempo real</li>
              <li>Ações EUA, ETFs e REITs</li>
              <li>USD/BRL · EUR/BRL · CAD/BRL</li>
              <li>Histórico de preços para TWR</li>
              <li>News feed por ticker</li>
            </ul>
            <div class="tags">
              <span class="tag" style="background:rgba(34,211,238,0.12);color:var(--cyan)">yfinance</span>
              <span class="tag" style="background:rgba(34,211,238,0.12);color:var(--cyan)">sem API key</span>
              <span class="tag" style="background:rgba(34,211,238,0.12);color:var(--cyan)">B3 + NYSE</span>
            </div>
          </div>
        </div>
      </div>

      <div class="acc-item">
        <input type="checkbox" id="api2">
        <label class="acc-label" for="api2">
          <div class="acc-label-left">
            <span class="acc-icon">📋</span>
            <div><div class="acc-title">Google Sheets</div><div class="acc-subtitle">Banco de dados da carteira</div></div>
          </div>
          <span class="acc-chevron">▼</span>
        </label>
        <div class="acc-body">
          <div class="acc-inner">
            <ul class="acc-list">
              <li>Histórico completo de transações</li>
              <li>Lançamentos de proventos e dividendos</li>
              <li>Composição da renda fixa</li>
              <li>Câmbio histórico PTAX</li>
            </ul>
            <div class="tags">
              <span class="tag" style="background:rgba(74,222,128,0.12);color:var(--green)">gspread</span>
              <span class="tag" style="background:rgba(74,222,128,0.12);color:var(--green)">Service Account</span>
              <span class="tag" style="background:rgba(74,222,128,0.12);color:var(--green)">zero DB cost</span>
            </div>
          </div>
        </div>
      </div>

      <div class="acc-item">
        <input type="checkbox" id="api3">
        <label class="acc-label" for="api3">
          <div class="acc-label-left">
            <span class="acc-icon">🤖</span>
            <div><div class="acc-title">Gemini API</div><div class="acc-subtitle">IA generativa multi-model</div></div>
          </div>
          <span class="acc-chevron">▼</span>
        </label>
        <div class="acc-body">
          <div class="acc-inner">
            <ul class="acc-list">
              <li>Modelos: 2.5-Flash → 2.5-Pro → 2.0-Flash</li>
              <li>Fallback automático em erro de quota (429)</li>
              <li>Streaming de resposta em tempo real</li>
              <li>Web Search integrada</li>
              <li>Contexto completo: posições, RF, proventos</li>
            </ul>
            <div class="tags">
              <span class="tag" style="background:rgba(192,132,252,0.12);color:var(--purple)">google-genai</span>
              <span class="tag" style="background:rgba(192,132,252,0.12);color:var(--purple)">multi-model</span>
              <span class="tag" style="background:rgba(192,132,252,0.12);color:var(--purple)">streaming</span>
              <span class="tag" style="background:rgba(192,132,252,0.12);color:var(--purple)">web search</span>
            </div>
          </div>
        </div>
      </div>

      <div class="acc-item">
        <input type="checkbox" id="api4">
        <label class="acc-label" for="api4">
          <div class="acc-label-left">
            <span class="acc-icon">📰</span>
            <div><div class="acc-title">Google News RSS</div><div class="acc-subtitle">Notícias sem API key</div></div>
          </div>
          <span class="acc-chevron">▼</span>
        </label>
        <div class="acc-body">
          <div class="acc-inner">
            <ul class="acc-list">
              <li>Notícias em pt-BR por ticker</li>
              <li>Fusão com Yahoo Finance News</li>
              <li>Deduplicação automática por título</li>
              <li>Cache de 5 minutos</li>
            </ul>
            <div class="tags">
              <span class="tag" style="background:rgba(251,191,36,0.12);color:var(--amber)">RSS</span>
              <span class="tag" style="background:rgba(251,191,36,0.12);color:var(--amber)">sem API key</span>
              <span class="tag" style="background:rgba(251,191,36,0.12);color:var(--amber)">dedup</span>
            </div>
          </div>
        </div>
      </div>

      <div class="acc-item">
        <input type="checkbox" id="api5">
        <label class="acc-label" for="api5">
          <div class="acc-label-left">
            <span class="acc-icon">💬</span>
            <div><div class="acc-title">Reddit API</div><div class="acc-subtitle">Comunidade financeira</div></div>
          </div>
          <span class="acc-chevron">▼</span>
        </label>
        <div class="acc-body">
          <div class="acc-inner">
            <ul class="acc-list">
              <li>r/investimentos · r/farialimabets</li>
              <li>r/stocks · r/wallstreetbets</li>
              <li>Ranking por score e comentários</li>
              <li>API pública — sem API key</li>
            </ul>
            <div class="tags">
              <span class="tag" style="background:rgba(251,113,133,0.12);color:var(--coral)">Reddit JSON</span>
              <span class="tag" style="background:rgba(251,113,133,0.12);color:var(--coral)">sem API key</span>
              <span class="tag" style="background:rgba(251,113,133,0.12);color:var(--coral)">8 subreddits</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- ── CAPABILITIES ────────────────────────────────────────────────────── -->
  <div class="section">
    <div class="section-label">Capacidades do sistema</div>
    <div class="cap-grid">
      <div class="cap-row">
        <div class="cap-emoji">💰</div>
        <div class="cap-text">
          <div class="cap-title">Lucro Realizado e Não Realizado</div>
          <div class="cap-desc">Separa embolsado (vendas) de aberto (posições ativas) · preço médio ponderado</div>
        </div>
      </div>
      <div class="cap-row">
        <div class="cap-emoji">📈</div>
        <div class="cap-text">
          <div class="cap-title">Rentabilidade TWR</div>
          <div class="cap-desc">Time-Weighted Return · elimina distorção de aportes e retiradas</div>
        </div>
      </div>
      <div class="cap-row">
        <div class="cap-emoji">💱</div>
        <div class="cap-text">
          <div class="cap-title">Multi-Moeda em Tempo Real</div>
          <div class="cap-desc">USD · EUR · CAD → BRL com suporte a PTAX histórico</div>
        </div>
      </div>
      <div class="cap-row">
        <div class="cap-emoji">🦁</div>
        <div class="cap-text">
          <div class="cap-title">Apuração de IRPF</div>
          <div class="cap-desc">Imposto sobre vendas RV · compensação de prejuízos · isenção &lt;R$20k/mês</div>
        </div>
      </div>
      <div class="cap-row">
        <div class="cap-emoji">💎</div>
        <div class="cap-text">
          <div class="cap-title">Proventos e Dividendos</div>
          <div class="cap-desc">Dividendos · JCP · FIIs por ativo, mês e acumulado · yield tracking</div>
        </div>
      </div>
      <div class="cap-row">
        <div class="cap-emoji">🌍</div>
        <div class="cap-text">
          <div class="cap-title">Visão 360° do Patrimônio</div>
          <div class="cap-desc">RV · RF · cripto · caixa · composição por classe, setor, moeda e custódia</div>
        </div>
      </div>
      <div class="cap-row">
        <div class="cap-emoji">📧</div>
        <div class="cap-text">
          <div class="cap-title">Daily Report Automático</div>
          <div class="cap-desc">P&amp;L do dia · top gainers/losers · proventos · via GitHub Actions + SMTP</div>
        </div>
      </div>
      <div class="cap-row">
        <div class="cap-emoji">📥</div>
        <div class="cap-text">
          <div class="cap-title">Import IBKR</div>
          <div class="cap-desc">Importa trades da Interactive Brokers (CSV) · dedup automático · inserção idempotente</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── TECH STACK ──────────────────────────────────────────────────────── -->
  <div class="section">
    <div class="section-label">Tech stack</div>
    <div class="card">
      <div class="card-top" style="background:linear-gradient(90deg,var(--teal),var(--indigo),var(--purple))"></div>
      <div class="card-body">

        <div class="tech-group">
          <div class="tech-group-name">Core</div>
          <div class="tech-pills">
            <span class="tech-pill">🐍 Python 3.13</span>
            <span class="tech-pill">🐼 Pandas</span>
            <span class="tech-pill">🔢 NumPy</span>
            <span class="tech-pill">📈 yfinance</span>
            <span class="tech-pill">📋 gspread</span>
          </div>
        </div>

        <div class="tech-group">
          <div class="tech-group-name">Interface</div>
          <div class="tech-pills">
            <span class="tech-pill">⚡ Streamlit</span>
            <span class="tech-pill">📊 Plotly</span>
            <span class="tech-pill">🎨 HTML5 / CSS3</span>
          </div>
        </div>

        <div class="tech-group">
          <div class="tech-group-name">IA & Notícias</div>
          <div class="tech-pills">
            <span class="tech-pill">🤖 google-genai</span>
            <span class="tech-pill">📡 RSS</span>
            <span class="tech-pill">💬 Reddit JSON</span>
          </div>
        </div>

        <div class="tech-group" style="margin-bottom:0">
          <div class="tech-group-name">Infra & CI/CD</div>
          <div class="tech-pills">
            <span class="tech-pill">☁️ Streamlit Cloud</span>
            <span class="tech-pill">⚙️ GitHub Actions</span>
            <span class="tech-pill">🔒 HTTPS / TLS</span>
            <span class="tech-pill">📬 SMTP</span>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- ── INFRA NOTE ──────────────────────────────────────────────────────── -->
  <div class="section">
    <div class="card">
      <div class="card-top" style="background:linear-gradient(90deg,var(--amber),var(--coral))"></div>
      <div class="card-body">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <span style="font-size:1.3rem;flex-shrink:0">🏗️</span>
          <div>
            <div style="font-size:0.88rem;font-weight:700;color:var(--text);margin-bottom:6px">Zero Infrastructure</div>
            <div style="font-size:0.78rem;color:var(--muted);line-height:1.6">
              Google Sheets como banco de dados · Streamlit Cloud como host · GitHub Actions para relatório diário · deploy automático a cada commit · sem servidor próprio, sem custo fixo de infra.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── FOOTER ──────────────────────────────────────────────────────────── -->
  <div style="text-align:center;padding:20px 0 12px;color:var(--dim);font-size:0.72rem;">
    BRTS · Sistema de Gestão Patrimonial · v3.0
  </div>

</div><!-- /wrap -->
</body>
</html>"""

components.html(PAGE_HTML, height=4200, scrolling=True)
