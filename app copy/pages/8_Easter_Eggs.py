import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import json
from core.auth import require_auth
from core.data.loader import load_assets, load_fixed_income, load_fixed_income_manual, load_proventos, load_cambio
from core.visuals.global_map import render_global_map
from core.finance import calcular_carteira_fechada, summarize_fixed_income, summarize_fixed_income_hybrid
from core.data.market import fetch_market_data
from core.logic import identificar_setor_ativo
from core.ui import get_logo_base64

# --- PAGE CONFIG ---
st.set_page_config(
    page_title="Protocolo Oculto",
    page_icon="👁️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS: CYBERPUNK HUB ---
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

    /* BASE THEME */
    .stApp {
        background-color: #050505;
        color: #e0e0e0;
        font-family: 'Share Tech Mono', monospace;
    }
    
    /* BACKGROUND GRID ANIMATION */
    .stApp::before {
        content: "";
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: 
            linear-gradient(rgba(0, 255, 65, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 65, 0.03) 1px, transparent 1px);
        background-size: 40px 40px;
        z-index: 0;
        pointer-events: none;
        animation: gridScan 20s linear infinite;
    }
    @keyframes gridScan {
        0% { transform: translateY(0); }
        100% { transform: translateY(40px); }
    }

    /* GLITCH TEXT EFFECT */
    .glitch-title {
        font-family: 'Orbitron', sans-serif;
        font-size: 3.5rem;
        font-weight: 900;
        text-align: center;
        text-transform: uppercase;
        color: #fff;
        text-shadow: 2px 2px 0px #00ff41, -2px -2px 0px #ff00de;
        animation: glitch 3s infinite alternate;
        margin-bottom: 2rem;
    }
    @keyframes glitch {
        0% { text-shadow: 2px 2px 0px #00ff41, -2px -2px 0px #ff00de; opacity: 1; }
        98% { opacity: 1; }
        99% { opacity: 0.8; text-shadow: -2px 2px 0px #ff00de, 2px -2px 0px #00ff41; transform: skewX(10deg); }
        100% { opacity: 1; transform: skewX(0deg); }
    }

    /* CARD GRID SYSTEM */
    .hub-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
    }

    /* EASTER EGG CARD */
    .egg-card {
        background: rgba(20, 20, 20, 0.9);
        border: 2px solid #333;
        border-radius: 12px;
        height: 250px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
        position: relative;
        overflow: hidden;
    }

    /* UNLOCKED STATE */
    .egg-card.unlocked {
        border-color: #00ff41;
        box-shadow: 0 0 15px rgba(0, 255, 65, 0.1);
    }
    .egg-card.unlocked:hover {
        transform: translateY(-10px) scale(1.02);
        box-shadow: 0 0 30px rgba(0, 255, 65, 0.4);
        background: rgba(0, 40, 10, 0.9);
    }
    .egg-card.unlocked .icon { font-size: 4rem; margin-bottom: 10px; animation: float 3s ease-in-out infinite; }
    .egg-card.unlocked .label { color: #00ff41; font-weight: 700; font-size: 1.2rem; font-family: 'Orbitron'; }

    /* LOCKED STATE */
    .egg-card.locked {
        border-color: #333;
        color: #555;
        background: #0a0a0a;
    }
    .egg-card.locked .icon { font-size: 3rem; color: #333; margin-bottom: 5px; }
    .egg-card.locked .label { color: #444; font-size: 0.9rem; }
    .egg-card.locked::after {
        content: "CLASSIFIED";
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 1.5rem;
        color: rgba(255, 0, 0, 0.1);
        font-weight: 900;
        pointer-events: none;
        border: 2px solid rgba(255, 0, 0, 0.1);
        padding: 5px 10px;
    }

    @keyframes float {
        0% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
        100% { transform: translateY(0px); }
    }

    /* HIDE STREAMLIT UI */
    #MainMenu, footer, header {visibility: hidden;}
    section[data-testid="stSidebar"] { display: none; }
    
</style>
""", unsafe_allow_html=True)

# --- STATE MANAGEMENT ---
if 'active_egg' not in st.session_state:
    st.session_state.active_egg = None

def return_to_hub():
    st.session_state.active_egg = None

def enter_egg(egg_id):
    st.session_state.active_egg = egg_id

# --- HELPER: ROBUST PORTFOLIO DATA ---
def get_portfolio_data():
    """Consolidated Portfolio Data Logic (Mini-Engine from Investimentos.py)"""
    # 1. Load Raw Data
    df_assets = load_assets()
    df_rf_raw = load_fixed_income()
    df_rf_manual = load_fixed_income_manual()
    df_prov = load_proventos()
    
    lista_global = []
    
    # 2. Variable Income Processing
    if not df_assets.empty:
        # Ticker List & Market Data
        tickers = df_assets['ticker'].unique().tolist()
        for t in ['BRL=X', 'EURBRL=X', 'CADBRL=X']:    
            if t not in tickers: tickers.append(t)
            
        map_prices, _ = fetch_market_data(tickers)
        
        # Currencies
        usd = map_prices.get('BRL=X', 5.50)
        eur = map_prices.get('EURBRL=X', 6.00)
        
        # Positions
        df_pos, _ = calcular_carteira_fechada(df_assets)
        
        for _, row in df_pos.iterrows():
            if row['Qtd'] > 0:
                t = row['Ticker']
                price = map_prices.get(t, 0.0)
                if price <= 0: price = row['PM_Origem'] # Fallback
                
                # Conversion
                rate = 1.0
                if row['Moeda'] == 'USD': rate = usd
                elif row['Moeda'] == 'EUR': rate = eur
                
                # Sector/Class Logic
                setor = identificar_setor_ativo(t)
                # Refine Class
                if any(x in t for x in ['BTC', 'ETH', 'SOL']): setor = 'Cripto'
                elif 'ETF' in setor or any(x in t for x in ['IVV', 'VOO', 'VT']): setor = 'ETFs'
                elif row['Moeda'] != 'BRL': setor = 'Ações intl'
                
                val_brl = row['Qtd'] * price * rate
                lista_global.append({'Class': setor, 'Value': val_brl})

    # 3. Fixed Income Processing
    if not df_rf_raw.empty:
        if df_rf_manual.empty:
            df_rf = summarize_fixed_income(df_rf_raw)
        else:
            df_rf = summarize_fixed_income_hybrid(df_rf_manual, df_rf_raw, df_prov)
            
        # Filter Active
        df_rf = df_rf[df_rf['Status'] == 'Ativo']
        
        for _, row in df_rf.iterrows():
            # Class Logic
            ativo_name = str(row['Ativo']).upper()
            classe = 'Renda Fixa'
            if 'CAIXA' in ativo_name or 'SALDO' in ativo_name: classe = 'Caixa'
            elif 'TESOURO' in ativo_name: classe = 'Tesouro'
            elif 'CDB' in ativo_name: classe = 'CDBs'
            elif 'FII' in row.get('Tipo', '').upper(): classe = 'FIIs' # catch mislabeled RF
            
            # Value (Already simplified in summary, usually BRL)
            val = row['Atual']
            if row.get('Moeda', 'BRL') == 'USD':
                val *= 5.50 # Simplification if map not available here
                
            lista_global.append({'Class': classe, 'Value': val})

    return pd.DataFrame(lista_global)

# --- BIO-DOME LOGIC (EGG #2) ---
def render_bio_dome():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_bio_back"):
            return_to_hub()
            st.rerun()

    # Load portfolio data
    with st.spinner("Cultivando espécies financeiras..."):
        df_portfolio = get_portfolio_data()

    ecosystem_data = []
    total_val = 0

    if not df_portfolio.empty:
        grouped = df_portfolio.groupby('Class')['Value'].sum().reset_index()
        total_val = grouped['Value'].sum()
        grouped = grouped.sort_values('Value', ascending=False).reset_index(drop=True)

        # Creature types per asset class with unique behaviors
        species_config = {
            'Renda Fixa': {'type': 'jellyfish', 'color': '#00ff41', 'speed': 0.5, 'icon': '🪼'},
            'Tesouro': {'type': 'firefly', 'color': '#10b981', 'speed': 1.0, 'icon': '✨'},
            'CDBs': {'type': 'fish', 'color': '#0ea5e9', 'speed': 1.5, 'icon': '🐟'},
            'Ações': {'type': 'butterfly', 'color': '#ff00de', 'speed': 2.5, 'icon': '🦋'},
            'FIIs': {'type': 'coral', 'color': '#00efff', 'speed': 0.1, 'icon': '🪸'},
            'Cripto': {'type': 'bee', 'color': '#ffcc00', 'speed': 3.5, 'icon': '🐝'},
            'Ações intl': {'type': 'bird', 'color': '#ff4400', 'speed': 3.0, 'icon': '🦅'},
            'Caixa': {'type': 'bubble', 'color': '#ffffff', 'speed': 0.8, 'icon': '🫧'},
            'ETFs': {'type': 'turtle', 'color': '#8b5cf6', 'speed': 0.7, 'icon': '🐢'},
            'Commodities': {'type': 'crab', 'color': '#84cc16', 'speed': 1.2, 'icon': '🦀'}
        }

        for _, row in grouped.iterrows():
            classe = row['Class']
            val = row['Value']
            if total_val > 0:
                pct = (val / total_val) * 100
                config = species_config.get(classe, {'type': 'fish', 'color': '#888888', 'speed': 1.0, 'icon': '🐠'})
                count = max(2, min(25, int(pct * 0.5)))
                size = max(8, min(25, int(pct * 0.6)))

                ecosystem_data.append({
                    'species': classe,
                    'type': config['type'],
                    'color': config['color'],
                    'icon': config['icon'],
                    'speed': config['speed'],
                    'count': count,
                    'size': size,
                    'value': float(val),
                    'pct': float(pct)
                })

    if not ecosystem_data:
        ecosystem_data = [{'species': 'Demo', 'type': 'fish', 'color': '#00ff41', 'icon': '🐠', 'speed': 1.0, 'count': 15, 'size': 12, 'value': 0, 'pct': 100}]

    eco_json = json.dumps(ecosystem_data)
    total_val_fmt = f"R$ {total_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    bio_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap" rel="stylesheet">
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{
                overflow: hidden;
                background: linear-gradient(180deg, #000510 0%, #001020 50%, #000818 100%);
                font-family: 'Orbitron', sans-serif;
                touch-action: none;
                user-select: none;
            }}
            canvas {{ display: block; }}

            /* Main Panel */
            #main-panel {{
                position: absolute; top: 15px; left: 15px;
                background: linear-gradient(135deg, rgba(0,20,30,0.95) 0%, rgba(0,40,50,0.9) 100%);
                padding: 15px 20px; border-radius: 15px;
                border: 1px solid rgba(0,255,200,0.3);
                box-shadow: 0 0 30px rgba(0,255,200,0.1), inset 0 0 30px rgba(0,0,0,0.5);
                z-index: 100; min-width: 200px;
                backdrop-filter: blur(10px);
            }}
            #main-panel h2 {{
                color: #00ffc8; margin: 0 0 5px 0; font-size: 0.75rem;
                text-transform: uppercase; letter-spacing: 2px;
                text-shadow: 0 0 10px rgba(0,255,200,0.5);
            }}
            #portfolio-value {{
                font-size: 1.2rem; color: #fff; font-weight: 700;
                margin-bottom: 10px;
            }}
            #ecosystem-health {{
                height: 4px; background: rgba(255,255,255,0.1);
                border-radius: 2px; overflow: hidden; margin-bottom: 8px;
            }}
            #health-bar {{
                height: 100%; width: 100%;
                background: linear-gradient(90deg, #00ff41, #00ffc8);
                border-radius: 2px;
                transition: width 0.5s ease;
            }}
            .stat-row {{
                display: flex; justify-content: space-between;
                font-size: 0.6rem; color: #888; margin-top: 5px;
            }}

            /* Species Panel */
            #species-panel {{
                position: absolute; top: 15px; right: 15px;
                background: rgba(0,20,30,0.9);
                padding: 15px; border-radius: 15px;
                border: 1px solid rgba(255,255,255,0.1);
                z-index: 100; max-width: 220px;
                max-height: 300px; overflow-y: auto;
                backdrop-filter: blur(10px);
            }}
            #species-panel h3 {{
                color: #00ffc8; font-size: 0.65rem;
                text-transform: uppercase; letter-spacing: 1px;
                margin-bottom: 10px;
            }}
            .species-item {{
                display: flex; align-items: center; gap: 10px;
                padding: 8px; margin-bottom: 5px;
                background: rgba(255,255,255,0.03);
                border-radius: 8px; cursor: pointer;
                transition: all 0.2s;
            }}
            .species-item:hover {{
                background: rgba(255,255,255,0.08);
                transform: translateX(3px);
            }}
            .species-item.highlighted {{
                background: rgba(0,255,200,0.15);
                border: 1px solid rgba(0,255,200,0.3);
            }}
            .species-icon {{ font-size: 1.3rem; }}
            .species-info {{ flex: 1; }}
            .species-name {{ font-size: 0.7rem; color: #fff; }}
            .species-stats {{ font-size: 0.55rem; color: #888; }}
            .species-count {{
                font-size: 0.8rem; font-weight: 700;
                padding: 3px 8px; border-radius: 10px;
                background: rgba(255,255,255,0.1);
            }}

            /* Controls */
            #controls {{
                position: absolute; bottom: 15px; left: 50%;
                transform: translateX(-50%);
                background: rgba(0,20,30,0.9);
                padding: 12px 20px; border-radius: 25px;
                border: 1px solid rgba(255,255,255,0.1);
                display: flex; gap: 15px; align-items: center;
                z-index: 100; backdrop-filter: blur(10px);
            }}
            .control-btn {{
                width: 44px; height: 44px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 50%; color: #fff;
                cursor: pointer; font-size: 1.2rem;
                transition: all 0.2s;
                display: flex; align-items: center; justify-content: center;
            }}
            .control-btn:hover, .control-btn:active {{
                background: rgba(0,255,200,0.2);
                border-color: #00ffc8;
                transform: scale(1.1);
            }}
            .control-btn.active {{
                background: rgba(0,255,200,0.3);
                border-color: #00ffc8;
                box-shadow: 0 0 15px rgba(0,255,200,0.3);
            }}
            .control-btn.danger:hover {{
                background: rgba(255,0,100,0.3);
                border-color: #ff0064;
            }}

            /* Event Notification */
            #event-notification {{
                position: absolute; top: 50%; left: 50%;
                transform: translate(-50%, -50%) scale(0);
                font-size: 2rem; color: #fff;
                text-shadow: 0 0 30px currentColor;
                pointer-events: none; z-index: 200;
                opacity: 0; transition: all 0.3s ease;
                text-align: center;
            }}
            #event-notification.show {{
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }}
            #event-notification .subtitle {{
                font-size: 0.8rem; color: #888;
                margin-top: 10px;
            }}

            /* Tooltip */
            #tooltip {{
                position: absolute; pointer-events: none;
                background: rgba(0,0,0,0.9);
                border: 1px solid rgba(0,255,200,0.3);
                padding: 10px 15px; border-radius: 10px;
                z-index: 300; display: none;
                font-size: 0.75rem;
            }}
            #tooltip .name {{ color: #00ffc8; font-weight: 700; }}
            #tooltip .value {{ color: #fff; margin-top: 3px; }}

            /* Instructions */
            #instructions {{
                position: absolute; bottom: 80px; right: 15px;
                color: #445; font-size: 0.55rem;
                text-align: right; line-height: 1.8;
            }}

            /* Mobile */
            @media (max-width: 768px) {{
                #main-panel {{ padding: 12px; min-width: 150px; }}
                #main-panel h2 {{ font-size: 0.65rem; }}
                #portfolio-value {{ font-size: 1rem; }}
                #species-panel {{ max-width: 180px; padding: 10px; right: 10px; }}
                .species-item {{ padding: 6px; }}
                #controls {{ padding: 10px 15px; gap: 10px; }}
                .control-btn {{ width: 40px; height: 40px; font-size: 1rem; }}
                #instructions {{ display: none; }}
            }}

            /* Underwater light rays */
            .light-ray {{
                position: fixed; top: 0;
                width: 2px; height: 100vh;
                background: linear-gradient(180deg, rgba(0,255,200,0.1) 0%, transparent 70%);
                pointer-events: none; z-index: 1;
                animation: rayFloat 10s ease-in-out infinite;
            }}
            @keyframes rayFloat {{
                0%, 100% {{ opacity: 0.3; transform: translateX(0) skewX(-5deg); }}
                50% {{ opacity: 0.6; transform: translateX(20px) skewX(5deg); }}
            }}
        </style>
    </head>
    <body>
        <!-- Light rays for underwater effect -->
        <div class="light-ray" style="left: 10%;"></div>
        <div class="light-ray" style="left: 30%; animation-delay: -3s;"></div>
        <div class="light-ray" style="left: 50%; animation-delay: -5s;"></div>
        <div class="light-ray" style="left: 70%; animation-delay: -7s;"></div>
        <div class="light-ray" style="left: 90%; animation-delay: -2s;"></div>

        <canvas id="bioCanvas"></canvas>

        <div id="main-panel">
            <h2>MARKET BIO-DOME</h2>
            <div id="portfolio-value">{total_val_fmt}</div>
            <div id="ecosystem-health"><div id="health-bar"></div></div>
            <div class="stat-row">
                <span>POPULATION: <span id="pop-count">0</span></span>
                <span>FOOD: <span id="food-count">0</span></span>
            </div>
        </div>

        <div id="species-panel">
            <h3>SPECIES CATALOG</h3>
            <div id="species-list"></div>
        </div>

        <div id="controls">
            <button class="control-btn" id="btn-feed" title="Feed (Drop food)">🍖</button>
            <button class="control-btn" id="btn-bull" title="Bull Market">📈</button>
            <button class="control-btn danger" id="btn-bear" title="Bear Market">📉</button>
            <button class="control-btn" id="btn-breed" title="Reproduction Boost">💕</button>
            <button class="control-btn danger" id="btn-crash" title="Market Crash!">💥</button>
        </div>

        <div id="instructions">
            TAP to drop food • HOLD to attract<br>
            Double-tap for market event
        </div>

        <div id="event-notification">
            <div class="title"></div>
            <div class="subtitle"></div>
        </div>

        <div id="tooltip">
            <div class="name"></div>
            <div class="value"></div>
        </div>

        <script>
            // === CANVAS SETUP ===
            const canvas = document.getElementById("bioCanvas");
            const ctx = canvas.getContext("2d");
            let width, height;

            function resize() {{
                width = window.innerWidth;
                height = window.innerHeight;
                canvas.width = width;
                canvas.height = height;
            }}
            window.addEventListener('resize', resize);
            resize();

            // === DATA ===
            const ecosystemData = {eco_json};
            const creatures = [];
            const food = [];
            const particles = [];
            let ecosystemHealth = 100;
            let highlightedSpecies = null;

            // === CREATURE CLASSES ===
            class Creature {{
                constructor(x, y, species, config) {{
                    this.x = x;
                    this.y = y;
                    this.species = species;
                    this.type = config.type;
                    this.color = config.color;
                    this.baseSize = config.size;
                    this.size = config.size;
                    this.speed = config.speed;
                    this.value = config.value;
                    this.pct = config.pct;

                    this.vx = (Math.random() - 0.5) * this.speed;
                    this.vy = (Math.random() - 0.5) * this.speed;
                    this.energy = 50 + Math.random() * 50;
                    this.maxEnergy = 100;
                    this.age = 0;
                    this.phase = Math.random() * Math.PI * 2;
                    this.targetX = null;
                    this.targetY = null;

                    // Type-specific properties
                    this.tentacles = this.type === 'jellyfish' ? 6 : 0;
                    this.wingPhase = 0;
                    this.tailPhase = 0;
                    this.glowIntensity = 0.5;
                }}

                update(dt) {{
                    this.age += dt;
                    this.phase += 0.05;
                    this.wingPhase += 0.15;
                    this.tailPhase += 0.1;

                    // Energy decay
                    this.energy -= 0.02 * dt;
                    if (this.energy < 0) this.energy = 0;

                    // Size based on energy
                    this.size = this.baseSize * (0.7 + (this.energy / this.maxEnergy) * 0.5);

                    // Seek food if hungry
                    if (this.energy < 50 && food.length > 0) {{
                        let nearestFood = null;
                        let nearestDist = Infinity;
                        food.forEach(f => {{
                            const dist = Math.hypot(f.x - this.x, f.y - this.y);
                            if (dist < nearestDist) {{
                                nearestDist = dist;
                                nearestFood = f;
                            }}
                        }});
                        if (nearestFood && nearestDist < 200) {{
                            this.targetX = nearestFood.x;
                            this.targetY = nearestFood.y;
                        }}
                    }}

                    // Movement based on type
                    this.move(dt);

                    // Boundary check
                    if (this.x < this.size) {{ this.x = this.size; this.vx *= -0.5; }}
                    if (this.x > width - this.size) {{ this.x = width - this.size; this.vx *= -0.5; }}
                    if (this.y < this.size) {{ this.y = this.size; this.vy *= -0.5; }}
                    if (this.y > height - this.size) {{ this.y = height - this.size; this.vy *= -0.5; }}

                    // Eat food
                    for (let i = food.length - 1; i >= 0; i--) {{
                        const f = food[i];
                        const dist = Math.hypot(f.x - this.x, f.y - this.y);
                        if (dist < this.size + f.size) {{
                            this.energy = Math.min(this.maxEnergy, this.energy + f.energy);
                            food.splice(i, 1);

                            // Particle effect
                            for (let j = 0; j < 5; j++) {{
                                particles.push(new Particle(f.x, f.y, this.color, 'sparkle'));
                            }}
                        }}
                    }}
                }}

                move(dt) {{
                    const baseSpeed = this.speed * (0.5 + (this.energy / this.maxEnergy) * 0.5);

                    // Go to target if exists
                    if (this.targetX !== null) {{
                        const dx = this.targetX - this.x;
                        const dy = this.targetY - this.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist > 5) {{
                            this.vx += (dx / dist) * 0.1 * baseSpeed;
                            this.vy += (dy / dist) * 0.1 * baseSpeed;
                        }} else {{
                            this.targetX = null;
                            this.targetY = null;
                        }}
                    }}

                    // Type-specific movement
                    switch(this.type) {{
                        case 'jellyfish':
                            this.vy += Math.sin(this.phase) * 0.02;
                            this.vx += Math.cos(this.phase * 0.5) * 0.01;
                            break;
                        case 'fish':
                        case 'turtle':
                            // School behavior
                            creatures.filter(c => c.species === this.species && c !== this).slice(0, 5).forEach(other => {{
                                const dist = Math.hypot(other.x - this.x, other.y - this.y);
                                if (dist < 100 && dist > 0) {{
                                    // Align
                                    this.vx += other.vx * 0.01;
                                    this.vy += other.vy * 0.01;
                                    // Cohesion
                                    this.vx += (other.x - this.x) * 0.0005;
                                    this.vy += (other.y - this.y) * 0.0005;
                                }}
                                if (dist < 30 && dist > 0) {{
                                    // Separation
                                    this.vx -= (other.x - this.x) * 0.01;
                                    this.vy -= (other.y - this.y) * 0.01;
                                }}
                            }});
                            break;
                        case 'butterfly':
                        case 'bird':
                            this.vx += (Math.random() - 0.5) * 0.3;
                            this.vy += (Math.random() - 0.5) * 0.3;
                            this.vy += Math.sin(this.phase * 2) * 0.05;
                            break;
                        case 'bee':
                            this.vx += (Math.random() - 0.5) * 0.5;
                            this.vy += (Math.random() - 0.5) * 0.5;
                            break;
                        case 'firefly':
                            this.glowIntensity = 0.5 + Math.sin(this.phase * 3) * 0.5;
                            this.vx += (Math.random() - 0.5) * 0.1;
                            this.vy += (Math.random() - 0.5) * 0.1;
                            break;
                        case 'coral':
                            this.vx *= 0.9;
                            this.vy *= 0.9;
                            break;
                        case 'bubble':
                            this.vy -= 0.05;
                            this.vx += Math.sin(this.phase) * 0.02;
                            if (this.y < 50) this.y = height - 50;
                            break;
                    }}

                    // Random wandering
                    if (Math.random() < 0.02) {{
                        this.vx += (Math.random() - 0.5) * baseSpeed * 0.5;
                        this.vy += (Math.random() - 0.5) * baseSpeed * 0.5;
                    }}

                    // Friction
                    this.vx *= 0.98;
                    this.vy *= 0.98;

                    // Speed limit
                    const speed = Math.hypot(this.vx, this.vy);
                    const maxSpeed = baseSpeed * 2;
                    if (speed > maxSpeed) {{
                        this.vx = (this.vx / speed) * maxSpeed;
                        this.vy = (this.vy / speed) * maxSpeed;
                    }}

                    // Apply velocity
                    this.x += this.vx * dt;
                    this.y += this.vy * dt;
                }}

                draw() {{
                    const isHighlighted = highlightedSpecies === this.species;
                    const alpha = isHighlighted ? 1 : (highlightedSpecies ? 0.3 : 1);

                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.translate(this.x, this.y);

                    // Glow
                    const glowSize = this.size * (this.type === 'firefly' ? (1 + this.glowIntensity) : 1.5);
                    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
                    gradient.addColorStop(0, this.color + '60');
                    gradient.addColorStop(1, 'transparent');
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw based on type
                    switch(this.type) {{
                        case 'jellyfish':
                            this.drawJellyfish();
                            break;
                        case 'fish':
                            this.drawFish();
                            break;
                        case 'butterfly':
                        case 'bird':
                            this.drawButterfly();
                            break;
                        case 'bee':
                            this.drawBee();
                            break;
                        case 'coral':
                            this.drawCoral();
                            break;
                        case 'turtle':
                            this.drawTurtle();
                            break;
                        case 'firefly':
                            this.drawFirefly();
                            break;
                        case 'bubble':
                            this.drawBubble();
                            break;
                        default:
                            this.drawDefault();
                    }}

                    ctx.restore();
                }}

                drawJellyfish() {{
                    // Bell
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, this.size, this.size * 0.7, 0, Math.PI, 0);
                    ctx.fill();

                    // Inner
                    ctx.fillStyle = this.color + '40';
                    ctx.beginPath();
                    ctx.ellipse(0, -this.size * 0.1, this.size * 0.6, this.size * 0.4, 0, Math.PI, 0);
                    ctx.fill();

                    // Tentacles
                    ctx.strokeStyle = this.color + '80';
                    ctx.lineWidth = 2;
                    for (let i = 0; i < this.tentacles; i++) {{
                        const angle = (i / this.tentacles) * Math.PI - Math.PI / 2;
                        const baseX = Math.cos(angle) * this.size * 0.8;
                        ctx.beginPath();
                        ctx.moveTo(baseX, 0);
                        for (let j = 0; j < 4; j++) {{
                            const y = j * this.size * 0.4;
                            const x = baseX + Math.sin(this.phase + i + j * 0.5) * 5;
                            ctx.lineTo(x, y);
                        }}
                        ctx.stroke();
                    }}
                }}

                drawFish() {{
                    const angle = Math.atan2(this.vy, this.vx);
                    ctx.rotate(angle);

                    // Body
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, this.size, this.size * 0.5, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Tail
                    const tailWag = Math.sin(this.tailPhase) * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(-this.size, 0);
                    ctx.lineTo(-this.size * 1.5, -this.size * 0.5 + tailWag * this.size);
                    ctx.lineTo(-this.size * 1.5, this.size * 0.5 + tailWag * this.size);
                    ctx.closePath();
                    ctx.fill();

                    // Eye
                    ctx.fillStyle = '#fff';
                    ctx.beginPath();
                    ctx.arc(this.size * 0.4, -this.size * 0.1, this.size * 0.15, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.beginPath();
                    ctx.arc(this.size * 0.45, -this.size * 0.1, this.size * 0.08, 0, Math.PI * 2);
                    ctx.fill();
                }}

                drawButterfly() {{
                    const wingFlap = Math.sin(this.wingPhase) * 0.4 + 0.6;

                    // Wings
                    ctx.fillStyle = this.color + 'cc';
                    ctx.beginPath();
                    ctx.ellipse(-this.size * 0.3, 0, this.size * wingFlap, this.size * 0.8, -0.3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(this.size * 0.3, 0, this.size * wingFlap, this.size * 0.8, 0.3, 0, Math.PI * 2);
                    ctx.fill();

                    // Body
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, this.size * 0.15, this.size * 0.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                }}

                drawBee() {{
                    // Body stripes
                    ctx.fillStyle = '#000';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, this.size, this.size * 0.6, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = this.color;
                    for (let i = 0; i < 3; i++) {{
                        ctx.beginPath();
                        ctx.ellipse(-this.size * 0.5 + i * this.size * 0.4, 0, this.size * 0.15, this.size * 0.55, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }}

                    // Wings
                    const wingFlap = Math.sin(this.wingPhase * 3) * 0.3 + 0.7;
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.beginPath();
                    ctx.ellipse(0, -this.size * 0.5, this.size * 0.5 * wingFlap, this.size * 0.3, -0.5, 0, Math.PI * 2);
                    ctx.fill();
                }}

                drawCoral() {{
                    const branches = 5;
                    ctx.fillStyle = this.color;
                    for (let i = 0; i < branches; i++) {{
                        const angle = (i / branches) * Math.PI - Math.PI / 2;
                        const len = this.size * (0.8 + Math.sin(this.phase + i) * 0.2);
                        ctx.beginPath();
                        ctx.moveTo(0, this.size * 0.3);
                        ctx.quadraticCurveTo(
                            Math.cos(angle) * len * 0.5,
                            -len * 0.5,
                            Math.cos(angle) * len,
                            -len
                        );
                        ctx.lineWidth = this.size * 0.3;
                        ctx.strokeStyle = this.color;
                        ctx.lineCap = 'round';
                        ctx.stroke();
                    }}
                }}

                drawTurtle() {{
                    const angle = Math.atan2(this.vy, this.vx);
                    ctx.rotate(angle);

                    // Shell
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, this.size, this.size * 0.8, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Pattern
                    ctx.strokeStyle = this.color + '60';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, this.size * 0.5, 0, Math.PI * 2);
                    ctx.stroke();

                    // Head
                    ctx.fillStyle = this.color + 'cc';
                    ctx.beginPath();
                    ctx.ellipse(this.size * 0.9, 0, this.size * 0.3, this.size * 0.25, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Flippers
                    const flipperPhase = Math.sin(this.tailPhase) * 0.3;
                    ctx.beginPath();
                    ctx.ellipse(this.size * 0.3, -this.size * 0.7, this.size * 0.4, this.size * 0.2, -0.5 + flipperPhase, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(this.size * 0.3, this.size * 0.7, this.size * 0.4, this.size * 0.2, 0.5 - flipperPhase, 0, Math.PI * 2);
                    ctx.fill();
                }}

                drawFirefly() {{
                    // Body
                    ctx.fillStyle = '#333';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, this.size * 0.5, this.size * 0.3, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Glow
                    ctx.fillStyle = this.color;
                    ctx.shadowColor = this.color;
                    ctx.shadowBlur = 20 * this.glowIntensity;
                    ctx.beginPath();
                    ctx.arc(this.size * 0.2, 0, this.size * 0.25 * this.glowIntensity, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }}

                drawBubble() {{
                    ctx.strokeStyle = this.color + '60';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                    ctx.stroke();

                    // Highlight
                    ctx.fillStyle = this.color + '40';
                    ctx.beginPath();
                    ctx.arc(-this.size * 0.3, -this.size * 0.3, this.size * 0.3, 0, Math.PI * 2);
                    ctx.fill();
                }}

                drawDefault() {{
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                    ctx.fill();
                }}
            }}

            // Food class
            class Food {{
                constructor(x, y) {{
                    this.x = x;
                    this.y = y;
                    this.size = 5 + Math.random() * 5;
                    this.energy = 20 + Math.random() * 20;
                    this.color = '#44ff88';
                    this.phase = Math.random() * Math.PI * 2;
                    this.vy = 0.5 + Math.random() * 0.5;
                }}

                update(dt) {{
                    this.phase += 0.1;
                    this.y += this.vy * dt;
                    this.x += Math.sin(this.phase) * 0.3;

                    // Remove if off screen
                    return this.y < height + 50;
                }}

                draw() {{
                    ctx.fillStyle = this.color;
                    ctx.shadowColor = this.color;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size * (1 + Math.sin(this.phase) * 0.2), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }}
            }}

            // Particle class
            class Particle {{
                constructor(x, y, color, type) {{
                    this.x = x;
                    this.y = y;
                    this.color = color;
                    this.type = type;
                    this.size = 3 + Math.random() * 5;
                    this.vx = (Math.random() - 0.5) * 5;
                    this.vy = (Math.random() - 0.5) * 5;
                    this.life = 1;
                    this.decay = 0.02 + Math.random() * 0.02;
                }}

                update(dt) {{
                    this.x += this.vx * dt;
                    this.y += this.vy * dt;
                    this.life -= this.decay * dt;
                    this.vx *= 0.98;
                    this.vy *= 0.98;
                    return this.life > 0;
                }}

                draw() {{
                    ctx.globalAlpha = this.life;
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }}
            }}

            // === INIT ===
            function init() {{
                creatures.length = 0;
                ecosystemData.forEach(data => {{
                    for (let i = 0; i < data.count; i++) {{
                        const x = Math.random() * (width - 100) + 50;
                        const y = Math.random() * (height - 100) + 50;
                        creatures.push(new Creature(x, y, data.species, data));
                    }}
                }});

                // Build species list UI
                const listEl = document.getElementById('species-list');
                listEl.innerHTML = '';
                ecosystemData.forEach(data => {{
                    const item = document.createElement('div');
                    item.className = 'species-item';
                    item.dataset.species = data.species;
                    item.innerHTML = `
                        <span class="species-icon">${{data.icon}}</span>
                        <div class="species-info">
                            <div class="species-name">${{data.species}}</div>
                            <div class="species-stats">${{data.pct.toFixed(1)}}% | R$ ${{(data.value/1000).toFixed(0)}}k</div>
                        </div>
                        <span class="species-count" style="color: ${{data.color}}">${{data.count}}</span>
                    `;
                    item.onclick = () => {{
                        if (highlightedSpecies === data.species) {{
                            highlightedSpecies = null;
                            item.classList.remove('highlighted');
                        }} else {{
                            document.querySelectorAll('.species-item').forEach(el => el.classList.remove('highlighted'));
                            highlightedSpecies = data.species;
                            item.classList.add('highlighted');
                        }}
                    }};
                    listEl.appendChild(item);
                }});
            }}

            // === EVENTS ===
            function showNotification(title, subtitle, color) {{
                const notif = document.getElementById('event-notification');
                notif.querySelector('.title').textContent = title;
                notif.querySelector('.title').style.color = color || '#fff';
                notif.querySelector('.subtitle').textContent = subtitle;
                notif.classList.add('show');
                setTimeout(() => notif.classList.remove('show'), 2000);
            }}

            function triggerBullMarket() {{
                showNotification('📈 BULL MARKET', 'Energy boost for all!', '#00ff41');
                creatures.forEach(c => {{
                    c.energy = Math.min(c.maxEnergy, c.energy + 30);
                    c.vx *= 1.5;
                    c.vy *= 1.5;
                    for (let i = 0; i < 3; i++) {{
                        particles.push(new Particle(c.x, c.y, '#00ff41', 'sparkle'));
                    }}
                }});
            }}

            function triggerBearMarket() {{
                showNotification('📉 BEAR MARKET', 'Everyone slows down...', '#ff4444');
                creatures.forEach(c => {{
                    c.energy = Math.max(10, c.energy - 20);
                    c.vx *= 0.3;
                    c.vy *= 0.3;
                }});
            }}

            function triggerBreedingBoost() {{
                showNotification('💕 REPRODUCTION', 'Population growth!', '#ff88cc');
                const newCreatures = [];
                ecosystemData.forEach(data => {{
                    const species = creatures.filter(c => c.species === data.species);
                    if (species.length > 0 && species.length < 30) {{
                        const parent = species[Math.floor(Math.random() * species.length)];
                        const child = new Creature(
                            parent.x + (Math.random() - 0.5) * 50,
                            parent.y + (Math.random() - 0.5) * 50,
                            data.species, data
                        );
                        child.size = data.size * 0.5;
                        newCreatures.push(child);

                        for (let i = 0; i < 5; i++) {{
                            particles.push(new Particle(parent.x, parent.y, '#ff88cc', 'heart'));
                        }}
                    }}
                }});
                creatures.push(...newCreatures);
            }}

            function triggerMarketCrash() {{
                showNotification('💥 MARKET CRASH', 'Chaos ensues!', '#ff0044');
                creatures.forEach(c => {{
                    c.vx = (Math.random() - 0.5) * 20;
                    c.vy = (Math.random() - 0.5) * 20;
                    c.energy = Math.max(5, c.energy - 40);
                }});

                // Remove some creatures
                const toRemove = Math.floor(creatures.length * 0.2);
                for (let i = 0; i < toRemove; i++) {{
                    if (creatures.length > 5) {{
                        const idx = Math.floor(Math.random() * creatures.length);
                        const c = creatures[idx];
                        for (let j = 0; j < 10; j++) {{
                            particles.push(new Particle(c.x, c.y, c.color, 'explode'));
                        }}
                        creatures.splice(idx, 1);
                    }}
                }}
            }}

            function dropFood(x, y, amount = 5) {{
                for (let i = 0; i < amount; i++) {{
                    food.push(new Food(
                        x + (Math.random() - 0.5) * 50,
                        y + (Math.random() - 0.5) * 50
                    ));
                }}
            }}

            // === CONTROLS ===
            document.getElementById('btn-feed').onclick = () => dropFood(width / 2, 50, 10);
            document.getElementById('btn-bull').onclick = triggerBullMarket;
            document.getElementById('btn-bear').onclick = triggerBearMarket;
            document.getElementById('btn-breed').onclick = triggerBreedingBoost;
            document.getElementById('btn-crash').onclick = triggerMarketCrash;

            // Mouse/Touch interaction
            let isHolding = false;
            let holdPos = {{ x: 0, y: 0 }};
            let lastTap = 0;

            function handleStart(x, y) {{
                const now = Date.now();
                if (now - lastTap < 300) {{
                    // Double tap - market event
                    if (Math.random() < 0.5) triggerBullMarket();
                    else triggerBearMarket();
                }} else {{
                    dropFood(x, y, 3);
                }}
                lastTap = now;

                isHolding = true;
                holdPos = {{ x, y }};
            }}

            function handleMove(x, y) {{
                if (isHolding) {{
                    holdPos = {{ x, y }};
                    // Attract nearby creatures
                    creatures.forEach(c => {{
                        const dx = x - c.x;
                        const dy = y - c.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist < 200 && dist > 0) {{
                            const force = (200 - dist) / 200 * 0.3;
                            c.vx += (dx / dist) * force;
                            c.vy += (dy / dist) * force;
                        }}
                    }});
                }}
            }}

            function handleEnd() {{
                isHolding = false;
            }}

            canvas.addEventListener('mousedown', e => handleStart(e.clientX, e.clientY));
            canvas.addEventListener('mousemove', e => handleMove(e.clientX, e.clientY));
            canvas.addEventListener('mouseup', handleEnd);
            canvas.addEventListener('touchstart', e => {{
                e.preventDefault();
                handleStart(e.touches[0].clientX, e.touches[0].clientY);
            }});
            canvas.addEventListener('touchmove', e => {{
                e.preventDefault();
                handleMove(e.touches[0].clientX, e.touches[0].clientY);
            }});
            canvas.addEventListener('touchend', handleEnd);

            // === ANIMATION ===
            let lastTime = performance.now();

            function animate() {{
                requestAnimationFrame(animate);

                const now = performance.now();
                const dt = Math.min((now - lastTime) / 16.67, 3); // Cap delta time
                lastTime = now;

                // Background with gradient
                const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
                bgGradient.addColorStop(0, 'rgba(0, 5, 15, 0.15)');
                bgGradient.addColorStop(1, 'rgba(0, 10, 25, 0.15)');
                ctx.fillStyle = bgGradient;
                ctx.fillRect(0, 0, width, height);

                // Draw attraction point
                if (isHolding) {{
                    const gradient = ctx.createRadialGradient(holdPos.x, holdPos.y, 0, holdPos.x, holdPos.y, 150);
                    gradient.addColorStop(0, 'rgba(0, 255, 200, 0.2)');
                    gradient.addColorStop(1, 'transparent');
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(holdPos.x, holdPos.y, 150, 0, Math.PI * 2);
                    ctx.fill();
                }}

                // Update and draw food
                for (let i = food.length - 1; i >= 0; i--) {{
                    if (!food[i].update(dt)) {{
                        food.splice(i, 1);
                    }} else {{
                        food[i].draw();
                    }}
                }}

                // Update and draw creatures
                creatures.forEach(c => {{
                    c.update(dt);
                    c.draw();
                }});

                // Update and draw particles
                for (let i = particles.length - 1; i >= 0; i--) {{
                    if (!particles[i].update(dt)) {{
                        particles.splice(i, 1);
                    }} else {{
                        particles[i].draw();
                    }}
                }}

                // Draw connections between same species
                ctx.strokeStyle = 'rgba(0, 255, 200, 0.03)';
                ctx.lineWidth = 1;
                for (let i = 0; i < creatures.length; i++) {{
                    for (let j = i + 1; j < creatures.length; j++) {{
                        if (creatures[i].species === creatures[j].species) {{
                            const dist = Math.hypot(creatures[i].x - creatures[j].x, creatures[i].y - creatures[j].y);
                            if (dist < 80) {{
                                ctx.globalAlpha = (80 - dist) / 80 * 0.3;
                                ctx.beginPath();
                                ctx.moveTo(creatures[i].x, creatures[i].y);
                                ctx.lineTo(creatures[j].x, creatures[j].y);
                                ctx.stroke();
                            }}
                        }}
                    }}
                }}
                ctx.globalAlpha = 1;

                // Update UI
                document.getElementById('pop-count').textContent = creatures.length;
                document.getElementById('food-count').textContent = food.length;

                // Update ecosystem health
                const avgEnergy = creatures.reduce((sum, c) => sum + c.energy, 0) / creatures.length || 0;
                ecosystemHealth = avgEnergy;
                document.getElementById('health-bar').style.width = ecosystemHealth + '%';

                // Update species counts
                ecosystemData.forEach(data => {{
                    const count = creatures.filter(c => c.species === data.species).length;
                    const el = document.querySelector(`.species-item[data-species="${{data.species}}"] .species-count`);
                    if (el) el.textContent = count;
                }});
            }}

            // Start
            init();
            animate();

            // Periodic food drop
            setInterval(() => {{
                if (food.length < 20) {{
                    dropFood(Math.random() * width, -10, 2);
                }}
            }}, 3000);
        </script>
    </body>
    </html>
    """
    components.html(bio_html, height=780)

# --- SOLAR SYSTEM LOGIC (EGG #3) ---
def render_solar_system():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_solar_back"):
            return_to_hub()
            st.rerun()

    with st.spinner("Calibrando sensores gravitacionais..."):
        df_portfolio = get_portfolio_data()

    solar_data = []
    total_market_val = 0

    if not df_portfolio.empty:
        grouped = df_portfolio.groupby('Class')['Value'].sum().reset_index()
        total_market_val = grouped['Value'].sum()
        grouped = grouped.sort_values('Value', ascending=False).reset_index(drop=True)

        color_map = {
            'Renda Fixa': 0x00ff41,
            'Tesouro': 0x10b981,
            'CDBs': 0x0ea5e9,
            'Ações': 0xff00de,
            'Ações intl': 0xff4400,
            'FIIs': 0x00efff,
            'Cripto': 0xffcc00,
            'ETFs': 0x8b5cf6,
            'Caixa': 0xffffff,
            'Commodities': 0x84cc16,
        }

        import math
        for i, row in grouped.iterrows():
            classe = row['Class']
            val = row['Value']
            if total_market_val > 0:
                pct = val / total_market_val
                size = 0.6 + math.sqrt(pct) * 2.5
                distance = 12 + i * 6.0
                speed = 0.003 + 0.015 * (1.0 - pct)

                moons = []
                class_df = df_portfolio[df_portfolio['Class'] == classe].copy()
                class_df = class_df.sort_values('Value', ascending=False).head(5)
                name_col = next(
                    (c for c in ['Ticker', 'ticker', 'Asset', 'Name', 'name', 'Ativo']
                     if c in class_df.columns), None
                )
                for _, arow in class_df.iterrows():
                    if arow['Value'] > 0 and val > 0:
                        mn = str(arow[name_col])[:10] if name_col else 'Ativo'
                        mn = mn.replace('.SA', '').replace('-USD', '')
                        moons.append({'name': mn, 'value': float(arow['Value']), 'pct': float(arow['Value'] / val * 100)})

                solar_data.append({
                    'name': classe,
                    'color': color_map.get(classe, 0x888888),
                    'size': float(size),
                    'distance': float(distance),
                    'speed': float(speed),
                    'value': float(val),
                    'pct': float(pct * 100),
                    'moons': moons,
                })

    solar_json = json.dumps(solar_data)
    total_val_fmt = f"R$ {total_market_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    solar_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
        <style>
            * {{ margin:0; padding:0; box-sizing:border-box; }}
            body {{ overflow:hidden; background:#000; font-family:'Orbitron',sans-serif; touch-action:none; }}

            #info-panel {{
                position:absolute; top:15px; left:15px;
                background:linear-gradient(135deg,rgba(0,0,0,0.92) 0%,rgba(15,10,40,0.92) 100%);
                padding:18px 22px; border-radius:14px;
                border:1px solid rgba(255,204,0,0.25);
                box-shadow:0 0 30px rgba(255,204,0,0.08),inset 0 0 20px rgba(0,0,0,0.5);
                z-index:100; min-width:210px; backdrop-filter:blur(12px);
            }}
            #info-panel h2 {{ color:#ffcc00; margin:0 0 6px 0; font-size:0.75rem; text-transform:uppercase; letter-spacing:3px; text-shadow:0 0 10px rgba(255,204,0,0.5); }}
            #total-value {{ font-size:1.35rem; color:#fff; font-weight:700; text-shadow:0 0 15px rgba(255,255,255,0.3); }}
            #info-panel .subtitle {{ font-size:0.6rem; color:#555; margin-top:4px; letter-spacing:1px; }}
            #obj-counter {{ font-size:0.62rem; color:#446; margin-top:10px; line-height:1.8; }}
            #obj-counter span {{ color:#aac; }}

            #planet-detail {{
                position:absolute; top:15px; right:15px;
                background:linear-gradient(135deg,rgba(0,0,0,0.95) 0%,rgba(5,20,15,0.95) 100%);
                padding:18px 20px; border-radius:14px;
                border:1px solid rgba(0,255,65,0.25);
                box-shadow:0 0 30px rgba(0,255,65,0.08);
                z-index:100; min-width:240px; display:none; backdrop-filter:blur(12px);
            }}
            #planet-detail.visible {{ display:block; animation:slideIn 0.3s ease; }}
            @keyframes slideIn {{ from {{ opacity:0; transform:translateX(20px); }} to {{ opacity:1; transform:translateX(0); }} }}
            #planet-detail h3 {{ margin:0 0 12px 0; font-size:1.1rem; text-transform:uppercase; letter-spacing:2px; }}
            .detail-row {{ display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.07); }}
            .detail-label {{ color:#666; font-size:0.65rem; }}
            .detail-value {{ color:#fff; font-size:0.82rem; font-weight:700; }}
            .pct-bar {{ height:5px; background:rgba(255,255,255,0.1); border-radius:3px; margin-top:10px; overflow:hidden; }}
            .pct-fill {{ height:100%; border-radius:3px; transition:width 0.5s ease; }}
            .moon-list {{ margin-top:12px; }}
            .moon-list-title {{ font-size:0.52rem; color:#444; letter-spacing:2px; text-transform:uppercase; margin-bottom:7px; }}
            .moon-item {{ display:flex; align-items:center; gap:7px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.04); }}
            .moon-dot {{ width:7px; height:7px; border-radius:50%; flex-shrink:0; opacity:0.8; }}
            .moon-name {{ color:#999; font-size:0.68rem; flex:1; }}
            .moon-val {{ color:#fff; font-size:0.68rem; font-variant-numeric:tabular-nums; }}
            .moon-pct {{ font-size:0.58rem; color:#444; width:34px; text-align:right; }}

            #controls {{
                position:absolute; bottom:14px; left:50%; transform:translateX(-50%);
                background:rgba(0,0,0,0.82); padding:10px 20px; border-radius:24px;
                border:1px solid rgba(255,255,255,0.08);
                display:flex; gap:16px; align-items:center; z-index:100; backdrop-filter:blur(12px);
                flex-wrap:wrap; justify-content:center;
            }}
            .ctrl-group {{ display:flex; align-items:center; gap:6px; }}
            .ctrl-label {{ font-size:0.55rem; color:#555; text-transform:uppercase; letter-spacing:1px; }}
            .ctrl-btn {{
                width:34px; height:34px;
                background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.15);
                border-radius:50%; color:#ccc; cursor:pointer; font-size:0.95rem;
                transition:all 0.2s; display:flex; align-items:center; justify-content:center;
            }}
            .ctrl-btn:hover {{ background:rgba(255,255,255,0.12); color:#fff; }}
            .ctrl-btn.active {{ background:rgba(0,255,65,0.15); border-color:#00ff41; color:#00ff41; }}
            .ctrl-btn.bh-btn.active {{ background:rgba(200,100,255,0.15); border-color:#c864ff; color:#c864ff; }}
            .ctrl-btn.gal-btn {{ border-color:rgba(100,180,255,0.3); }}
            .ctrl-btn.gal-btn.active {{ background:rgba(100,180,255,0.15); border-color:#64b4ff; color:#64b4ff; }}
            #speed-slider {{
                width:75px; height:3px; -webkit-appearance:none;
                background:rgba(255,255,255,0.18); border-radius:2px; outline:none;
            }}
            #speed-slider::-webkit-slider-thumb {{
                -webkit-appearance:none; width:13px; height:13px;
                background:#ffcc00; border-radius:50%; cursor:pointer;
                box-shadow:0 0 8px rgba(255,204,0,0.5);
            }}

            #legend {{
                position:absolute; bottom:74px; left:14px;
                background:rgba(0,0,0,0.72); padding:12px 14px; border-radius:10px;
                border:1px solid rgba(255,255,255,0.07); z-index:100;
                max-height:220px; overflow-y:auto; font-size:0.68rem;
            }}
            .legend-item {{ display:flex; align-items:center; gap:7px; padding:3px 0; cursor:pointer; transition:transform 0.2s; }}
            .legend-item:hover {{ transform:translateX(4px); }}
            .legend-color {{ width:10px; height:10px; border-radius:50%; box-shadow:0 0 6px currentColor; }}
            .legend-name {{ color:#bbb; }}

            #planet-label {{
                position:absolute; pointer-events:none;
                transform:translate(-50%,-120%); z-index:200; display:none; text-align:center;
            }}
            #planet-label .name {{ font-size:0.95rem; font-weight:700; text-shadow:0 0 10px currentColor; }}
            #planet-label .value {{ font-size:0.75rem; color:#fff; background:rgba(0,0,0,0.7); padding:3px 9px; border-radius:9px; margin-top:4px; }}

            #cinematic-title {{
                position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
                text-align:center; pointer-events:none; opacity:0; transition:opacity 0.8s ease; z-index:50;
            }}
            #cinematic-title.visible {{ opacity:1; }}
            #cinematic-title .cine-name {{ font-size:2.4rem; font-weight:900; letter-spacing:4px; text-shadow:0 0 30px currentColor; }}
            #cinematic-title .cine-val {{ font-size:0.95rem; color:#fff; opacity:0.7; margin-top:7px; letter-spacing:2px; }}
            #cinematic-title .cine-pct {{ font-size:0.72rem; margin-top:4px; opacity:0.5; letter-spacing:3px; }}

            #warp-overlay {{
                position:absolute; inset:0;
                background:radial-gradient(ellipse at center,rgba(200,220,255,0.12) 0%,transparent 70%);
                pointer-events:none; opacity:1; transition:opacity 2s ease; z-index:30;
            }}
            #warp-overlay.hidden {{ opacity:0; }}

            #kbd-hints {{
                position:absolute; bottom:74px; right:14px;
                color:#1e1e2e; font-size:0.55rem; text-align:right; line-height:2;
            }}
            .kbd {{ display:inline-block; padding:1px 5px; border:1px solid #1e1e2e; border-radius:3px; font-size:0.52rem; margin:0 2px; }}

            #bh-alert {{
                position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
                color:#c864ff; font-size:1.2rem; font-weight:700; letter-spacing:3px;
                text-shadow:0 0 20px #c864ff; pointer-events:none;
                opacity:0; transition:opacity 0.5s;
            }}
            #bh-alert.show {{ opacity:1; }}

            @media(max-width:768px) {{
                #info-panel {{ padding:10px; min-width:150px; }}
                #planet-detail {{ right:8px; min-width:185px; padding:12px; }}
                #legend, #kbd-hints {{ display:none; }}
            }}
        </style>
    </head>
    <body>
        <div id="info-panel">
            <h2>◈ MEUS INVESTIMENTOS</h2>
            <div id="total-value">{total_val_fmt}</div>
            <div class="subtitle">PORTFÓLIO TOTAL · SISTEMA SOLAR</div>
            <div id="obj-counter"></div>
        </div>

        <div id="warp-overlay"></div>

        <div id="cinematic-title">
            <div class="cine-name" id="cine-name-text">PLANETA</div>
            <div class="cine-val" id="cine-val-text">R$ 0,00</div>
            <div class="cine-pct" id="cine-pct-text">0.0% DO PORTFÓLIO</div>
        </div>

        <div id="bh-alert">⬤ BURACO NEGRO DETECTADO</div>

        <div id="planet-detail">
            <h3 id="detail-name">Planeta</h3>
            <div class="detail-row"><span class="detail-label">VALOR</span><span class="detail-value" id="detail-value">R$ 0,00</span></div>
            <div class="detail-row"><span class="detail-label">ALOCAÇÃO</span><span class="detail-value" id="detail-pct">0%</span></div>
            <div class="detail-row"><span class="detail-label">RANKING</span><span class="detail-value" id="detail-rank">#1</span></div>
            <div class="pct-bar"><div class="pct-fill" id="detail-bar"></div></div>
            <div class="moon-list" id="moon-list"></div>
        </div>

        <div id="legend"></div>

        <div id="controls">
            <div class="ctrl-group">
                <span class="ctrl-label">ZOOM</span>
                <button class="ctrl-btn" id="zoom-in">+</button>
                <button class="ctrl-btn" id="zoom-out">−</button>
            </div>
            <div class="ctrl-group">
                <span class="ctrl-label">TEMPO</span>
                <input type="range" id="speed-slider" min="0" max="200" value="100">
            </div>
            <div class="ctrl-group">
                <button class="ctrl-btn active" id="auto-rotate" title="Auto Rotação">↻</button>
                <button class="ctrl-btn" id="top-view" title="Vista Topo">⊙</button>
                <button class="ctrl-btn cine" id="cinematic" title="Modo Cinemático">🎬</button>
            </div>
            <div class="ctrl-group">
                <button class="ctrl-btn bh-btn" id="bh-view" title="Ir ao Buraco Negro">⬤</button>
                <button class="ctrl-btn gal-btn" id="gal-view" title="Vista Galáxia">🌌</button>
                <button class="ctrl-btn" id="comet-trail" title="Cometas">☄</button>
            </div>
        </div>

        <div id="kbd-hints">
            <span class="kbd">←</span><span class="kbd">→</span> navegar
            &nbsp;<span class="kbd">G</span> galáxia
            &nbsp;<span class="kbd">B</span> buraco negro
            &nbsp;<span class="kbd">C</span> cinemático
            &nbsp;<span class="kbd">Esc</span> soltar
        </div>

        <div id="planet-label">
            <div class="name"></div>
            <div class="value"></div>
        </div>

        <script>
        // ════════════════════════════════════════════════════════
        //  MEUS INVESTIMENTOS — GALAXY RENDERER  (Three.js r128)
        // ════════════════════════════════════════════════════════

        // ── Scene setup ──────────────────────────────────────────
        const scene    = new THREE.Scene();
        const camera   = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.05, 8000);
        const renderer = new THREE.WebGLRenderer({{ antialias:true, alpha:true }});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        document.body.appendChild(renderer.domElement);

        // ── State ─────────────────────────────────────────────────
        let timeScale        = 1;
        let autoRotate       = true;
        let selectedPlanet   = null;
        let cameraAngle      = 0;
        let cameraHeight     = 45;
        let cameraDistance   = 95;
        let targetAngle      = 0;
        let targetHeight     = 45;
        let targetDist       = 95;
        let isDragging       = false;
        let prevMouse        = {{ x:0, y:0 }};
        let cinematicMode    = false;
        let cineIndex        = 0;
        let cineTimer        = 0;
        let galaxyView       = false;
        let bhView           = false;
        let time             = 0;
        let cometsVisible    = true;

        // ── Lighting ──────────────────────────────────────────────
        scene.add(new THREE.AmbientLight(0x111133, 0.6));
        const sunLight = new THREE.PointLight(0xffeecc, 3.0, 600);
        scene.add(sunLight);
        // Rim light from galaxy core direction
        const rimLight = new THREE.DirectionalLight(0x3344ff, 0.2);
        rimLight.position.set(-1, 0.2, -1).normalize();
        scene.add(rimLight);

        // ════════════════════════════════════════════════════════
        //  HELPERS
        // ════════════════════════════════════════════════════════
        function hexToRGB(hex) {{
            return {{ r:((hex>>16)&255)/255, g:((hex>>8)&255)/255, b:(hex&255)/255 }};
        }}
        function fmtBRL(v) {{
            return 'R$ ' + v.toLocaleString('pt-BR', {{minimumFractionDigits:0, maximumFractionDigits:0}});
        }}
        // Solve Kepler's equation  M = E - e·sin(E)  →  E (Newton–Raphson)
        function solveKepler(M, e) {{
            let E = M;
            for (let i = 0; i < 8; i++) {{
                const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
                E += dE;
                if (Math.abs(dE) < 1e-6) break;
            }}
            return E;
        }}

        // ════════════════════════════════════════════════════════
        //  STARFIELD (30 000 stars — galaxy arm distribution)
        // ════════════════════════════════════════════════════════
        function createStarfield() {{
            const N = 30000;
            const pos = new Float32Array(N * 3);
            const col = new Float32Array(N * 3);
            const sz  = new Float32Array(N);
            for (let i = 0; i < N; i++) {{
                // Mix: 40% spherical halo, 60% disk distribution
                let x, y, z;
                if (Math.random() < 0.4) {{
                    const r   = 500 + Math.random() * 2200;
                    const th  = Math.random() * Math.PI * 2;
                    const ph  = Math.acos(2 * Math.random() - 1);
                    x = r * Math.sin(ph) * Math.cos(th);
                    y = r * Math.sin(ph) * Math.sin(th);
                    z = r * Math.cos(ph);
                }} else {{
                    const r  = 200 + Math.random() * 1800;
                    const th = Math.random() * Math.PI * 2;
                    x = r * Math.cos(th) + (Math.random()-0.5) * 80;
                    y = (Math.random()-0.5) * 120;
                    z = r * Math.sin(th) + (Math.random()-0.5) * 80;
                }}
                pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
                const c = Math.random();
                if (c < 0.55)      {{ col[i*3]=1;    col[i*3+1]=1;    col[i*3+2]=1;    }}  // white
                else if (c < 0.70) {{ col[i*3]=0.65; col[i*3+1]=0.75; col[i*3+2]=1;    }}  // blue
                else if (c < 0.85) {{ col[i*3]=1;    col[i*3+1]=0.9;  col[i*3+2]=0.65; }}  // yellow
                else               {{ col[i*3]=1;    col[i*3+1]=0.55; col[i*3+2]=0.45; }}  // red giant
                sz[i] = 0.4 + Math.random() * 1.8;
            }}
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
            g.setAttribute('size',     new THREE.BufferAttribute(sz,  1));
            return new THREE.Points(g, new THREE.PointsMaterial({{
                size:1.1, vertexColors:true, transparent:true, opacity:0.88, sizeAttenuation:true
            }}));
        }}
        scene.add(createStarfield());

        // ════════════════════════════════════════════════════════
        //  GALAXY SPIRAL ARMS (logarithmic, 4 arms)
        // ════════════════════════════════════════════════════════
        function createGalaxySpiral() {{
            const ARMS   = 4;
            const N_ARM  = 6000;
            const total  = ARMS * N_ARM;
            const pos    = new Float32Array(total * 3);
            const col    = new Float32Array(total * 3);
            const GX = -200, GY = -30, GZ = -1400;  // galaxy center offset
            const SCALE  = 1.9;
            let idx = 0;
            for (let arm = 0; arm < ARMS; arm++) {{
                const armOffset = (arm / ARMS) * Math.PI * 2;
                for (let j = 0; j < N_ARM; j++) {{
                    const t    = j / N_ARM;
                    const r    = 60 + t * 500 * SCALE;          // radial distance
                    const a    = t * Math.PI * 3.5 + armOffset;  // angle: 1.75 turns per arm
                    const scatter = r * 0.08 + 8;               // perpendicular scatter ∝ r
                    const sx = (Math.random() - 0.5) * scatter;
                    const sy = (Math.random() - 0.5) * scatter * 0.12;
                    const sz = (Math.random() - 0.5) * scatter;
                    pos[idx*3]   = GX + Math.cos(a) * r + sx;
                    pos[idx*3+1] = GY + sy;
                    pos[idx*3+2] = GZ + Math.sin(a) * r + sz;
                    // Color: core warm white → arm blue-white → outer blue
                    const tCol = t;
                    const brightness = 0.06 + (1-tCol) * 0.28;
                    const c = new THREE.Color().setHSL(0.55 + tCol * 0.15, 0.65, brightness);
                    col[idx*3]=c.r; col[idx*3+1]=c.g; col[idx*3+2]=c.b;
                    idx++;
                }}
            }}
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
            return new THREE.Points(g, new THREE.PointsMaterial({{
                size:2.2, vertexColors:true, transparent:true,
                opacity:0.22, sizeAttenuation:true, blending:THREE.AdditiveBlending
            }}));
        }}
        scene.add(createGalaxySpiral());

        // Galactic core — bright nucleus
        function createGalacticCore() {{
            const N = 3000;
            const pos = new Float32Array(N * 3);
            const col = new Float32Array(N * 3);
            const GX=-200, GY=-30, GZ=-1400;
            for (let i = 0; i < N; i++) {{
                const r  = Math.pow(Math.random(), 2) * 120;
                const th = Math.random() * Math.PI * 2;
                const ph = Math.acos(2 * Math.random() - 1);
                pos[i*3]   = GX + r * Math.sin(ph) * Math.cos(th);
                pos[i*3+1] = GY + r * Math.sin(ph) * Math.sin(th) * 0.3;
                pos[i*3+2] = GZ + r * Math.cos(ph);
                const brightness = 0.4 + Math.random() * 0.6;
                const warmth = Math.random();
                col[i*3]   = brightness;
                col[i*3+1] = brightness * (0.85 + warmth * 0.1);
                col[i*3+2] = brightness * (0.6 + (1-warmth) * 0.4);
            }}
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
            return new THREE.Points(g, new THREE.PointsMaterial({{
                size:3.5, vertexColors:true, transparent:true,
                opacity:0.55, sizeAttenuation:true, blending:THREE.AdditiveBlending
            }}));
        }}
        scene.add(createGalacticCore());

        // ════════════════════════════════════════════════════════
        //  NEBULAE (3 distinct clouds)
        // ════════════════════════════════════════════════════════
        function createNebula(cx, cy, cz, hue, N, spread, opacity) {{
            const pos = new Float32Array(N * 3);
            const col = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) {{
                pos[i*3]   = cx + (Math.random()-0.5) * spread * 1.6;
                pos[i*3+1] = cy + (Math.random()-0.5) * spread * 0.5;
                pos[i*3+2] = cz + (Math.random()-0.5) * spread;
                const c = new THREE.Color().setHSL(hue + (Math.random()-0.5)*0.08, 0.85, 0.08 + Math.random()*0.18);
                col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
            }}
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
            return new THREE.Points(g, new THREE.PointsMaterial({{
                size:18, vertexColors:true, transparent:true,
                opacity, sizeAttenuation:true, blending:THREE.AdditiveBlending, depthWrite:false
            }}));
        }}
        scene.add(createNebula( 300, 60, -500,  0.72, 800, 200, 0.28)); // blue-purple
        scene.add(createNebula(-400, -40, -700, 0.95, 600, 160, 0.22)); // pink-magenta
        scene.add(createNebula( 100, 120, -350, 0.38, 500, 130, 0.20)); // green-cyan emission

        // ════════════════════════════════════════════════════════
        //  BLACK HOLE  (supermassive — far background)
        //  Position: BH_POS = (-750, 0, -550)
        // ════════════════════════════════════════════════════════
        const BH_POS = new THREE.Vector3(-750, 0, -550);
        const BH_RS  = 28;   // Schwarzschild radius (display)

        const bhGroup = new THREE.Group();
        bhGroup.position.copy(BH_POS);
        scene.add(bhGroup);

        // Event horizon — perfect black sphere
        const bhCore = new THREE.Mesh(
            new THREE.SphereGeometry(BH_RS, 64, 64),
            new THREE.MeshBasicMaterial({{ color:0x000000 }})
        );
        bhGroup.add(bhCore);

        // Photon sphere — subtle purple rim just outside event horizon
        const photonRim = new THREE.Mesh(
            new THREE.SphereGeometry(BH_RS * 1.5, 48, 48),
            new THREE.MeshBasicMaterial({{ color:0x8833ff, transparent:true, opacity:0.04, side:THREE.BackSide }})
        );
        bhGroup.add(photonRim);

        // Gravitational lensing rings
        for (let ri = 0; ri < 5; ri++) {{
            const rr = BH_RS * (1.6 + ri * 0.5);
            const lensRing = new THREE.Mesh(
                new THREE.RingGeometry(rr - 0.5, rr + 0.5, 128),
                new THREE.MeshBasicMaterial({{
                    color:0xffffff, transparent:true,
                    opacity:0.07 - ri * 0.012, side:THREE.DoubleSide, depthWrite:false
                }})
            );
            lensRing.rotation.x = Math.PI / 2;
            lensRing.rotation.y = 0.3 + ri * 0.15;
            bhGroup.add(lensRing);
        }}

        // Accretion disk — custom ring with radial color gradient
        (function buildAccretionDisk() {{
            const RINGS   = 80;
            const SEGS    = 192;
            const rInner  = BH_RS * 1.5;
            const rOuter  = BH_RS * 5.8;
            const verts   = [];
            const colors  = [];
            const indices = [];

            for (let ri = 0; ri <= RINGS; ri++) {{
                const t = ri / RINGS;                              // 0 = inner, 1 = outer
                const r = rInner + t * (rOuter - rInner);
                // Temperature ∝ (1/r)^(3/4) · (1 - √(rInner/r))^(1/4)  [thin disk model]
                const temp = Math.pow(1/r, 0.75) * Math.pow(Math.max(0, 1 - Math.sqrt(rInner/r)), 0.25);
                const normT = Math.min(1, temp / Math.pow(1/rInner, 0.75));  // normalize
                // Map normT: 1 = white-blue, 0.5 = orange, 0 = dark red
                let cr, cg, cb;
                if (normT > 0.7) {{
                    const s = (normT - 0.7) / 0.3;
                    cr = 1; cg = 0.85 + s * 0.15; cb = 0.6 + s * 0.4;  // orange → white-yellow
                }} else if (normT > 0.35) {{
                    const s = (normT - 0.35) / 0.35;
                    cr = 1; cg = 0.25 + s * 0.6; cb = 0.0 + s * 0.6;   // deep red → orange
                }} else {{
                    const s = normT / 0.35;
                    cr = s * 0.7; cg = 0.0; cb = 0.0;                   // black → deep red
                }}

                for (let si = 0; si <= SEGS; si++) {{
                    const a = (si / SEGS) * Math.PI * 2;
                    // Slight warp: disk is not perfectly flat
                    const warp = Math.sin(a * 3 + ri * 0.15) * 0.6 * (1 - t);
                    verts.push(Math.cos(a) * r, warp, Math.sin(a) * r);
                    colors.push(cr, cg, cb);
                }}
            }}
            for (let ri = 0; ri < RINGS; ri++) {{
                for (let si = 0; si < SEGS; si++) {{
                    const a = ri * (SEGS+1) + si;
                    const b = a + SEGS + 1;
                    indices.push(a, b, a+1, b, b+1, a+1);
                }}
            }}
            const diskGeo = new THREE.BufferGeometry();
            diskGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts),  3));
            diskGeo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(colors), 3));
            diskGeo.setIndex(indices);
            diskGeo.computeVertexNormals();
            const diskMat = new THREE.MeshBasicMaterial({{
                vertexColors:true, transparent:true, opacity:0.85,
                side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending
            }});
            const disk = new THREE.Mesh(diskGeo, diskMat);
            disk.rotation.x = 0.22;  // slight inclination (not perfectly edge-on)
            disk.name = 'accretionDisk';
            bhGroup.add(disk);
        }})();

        // Relativistic jets (perpendicular to disk)
        function createJet(yDir) {{
            const N = 1200;
            const pos = new Float32Array(N * 3);
            const col = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) {{
                const t = Math.random();
                const h = yDir * t * 280;                       // jet height
                const spread = 1.2 + t * 14;                    // expands outward
                const a = Math.random() * Math.PI * 2;
                pos[i*3]   = Math.cos(a) * spread * Math.random();
                pos[i*3+1] = h + (Math.random()-0.5) * 6;
                pos[i*3+2] = Math.sin(a) * spread * Math.random();
                const brightness = (1 - t) * 0.9;
                col[i*3]   = brightness * 0.4;
                col[i*3+1] = brightness * 0.7;
                col[i*3+2] = brightness;
            }}
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
            const jet = new THREE.Points(g, new THREE.PointsMaterial({{
                size:1.8, vertexColors:true, transparent:true,
                opacity:0.55, sizeAttenuation:true, blending:THREE.AdditiveBlending, depthWrite:false
            }}));
            jet.name = 'bhJet';
            return jet;
        }}
        bhGroup.add(createJet( 1));
        bhGroup.add(createJet(-1));

        // Hawking radiation (slow drift of particles from event horizon outward)
        const hawkingParticles = (function() {{
            const N = 400;
            const pos   = new Float32Array(N * 3);
            const col   = new Float32Array(N * 3);
            const vel   = [];
            for (let i = 0; i < N; i++) {{
                const th = Math.random() * Math.PI * 2;
                const ph = Math.acos(2 * Math.random() - 1);
                const r  = BH_RS * (1.05 + Math.random() * 0.5);
                pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
                pos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
                pos[i*3+2] = r * Math.cos(ph);
                col[i*3]=1; col[i*3+1]=1; col[i*3+2]=1;
                vel.push({{ x:Math.sin(ph)*Math.cos(th)*0.06, y:Math.sin(ph)*Math.sin(th)*0.06, z:Math.cos(ph)*0.06 }});
            }}
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
            const pts = new THREE.Points(g, new THREE.PointsMaterial({{
                size:0.5, vertexColors:true, transparent:true, opacity:0.35,
                sizeAttenuation:true, blending:THREE.AdditiveBlending
            }}));
            pts.name = 'hawking';
            pts.userData.vel = vel;
            bhGroup.add(pts);
            return pts;
        }})();

        // Gravitational wave rings (expand outward from BH periodically)
        const gwRings = [];
        for (let g = 0; g < 3; g++) {{
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(BH_RS * 2, BH_RS * 2 + 1, 128),
                new THREE.MeshBasicMaterial({{
                    color:0x8833ff, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false
                }})
            );
            ring.rotation.x = Math.PI / 2;
            ring.userData.phase = g / 3;
            bhGroup.add(ring);
            gwRings.push(ring);
        }}

        // ════════════════════════════════════════════════════════
        //  PULSARS  (distant neutron stars — lighthouse beams)
        // ════════════════════════════════════════════════════════
        function createPulsar(px, py, pz, period, color) {{
            const pg = new THREE.Group();
            pg.position.set(px, py, pz);
            // Star body
            pg.add(new THREE.Mesh(
                new THREE.SphereGeometry(2, 16, 16),
                new THREE.MeshBasicMaterial({{ color, transparent:true, opacity:0.95 }})
            ));
            // Glow
            pg.add(new THREE.Mesh(
                new THREE.SphereGeometry(4, 16, 16),
                new THREE.MeshBasicMaterial({{ color, transparent:true, opacity:0.08, side:THREE.BackSide }})
            ));
            // Beam group (rotates)
            const beamGroup = new THREE.Group();
            [-1, 1].forEach(dir => {{
                const beamGeo = new THREE.CylinderGeometry(0.3, 1.5, 80, 8, 1, true);
                const beamMat = new THREE.MeshBasicMaterial({{
                    color, transparent:true, opacity:0.18, side:THREE.DoubleSide, depthWrite:false
                }});
                const beam = new THREE.Mesh(beamGeo, beamMat);
                beam.position.y = dir * 40;
                beamGroup.add(beam);
            }});
            beamGroup.name = 'pulsar-beam';
            pg.add(beamGroup);
            pg.userData.period = period;
            pg.userData.beamGroup = beamGroup;
            scene.add(pg);
            return pg;
        }}
        const pulsars = [
            createPulsar( 420,  180, -480, 0.031, 0x88ccff),  // millisecond pulsar (blue)
            createPulsar(-380, -120, -620, 0.714, 0xffaa44),  // normal pulsar (orange)
        ];

        // ════════════════════════════════════════════════════════
        //  WORMHOLE  (exotic — purple + cyan swirl)
        // ════════════════════════════════════════════════════════
        const wormholeGroup = new THREE.Group();
        wormholeGroup.position.set(380, 45, -420);
        scene.add(wormholeGroup);

        // Throat (dark center)
        wormholeGroup.add(new THREE.Mesh(
            new THREE.SphereGeometry(10, 32, 32),
            new THREE.MeshBasicMaterial({{ color:0x000011 }})
        ));
        // Exotic matter ring
        for (let r = 0; r < 4; r++) {{
            const radius = 12 + r * 5;
            wormholeGroup.add(new THREE.Mesh(
                new THREE.TorusGeometry(radius, 0.6, 8, 128),
                new THREE.MeshBasicMaterial({{
                    color: r % 2 === 0 ? 0xcc44ff : 0x00ffee,
                    transparent:true, opacity:0.25 - r*0.04,
                    blending:THREE.AdditiveBlending, depthWrite:false
                }})
            ));
        }}
        // Swirling particles inside
        (function() {{
            const N = 600;
            const pos = new Float32Array(N * 3);
            const col = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) {{
                const t = i / N;
                const a = t * Math.PI * 12;
                const r = 2 + t * 9;
                pos[i*3]   = Math.cos(a) * r;
                pos[i*3+1] = (Math.random()-0.5) * 3;
                pos[i*3+2] = Math.sin(a) * r;
                const c = new THREE.Color().setHSL(0.75 + t * 0.2, 1, 0.5);
                col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
            }}
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
            const swirl = new THREE.Points(g, new THREE.PointsMaterial({{
                size:1.2, vertexColors:true, transparent:true, opacity:0.5,
                sizeAttenuation:true, blending:THREE.AdditiveBlending
            }}));
            swirl.name = 'wh-swirl';
            wormholeGroup.add(swirl);
        }})();

        // ════════════════════════════════════════════════════════
        //  BINARY STAR SYSTEM  (background — red giant + blue)
        // ════════════════════════════════════════════════════════
        const binaryGroup = new THREE.Group();
        binaryGroup.position.set(-550, 180, -900);
        scene.add(binaryGroup);
        const binaryPivot = new THREE.Object3D();
        binaryGroup.add(binaryPivot);

        // Red giant
        const redGiantMesh = new THREE.Mesh(
            new THREE.SphereGeometry(8, 32, 32),
            new THREE.MeshBasicMaterial({{ color:0xff4422 }})
        );
        redGiantMesh.position.x = 18;
        binaryPivot.add(redGiantMesh);

        // Blue companion
        const blueStar = new THREE.Mesh(
            new THREE.SphereGeometry(4, 24, 24),
            new THREE.MeshBasicMaterial({{ color:0x4488ff }})
        );
        blueStar.position.x = -18;
        binaryPivot.add(blueStar);

        // Glow for both
        [{{ mesh:redGiantMesh, color:0xff4422, s:2.2 }}, {{ mesh:blueStar, color:0x4488ff, s:2.0 }}].forEach(d => {{
            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(d.s * (d.mesh === redGiantMesh ? 8 : 4), 16, 16),
                new THREE.MeshBasicMaterial({{ color:d.color, transparent:true, opacity:0.07, side:THREE.BackSide }})
            );
            glow.position.copy(d.mesh.position);
            binaryPivot.add(glow);
        }});

        // ════════════════════════════════════════════════════════
        //  SUN  (portfolio anchor — total value)
        // ════════════════════════════════════════════════════════
        function createSun() {{
            const sg = new THREE.Group();
            // Core
            sg.add(new THREE.Mesh(
                new THREE.SphereGeometry(5, 64, 64),
                new THREE.MeshBasicMaterial({{ color:0xffdd44 }})
            ));
            // Glow layers
            [0.8, 1.8, 3.2].forEach((dr, i) => {{
                sg.add(new THREE.Mesh(
                    new THREE.SphereGeometry(5.5 + dr, 32, 32),
                    new THREE.MeshBasicMaterial({{
                        color: new THREE.Color().setHSL(0.12 - i*0.02, 1, 0.5),
                        transparent:true, opacity:0.14 - i*0.04, side:THREE.BackSide
                    }})
                ));
            }});
            // Corona particles
            const CN = 2500, cPos = new Float32Array(CN*3), cCol = new Float32Array(CN*3);
            for (let i = 0; i < CN; i++) {{
                const r  = 5.5 + Math.random() * 4;
                const th = Math.random() * Math.PI * 2;
                const ph = Math.acos(2 * Math.random() - 1);
                cPos[i*3]   = r * Math.sin(ph) * Math.cos(th);
                cPos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
                cPos[i*3+2] = r * Math.cos(ph);
                cCol[i*3]=1; cCol[i*3+1]=0.65+Math.random()*0.25; cCol[i*3+2]=0.15*Math.random();
            }}
            const cg = new THREE.BufferGeometry();
            cg.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
            cg.setAttribute('color',    new THREE.BufferAttribute(cCol, 3));
            const corona = new THREE.Points(cg, new THREE.PointsMaterial({{
                size:0.28, vertexColors:true, transparent:true, opacity:0.6, blending:THREE.AdditiveBlending
            }}));
            corona.name = 'corona';
            sg.add(corona);
            return sg;
        }}
        const sun = createSun();
        scene.add(sun);

        // ════════════════════════════════════════════════════════
        //  ASTEROID BELTS
        // ════════════════════════════════════════════════════════
        function createBelt(inner, outer, N, opacity) {{
            const pos = new Float32Array(N*3), col = new Float32Array(N*3), sz = new Float32Array(N);
            for (let i = 0; i < N; i++) {{
                const r  = inner + Math.random() * (outer - inner);
                const th = Math.random() * Math.PI * 2;
                const h  = (Math.random() - 0.5) * 2.2;
                pos[i*3]=r*Math.cos(th); pos[i*3+1]=h; pos[i*3+2]=r*Math.sin(th);
                const b = 0.28 + Math.random() * 0.4;
                col[i*3]=b; col[i*3+1]=b*0.9; col[i*3+2]=b*0.78;
                sz[i] = 0.1 + Math.random() * 0.3;
            }}
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
            g.setAttribute('size',     new THREE.BufferAttribute(sz, 1));
            return new THREE.Points(g, new THREE.PointsMaterial({{
                size:0.28, vertexColors:true, transparent:true, opacity
            }}));
        }}

        // ════════════════════════════════════════════════════════
        //  PLANETS  (asset classes)
        // ════════════════════════════════════════════════════════
        const planetsData = {solar_json};
        const planets     = [];
        const totalValue  = planetsData.reduce((s, p) => s + p.value, 0);

        // Asteroid belt between inner and outer planets
        if (planetsData.length > 2) {{
            const beltInner = 12 + planetsData.length * 1.8;
            scene.add(createBelt(beltInner, beltInner + 4, 1800, 0.65));
            const kuiper = beltInner + planetsData.length * 4.2 + 18;
            const kBelt = createBelt(kuiper, kuiper + 16, 2200, 0.25);
            kBelt.name = 'kuiper';
            scene.add(kBelt);
            // Oort cloud (very distant, sparse halo)
            const oort = createBelt(kuiper + 60, kuiper + 120, 3000, 0.10);
            oort.name = 'oort';
            scene.add(oort);
        }}

        // Build legend DOM
        const legendEl = document.getElementById('legend');
        let objCountHTML = '';

        planetsData.forEach((p, index) => {{
            // Orbit ring
            const orbitGeo = new THREE.RingGeometry(p.distance - 0.07, p.distance + 0.07, 144);
            const orbit = new THREE.Mesh(orbitGeo, new THREE.MeshBasicMaterial({{
                color:0x334466, side:THREE.DoubleSide, transparent:true, opacity:0.35
            }}));
            orbit.rotation.x = Math.PI / 2;
            scene.add(orbit);

            // Pivot for orbital motion
            const pivot = new THREE.Object3D();
            pivot.rotation.y = Math.random() * Math.PI * 2;
            scene.add(pivot);

            const planetGroup = new THREE.Group();
            planetGroup.position.set(p.distance, 0, 0);

            // Planet mesh
            const geo = new THREE.SphereGeometry(p.size, 52, 52);
            const mat = new THREE.MeshStandardMaterial({{
                color:p.color, roughness:0.38, metalness:0.28,
                emissive:p.color, emissiveIntensity:0.12
            }});
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.z = (Math.random() - 0.5) * 0.5;

            // Atmosphere
            planetGroup.add(new THREE.Mesh(
                new THREE.SphereGeometry(p.size * 1.14, 32, 32),
                new THREE.MeshBasicMaterial({{ color:p.color, transparent:true, opacity:0.07, side:THREE.BackSide }})
            ));
            // Outer glow
            planetGroup.add(new THREE.Mesh(
                new THREE.SphereGeometry(p.size * 1.32, 24, 24),
                new THREE.MeshBasicMaterial({{ color:p.color, transparent:true, opacity:0.028, side:THREE.BackSide }})
            ));

            // Planetary rings for large planets (pct > 15%)
            if (p.pct > 15) {{
                const ringInner = p.size * 1.5;
                const ringOuter = p.size * 2.6;
                const ringGeo   = new THREE.RingGeometry(ringInner, ringOuter, 128);
                const ringMat   = new THREE.MeshBasicMaterial({{
                    color:p.color, transparent:true, opacity:0.22,
                    side:THREE.DoubleSide, depthWrite:false
                }});
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = 1.1 + Math.random() * 0.3;
                ring.rotation.z = Math.random() * 0.4;
                planetGroup.add(ring);
            }}

            planetGroup.add(mesh);

            // Moons (individual assets)
            p.moons.forEach((m, mi) => {{
                const moonR  = p.size * 0.18 + (m.pct / 100) * 0.5;
                const moonD  = p.size * 1.8 + mi * (p.size * 0.6);
                const moonPiv = new THREE.Object3D();
                moonPiv.rotation.y = (mi / p.moons.length) * Math.PI * 2;
                moonPiv.rotation.x = (Math.random() - 0.5) * 0.5;
                const moonMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(moonR, 16, 16),
                    new THREE.MeshStandardMaterial({{ color:p.color, roughness:0.7, metalness:0.1 }})
                );
                moonMesh.position.x = moonD;
                moonMesh.userData = {{ name:m.name, isMoon:true, parentPlanet:p.name }};
                moonPiv.add(moonMesh);
                planetGroup.add(moonPiv);
            }});

            pivot.add(planetGroup);
            planets.push({{
                pivot, group:planetGroup, mesh,
                data:p, angle:Math.random()*Math.PI*2,
                moonPivots: planetGroup.children.filter(c => c instanceof THREE.Object3D && c !== mesh),
            }});

            // Legend entry
            const rgb = hexToRGB(p.color);
            const hexStr = '#' + p.color.toString(16).padStart(6, '0');
            legendEl.innerHTML += `<div class="legend-item" onclick="focusPlanet(${{index}})">
                <div class="legend-color" style="background:${{hexStr}};color:${{hexStr}}"></div>
                <span class="legend-name">${{p.name}} ${{p.pct.toFixed(1)}}%</span>
            </div>`;
        }});

        // Object counter
        document.getElementById('obj-counter').innerHTML =
            `<span>${{planetsData.length}}</span> planetas  ·  <span>4</span> cometas<br>` +
            `<span>2</span> pulsares  ·  <span>1</span> buraco negro  ·  <span>1</span> wormhole`;

        // ════════════════════════════════════════════════════════
        //  SPACE STATION (orbiting near sun)
        // ════════════════════════════════════════════════════════
        const stPivot = new THREE.Object3D();
        scene.add(stPivot);
        (function() {{
            const sg = new THREE.Group();
            const bMat = new THREE.MeshStandardMaterial({{ color:0xbbbbbb, metalness:0.88, roughness:0.18 }});
            sg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), bMat));
            [-0.65, 0.65].forEach(x => {{
                const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.28), new THREE.MeshBasicMaterial({{ color:0x1144aa }}));
                p.position.x = x; sg.add(p);
            }});
            sg.add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 24), new THREE.MeshBasicMaterial({{ color:0x888888 }})));
            const blink = new THREE.Mesh(new THREE.SphereGeometry(0.05,6,6), new THREE.MeshBasicMaterial({{ color:0xff3300, transparent:true }}) );
            blink.position.y = 0.42; blink.name = 'blink'; sg.add(blink);
            sg.position.set(9, 0.5, 0);
            sg.scale.setScalar(0.45);
            stPivot.add(sg);
        }})();

        // ════════════════════════════════════════════════════════
        //  COMETS  (Kepler elliptical orbits)
        //  Math: M = n*(t-tau), solve E, then x=a(cosE-e), z=b*sinE
        // ════════════════════════════════════════════════════════
        const cometDefs = [
            {{ a:80,  e:0.86, inc:0.44,  argPeri:0.8,   period:520,  tau:0,   color:0x88ccff }},
            {{ a:120, e:0.92, inc:-0.26, argPeri:2.1,   period:900,  tau:180, color:0xaaddff }},
            {{ a:60,  e:0.78, inc:0.70,  argPeri:5.0,   period:360,  tau:90,  color:0xffffff }},
            {{ a:155, e:0.96, inc:-0.08, argPeri:3.8,   period:1100, tau:300, color:0xddffee }},
        ];

        const comets = cometDefs.map(def => {{
            const b = def.a * Math.sqrt(1 - def.e * def.e);
            const cg = new THREE.Group();
            scene.add(cg);

            // Nucleus
            const nucleus = new THREE.Mesh(
                new THREE.SphereGeometry(0.45, 10, 10),
                new THREE.MeshBasicMaterial({{ color:def.color }})
            );
            nucleus.name = 'nucleus';
            cg.add(nucleus);

            // Dust tail (wider, yellowish, slightly curved)
            const TAIL = 300;
            const dustPos = new Float32Array(TAIL * 3);
            const dustCol = new Float32Array(TAIL * 3);
            for (let i = 0; i < TAIL; i++) {{
                const t = i / TAIL;
                dustPos[i*3] = t * 35 + (Math.random()-0.5)*3;
                dustPos[i*3+1] = (Math.random()-0.5) * 1.5;
                dustPos[i*3+2] = (Math.random()-0.5) * 4 * t;
                const fade = 1 - t;
                dustCol[i*3]=fade*1; dustCol[i*3+1]=fade*0.92; dustCol[i*3+2]=fade*0.6;
            }}
            const dustG = new THREE.BufferGeometry();
            dustG.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
            dustG.setAttribute('color',    new THREE.BufferAttribute(dustCol, 3));
            const dustTail = new THREE.Points(dustG, new THREE.PointsMaterial({{
                size:0.9, vertexColors:true, transparent:true, opacity:0.45,
                sizeAttenuation:true, blending:THREE.AdditiveBlending, depthWrite:false
            }}));
            dustTail.name = 'dustTail';
            cg.add(dustTail);

            // Ion tail (narrower, blue-white, straight anti-sun direction)
            const ionPos = new Float32Array(TAIL * 3);
            const ionCol = new Float32Array(TAIL * 3);
            for (let i = 0; i < TAIL; i++) {{
                const t = i / TAIL;
                ionPos[i*3]   = t * 50 + (Math.random()-0.5)*1.2;
                ionPos[i*3+1] = (Math.random()-0.5) * 0.6;
                ionPos[i*3+2] = (Math.random()-0.5) * 1.5 * t;
                const fade = Math.pow(1-t, 0.6);
                ionCol[i*3]=fade*0.5; ionCol[i*3+1]=fade*0.8; ionCol[i*3+2]=fade;
            }}
            const ionG = new THREE.BufferGeometry();
            ionG.setAttribute('position', new THREE.BufferAttribute(ionPos, 3));
            ionG.setAttribute('color',    new THREE.BufferAttribute(ionCol, 3));
            const ionTail = new THREE.Points(ionG, new THREE.PointsMaterial({{
                size:0.65, vertexColors:true, transparent:true, opacity:0.55,
                sizeAttenuation:true, blending:THREE.AdditiveBlending, depthWrite:false
            }}));
            ionTail.name = 'ionTail';
            cg.add(ionTail);

            // Orbit ring (ellipse — sampled)
            const oN = 256;
            const oPos = new Float32Array(oN * 3);
            for (let i = 0; i < oN; i++) {{
                const M = (i / oN) * Math.PI * 2;
                const E = solveKepler(M, def.e);
                const ox = def.a * (Math.cos(E) - def.e);
                const oz = b * Math.sin(E);
                // Rotate by inclination around x-axis
                oPos[i*3]   = ox * Math.cos(def.argPeri) - oz * Math.sin(def.argPeri);
                oPos[i*3+1] = oz * Math.sin(def.inc);
                oPos[i*3+2] = ox * Math.sin(def.argPeri) + oz * Math.cos(def.argPeri);
            }}
            const oG = new THREE.BufferGeometry();
            oG.setAttribute('position', new THREE.BufferAttribute(oPos, 3));
            const orbitLine = new THREE.Line(oG, new THREE.LineBasicMaterial({{
                color:def.color, transparent:true, opacity:0.07
            }}));
            scene.add(orbitLine);

            return {{ group:cg, def, b, meanAnomaly:def.tau * 0.001 }};
        }});

        // ════════════════════════════════════════════════════════
        //  RAYCASTER  (planet selection)
        // ════════════════════════════════════════════════════════
        const raycaster = new THREE.Raycaster();
        const mouse     = new THREE.Vector2();
        const clickable = planets.map(p => p.mesh);

        // ════════════════════════════════════════════════════════
        //  CAMERA CONTROLS
        // ════════════════════════════════════════════════════════
        function positionCamera() {{
            camera.position.x = targetDist * Math.sin(targetAngle) * Math.cos(targetHeight * Math.PI/180);
            camera.position.y = targetDist * Math.sin(targetHeight * Math.PI/180);
            camera.position.z = targetDist * Math.cos(targetAngle) * Math.cos(targetHeight * Math.PI/180);
            camera.lookAt(0, 0, 0);
        }}
        positionCamera();

        // ════════════════════════════════════════════════════════
        //  PLANET FOCUS
        // ════════════════════════════════════════════════════════
        function focusPlanet(index) {{
            if (index < 0 || index >= planets.length) return;
            const p = planets[index];
            selectedPlanet = p;
            const worldPos = new THREE.Vector3();
            p.mesh.getWorldPosition(worldPos);
            targetDist  = p.data.size * 8 + 20;
            targetAngle = Math.atan2(worldPos.x, worldPos.z);
            targetHeight = 20;
            updateDetailPanel(p);
        }}
        window.focusPlanet = focusPlanet;

        function updateDetailPanel(p) {{
            const panel = document.getElementById('planet-detail');
            panel.style.display = 'block';
            panel.className = 'visible';
            const hexStr = '#' + p.data.color.toString(16).padStart(6,'0');
            document.getElementById('detail-name').textContent = p.data.name.toUpperCase();
            document.getElementById('detail-name').style.color = hexStr;
            document.getElementById('detail-value').textContent = fmtBRL(p.data.value);
            document.getElementById('detail-pct').textContent  = p.data.pct.toFixed(2) + '%';
            document.getElementById('detail-rank').textContent = '#' + (planets.indexOf(p) + 1);
            document.getElementById('detail-bar').style.width  = p.data.pct + '%';
            document.getElementById('detail-bar').style.background = hexStr;

            const moonList = document.getElementById('moon-list');
            if (p.data.moons.length > 0) {{
                moonList.innerHTML = `<div class="moon-list-title">🌙 ATIVOS</div>` +
                    p.data.moons.map(m => `
                        <div class="moon-item">
                            <div class="moon-dot" style="background:${{hexStr}}"></div>
                            <span class="moon-name">${{m.name}}</span>
                            <span class="moon-val">${{fmtBRL(m.value)}}</span>
                            <span class="moon-pct">${{m.pct.toFixed(1)}}%</span>
                        </div>`).join('');
            }} else {{
                moonList.innerHTML = '';
            }}
        }}

        // ════════════════════════════════════════════════════════
        //  SHOOTING STARS
        // ════════════════════════════════════════════════════════
        function spawnShootingStar() {{
            const star = document.createElement('div');
            star.style.cssText = `position:fixed;width:${{60+Math.random()*80}}px;height:2px;
                background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.85),rgba(255,255,255,0));
                transform:rotate(${{-25-Math.random()*30}}deg);pointer-events:none;z-index:500;
                left:${{Math.random()*80}}%;top:${{Math.random()*50}}%;
                animation:shootAnim 0.9s linear forwards;`;
            const style = document.createElement('style');
            style.textContent = '@keyframes shootAnim{{from{{opacity:1;transform:translateX(0) rotate(-35deg)}}to{{opacity:0;transform:translateX(180px) translateY(180px) rotate(-35deg)}}}}';
            document.head.appendChild(style);
            document.body.appendChild(star);
            setTimeout(() => star.remove(), 900);
        }}
        setInterval(() => {{ if (Math.random() < 0.35) spawnShootingStar(); }}, 2800);

        // ════════════════════════════════════════════════════════
        //  ANIMATION LOOP
        // ════════════════════════════════════════════════════════
        const clock = new THREE.Clock();

        function animate() {{
            requestAnimationFrame(animate);
            const dt  = clock.getDelta() * timeScale;
            time     += dt;

            // ── Sun ──────────────────────────────────────────────
            sun.rotation.y += 0.003 * timeScale;
            const corona = sun.getObjectByName('corona');
            if (corona) corona.rotation.y -= 0.008 * timeScale;

            // ── Planets ──────────────────────────────────────────
            planets.forEach((p, idx) => {{
                p.angle = (p.angle || 0) + p.data.speed * timeScale;
                p.pivot.rotation.y = p.angle;
                p.mesh.rotation.y += 0.012 * timeScale;
                // Moon orbits
                p.group.children.forEach(child => {{
                    if (child instanceof THREE.Object3D && child.children.length > 0 && child.children[0].userData.isMoon) {{
                        child.rotation.y += 0.04 * timeScale;
                    }}
                }});
            }});

            // ── Space station ────────────────────────────────────
            stPivot.rotation.y += 0.012 * timeScale;
            const blinkMesh = stPivot.getObjectByName('blink');
            if (blinkMesh) blinkMesh.material.opacity = 0.5 + 0.5 * Math.sin(time * 8);

            // ── Black hole ───────────────────────────────────────
            // Accretion disk slow rotation
            const disk = bhGroup.getObjectByName('accretionDisk');
            if (disk) disk.rotation.z += 0.004 * timeScale;

            // Hawking particles drift outward, reset when too far
            const hawking = bhGroup.getObjectByName('hawking');
            if (hawking) {{
                const pos = hawking.geometry.attributes.position;
                const vel = hawking.userData.vel;
                for (let i = 0; i < pos.count; i++) {{
                    pos.array[i*3]   += vel[i].x * timeScale;
                    pos.array[i*3+1] += vel[i].y * timeScale;
                    pos.array[i*3+2] += vel[i].z * timeScale;
                    const r = Math.sqrt(pos.array[i*3]**2 + pos.array[i*3+1]**2 + pos.array[i*3+2]**2);
                    if (r > BH_RS * 6) {{
                        // Reset to event horizon
                        const th = Math.random() * Math.PI * 2;
                        const ph = Math.acos(2 * Math.random() - 1);
                        pos.array[i*3]   = BH_RS * 1.05 * Math.sin(ph) * Math.cos(th);
                        pos.array[i*3+1] = BH_RS * 1.05 * Math.sin(ph) * Math.sin(th);
                        pos.array[i*3+2] = BH_RS * 1.05 * Math.cos(ph);
                    }}
                }}
                pos.needsUpdate = true;
            }}

            // Gravitational wave rings
            gwRings.forEach(ring => {{
                const phase = ((time * 0.18 + ring.userData.phase) % 1);
                const scale = 1 + phase * 12;
                ring.scale.set(scale, scale, 1);
                ring.material.opacity = (1 - phase) * 0.12;
            }});

            // BH group slow rotation (Kerr)
            bhGroup.rotation.y += 0.001 * timeScale;

            // ── Pulsars ──────────────────────────────────────────
            pulsars.forEach(p => {{
                const bg = p.getObjectByName('pulsar-beam');
                if (bg) bg.rotation.y += (2 * Math.PI / p.userData.period) * timeScale * 60;
                // Intensity modulation
                bg && bg.children.forEach(b => {{
                    const phase = Math.abs(Math.sin(time / p.userData.period * Math.PI * 2));
                    b.material.opacity = 0.05 + phase * 0.35;
                }});
            }});

            // ── Wormhole ─────────────────────────────────────────
            wormholeGroup.rotation.y += 0.008 * timeScale;
            const whSwirl = wormholeGroup.getObjectByName('wh-swirl');
            if (whSwirl) whSwirl.rotation.y += 0.025 * timeScale;

            // ── Binary star ──────────────────────────────────────
            binaryPivot.rotation.y += 0.018 * timeScale;

            // ── Comets (Kepler) ───────────────────────────────────
            if (cometsVisible) {{
                comets.forEach(c => {{
                    // Advance mean anomaly: n = 2π/T (T in seconds of sim-time)
                    c.meanAnomaly += (Math.PI * 2 / c.def.period) * dt;
                    const E  = solveKepler(c.meanAnomaly % (Math.PI * 2), c.def.e);
                    // Position in orbital plane
                    const ox = c.def.a * (Math.cos(E) - c.def.e);
                    const oz = c.b    *  Math.sin(E);
                    // Rotate by argument of periapsis, then inclination
                    const cosA = Math.cos(c.def.argPeri), sinA = Math.sin(c.def.argPeri);
                    const cosI = Math.cos(c.def.inc),     sinI = Math.sin(c.def.inc);
                    const rx = ox * cosA - oz * sinA;
                    const ry = oz * sinI;
                    const rz = ox * sinA + oz * cosA;
                    c.group.position.set(rx, ry, rz);

                    // Tail direction: away from sun (anti-sunward)
                    const r   = Math.sqrt(rx*rx + ry*ry + rz*rz);
                    const tailDir = new THREE.Vector3(rx, ry, rz).normalize();
                    // Tail length ∝ 1/r (closer = longer, max when near periapsis)
                    const tailScale = Math.min(4, 20 / Math.max(1, r));

                    const dustTail = c.group.getObjectByName('dustTail');
                    const ionTail  = c.group.getObjectByName('ionTail');
                    if (dustTail) {{
                        dustTail.scale.setScalar(tailScale * 0.9);
                        dustTail.lookAt(c.group.position.clone().add(tailDir));
                    }}
                    if (ionTail) {{
                        ionTail.scale.setScalar(tailScale);
                        ionTail.lookAt(c.group.position.clone().add(tailDir));
                    }}

                    // Nucleus brightness increases near periapsis
                    const nuc = c.group.getObjectByName('nucleus');
                    if (nuc) nuc.material.opacity = Math.min(1, tailScale * 0.5);
                }});
            }}

            // ── Camera auto-rotate ────────────────────────────────
            if (autoRotate) targetAngle += 0.0008 * timeScale;
            if (!isDragging) {{
                cameraAngle    += (targetAngle - cameraAngle)    * 0.06;
                cameraHeight   += (targetHeight - cameraHeight)  * 0.06;
                cameraDistance += (targetDist - cameraDistance)  * 0.06;
            }}
            camera.position.x = cameraDistance * Math.sin(cameraAngle) * Math.cos(cameraHeight * Math.PI/180);
            camera.position.y = cameraDistance * Math.sin(cameraHeight * Math.PI/180);
            camera.position.z = cameraDistance * Math.cos(cameraAngle) * Math.cos(cameraHeight * Math.PI/180);
            camera.lookAt(0, 0, 0);

            // ── Cinematic mode ────────────────────────────────────
            if (cinematicMode && planets.length > 0) {{
                cineTimer += dt;
                if (cineTimer > 5) {{
                    cineTimer = 0;
                    cineIndex = (cineIndex + 1) % planets.length;
                    const p = planets[cineIndex];
                    const worldPos = new THREE.Vector3();
                    p.mesh.getWorldPosition(worldPos);
                    targetDist   = p.data.size * 9 + 18;
                    targetAngle  = Math.atan2(worldPos.x, worldPos.z);
                    targetHeight = 15 + Math.random() * 20;

                    const cineEl  = document.getElementById('cinematic-title');
                    const hexStr  = '#' + p.data.color.toString(16).padStart(6,'0');
                    document.getElementById('cine-name-text').textContent  = p.data.name.toUpperCase();
                    document.getElementById('cine-name-text').style.color  = hexStr;
                    document.getElementById('cine-val-text').textContent   = fmtBRL(p.data.value);
                    document.getElementById('cine-pct-text').textContent   = p.data.pct.toFixed(1) + '% DO PORTFÓLIO';
                    cineEl.classList.add('visible');
                    setTimeout(() => cineEl.classList.remove('visible'), 3500);
                }}
            }}

            // ── Starfield slow rotation (galaxy spin) ────────────
            scene.children.filter(c => c instanceof THREE.Points && !c.name).forEach(p => {{
                p.rotation.y += 0.00004 * timeScale;
            }});

            renderer.render(scene, camera);
        }}

        // ════════════════════════════════════════════════════════
        //  WARP IN  (initial camera fly-in)
        // ════════════════════════════════════════════════════════
        setTimeout(() => {{
            document.getElementById('warp-overlay').classList.add('hidden');
        }}, 1800);

        // ════════════════════════════════════════════════════════
        //  CONTROLS
        // ════════════════════════════════════════════════════════
        // Zoom
        document.getElementById('zoom-in').addEventListener('click',  () => {{ targetDist = Math.max(15, targetDist - 18); }});
        document.getElementById('zoom-out').addEventListener('click', () => {{ targetDist = Math.min(600, targetDist + 18); }});

        // Speed
        document.getElementById('speed-slider').addEventListener('input', e => {{
            timeScale = e.target.value / 100;
        }});

        // Auto-rotate
        document.getElementById('auto-rotate').addEventListener('click', function() {{
            autoRotate = !autoRotate;
            this.classList.toggle('active', autoRotate);
        }});

        // Top view
        document.getElementById('top-view').addEventListener('click', () => {{
            targetHeight = targetHeight > 70 ? 20 : 85;
            targetDist   = 130;
        }});

        // Cinematic
        document.getElementById('cinematic').addEventListener('click', function() {{
            cinematicMode = !cinematicMode;
            this.classList.toggle('active', cinematicMode);
            if (!cinematicMode) {{
                document.getElementById('cinematic-title').classList.remove('visible');
                targetDist = 95; targetHeight = 45;
            }}
        }});

        // Black hole view
        document.getElementById('bh-view').addEventListener('click', function() {{
            bhView = !bhView;
            this.classList.toggle('active', bhView);
            if (bhView) {{
                // Fly to black hole
                const bha = document.getElementById('bh-alert');
                bha.classList.add('show');
                setTimeout(() => bha.classList.remove('show'), 2500);
                // Point camera toward BH position
                targetAngle  = Math.atan2(BH_POS.x, BH_POS.z) + Math.PI;
                targetHeight = 10;
                targetDist   = 350;
            }} else {{
                targetDist = 95; targetHeight = 45;
            }}
        }});

        // Galaxy view
        document.getElementById('gal-view').addEventListener('click', function() {{
            galaxyView = !galaxyView;
            this.classList.toggle('active', galaxyView);
            targetDist   = galaxyView ? 550 : 95;
            targetHeight = galaxyView ? 30 : 45;
        }});

        // Comet trails toggle
        document.getElementById('comet-trail').addEventListener('click', function() {{
            cometsVisible = !cometsVisible;
            this.classList.toggle('active', cometsVisible);
            comets.forEach(c => {{ c.group.visible = cometsVisible; }});
        }});

        // Mouse drag
        renderer.domElement.addEventListener('mousedown', e => {{
            isDragging = true; prevMouse = {{ x:e.clientX, y:e.clientY }};
        }});
        window.addEventListener('mouseup',  () => {{ isDragging = false; }});
        window.addEventListener('mousemove', e => {{
            if (!isDragging) return;
            const dx = e.clientX - prevMouse.x;
            const dy = e.clientY - prevMouse.y;
            targetAngle  -= dx * 0.006;
            targetHeight  = Math.max(-80, Math.min(80, targetHeight + dy * 0.3));
            prevMouse = {{ x:e.clientX, y:e.clientY }};
        }});

        // Touch
        let lastTouch = null;
        renderer.domElement.addEventListener('touchstart', e => {{ lastTouch = e.touches[0]; }});
        renderer.domElement.addEventListener('touchmove',  e => {{
            if (!lastTouch) return;
            const dx = e.touches[0].clientX - lastTouch.clientX;
            const dy = e.touches[0].clientY - lastTouch.clientY;
            targetAngle  -= dx * 0.006;
            targetHeight  = Math.max(-80, Math.min(80, targetHeight + dy * 0.3));
            lastTouch = e.touches[0];
            e.preventDefault();
        }}, {{ passive:false }});

        // Scroll to zoom
        renderer.domElement.addEventListener('wheel', e => {{
            targetDist = Math.max(15, Math.min(600, targetDist + e.deltaY * 0.08));
        }});

        // Click planet
        renderer.domElement.addEventListener('click', e => {{
            mouse.x = (e.clientX / window.innerWidth)  * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(clickable);
            if (hits.length > 0) {{
                const idx = planets.findIndex(p => p.mesh === hits[0].object);
                if (idx >= 0) focusPlanet(idx);
            }} else {{
                document.getElementById('planet-detail').classList.remove('visible');
                selectedPlanet = null;
            }}
        }});

        // Keyboard shortcuts
        window.addEventListener('keydown', e => {{
            if (e.key === 'ArrowRight') cineIndex = (cineIndex + 1) % planets.length, focusPlanet(cineIndex);
            if (e.key === 'ArrowLeft')  cineIndex = (cineIndex - 1 + planets.length) % planets.length, focusPlanet(cineIndex);
            if (e.key === ' ')          {{ timeScale = timeScale > 0 ? 0 : 1; e.preventDefault(); }}
            if (e.key === 'Escape')     {{ selectedPlanet = null; document.getElementById('planet-detail').classList.remove('visible'); targetDist = 95; targetHeight = 45; }}
            if (e.key === 'g' || e.key === 'G') document.getElementById('gal-view').click();
            if (e.key === 'b' || e.key === 'B') document.getElementById('bh-view').click();
            if (e.key === 'c' || e.key === 'C') document.getElementById('cinematic').click();
        }});

        // Resize
        window.addEventListener('resize', () => {{
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }});

        // ── Start ─────────────────────────────────────────────────
        animate();
        </script>
    </body>
    </html>
    """
    components.html(solar_html, height=850)

# --- GLOBAL MAP LOGIC (EGG #4) ---
# Moved to core/visuals/global_map.py


# --- HOME BUTTON ---
if st.session_state.active_egg is None:
    c_home1, c_home2 = st.columns([8, 1])
    with c_home2:
        if st.button("🔌 DESCONECTAR", use_container_width=True):
            st.switch_page("Home.py")

# --- SNAKE GAME LOGIC (EGG #1) ---
def render_snake_game():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_snake_back"):
            return_to_hub()
            st.rerun()

    snake_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background: #000;
                font-family: 'Courier New', monospace;
                overflow: hidden;
                touch-action: none;
                -webkit-touch-callout: none;
                -webkit-user-select: none;
                user-select: none;
            }

            #game-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                padding: 10px;
            }

            #ui-panel {
                color: #00ff41;
                text-align: center;
                margin-bottom: 10px;
                text-shadow: 0 0 10px #00ff41;
            }

            #ui-panel h1 {
                font-size: 1.5rem;
                margin-bottom: 5px;
                color: #ffcc00;
                text-shadow: 0 0 10px #ffcc00;
            }

            #score-display { font-size: 1.2rem; margin-bottom: 5px; }
            #high-score { font-size: 0.9rem; color: #888; }

            #game-canvas {
                border: 3px solid #00ff41;
                box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
                background: #0a0a0a;
            }

            /* MOBILE CONTROLS */
            #mobile-controls {
                display: none;
                margin-top: 15px;
                width: 100%;
                max-width: 280px;
            }

            .control-row {
                display: flex;
                justify-content: center;
                gap: 8px;
                margin: 4px 0;
            }

            .control-btn {
                width: 65px;
                height: 65px;
                background: rgba(0, 255, 65, 0.15);
                border: 2px solid #00ff41;
                border-radius: 12px;
                color: #00ff41;
                font-size: 1.8rem;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.1s;
                -webkit-tap-highlight-color: transparent;
            }

            .control-btn:active {
                background: rgba(0, 255, 65, 0.5);
                transform: scale(0.92);
            }

            .control-btn.placeholder { visibility: hidden; }

            #start-btn {
                background: rgba(255, 204, 0, 0.2);
                border: 2px solid #ffcc00;
                color: #ffcc00;
                padding: 15px 40px;
                font-size: 1.2rem;
                font-family: 'Courier New', monospace;
                cursor: pointer;
                margin-top: 20px;
                border-radius: 8px;
                transition: all 0.2s;
            }

            #start-btn:hover, #start-btn:active {
                background: rgba(255, 204, 0, 0.4);
            }

            #game-over-screen {
                display: none;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.95);
                border: 2px solid #ff0040;
                padding: 30px;
                text-align: center;
                color: #ff0040;
                z-index: 100;
                border-radius: 10px;
            }

            #game-over-screen h2 {
                font-size: 1.8rem;
                margin-bottom: 15px;
                text-shadow: 0 0 10px #ff0040;
            }

            #final-score {
                font-size: 1.3rem;
                color: #00ff41;
                margin-bottom: 20px;
            }

            #restart-btn {
                background: rgba(0, 255, 65, 0.2);
                border: 2px solid #00ff41;
                color: #00ff41;
                padding: 12px 30px;
                font-size: 1rem;
                font-family: 'Courier New', monospace;
                cursor: pointer;
                border-radius: 8px;
            }

            /* Responsive & Mobile Detection */
            @media (max-width: 600px) {
                #ui-panel h1 { font-size: 1.2rem; }
                #score-display { font-size: 1rem; }
                #mobile-controls { display: block; }
                .control-btn { width: 55px; height: 55px; font-size: 1.5rem; }
            }

            @media (hover: none) and (pointer: coarse) {
                #mobile-controls { display: block; }
            }

            #swipe-hint {
                color: #555;
                font-size: 0.8rem;
                margin-top: 10px;
                display: none;
            }

            @media (hover: none) and (pointer: coarse) {
                #swipe-hint { display: block; }
            }
        </style>
    </head>
    <body>
        <div id="game-container">
            <div id="ui-panel">
                <h1>FINANCIAL SNAKE</h1>
                <div id="score-display">SCORE: <span id="score">0</span></div>
                <div id="high-score">HIGH SCORE: <span id="highscore">0</span></div>
            </div>

            <canvas id="game-canvas"></canvas>

            <div id="game-over-screen">
                <h2>GAME OVER</h2>
                <div id="final-score">SCORE: 0</div>
                <button id="restart-btn">RESTART</button>
            </div>

            <button id="start-btn">START GAME</button>

            <div id="swipe-hint">Swipe on canvas or use buttons below</div>

            <div id="mobile-controls">
                <div class="control-row">
                    <div class="control-btn placeholder"></div>
                    <div class="control-btn" id="btn-up">▲</div>
                    <div class="control-btn placeholder"></div>
                </div>
                <div class="control-row">
                    <div class="control-btn" id="btn-left">◀</div>
                    <div class="control-btn" id="btn-down">▼</div>
                    <div class="control-btn" id="btn-right">▶</div>
                </div>
            </div>
        </div>

        <script>
            const canvas = document.getElementById('game-canvas');
            const ctx = canvas.getContext('2d');

            // Responsive canvas size
            function setCanvasSize() {
                const maxWidth = Math.min(window.innerWidth - 30, 400);
                const maxHeight = Math.min(window.innerHeight - 320, 400);
                const size = Math.min(maxWidth, maxHeight);
                canvas.width = Math.floor(size / 20) * 20;
                canvas.height = Math.floor(size / 20) * 20;
            }
            setCanvasSize();
            window.addEventListener('resize', setCanvasSize);

            const gridSize = 20;
            let cols, rows;

            function updateGrid() {
                cols = canvas.width / gridSize;
                rows = canvas.height / gridSize;
            }
            updateGrid();

            // Game State
            let snake = [];
            let direction = { x: 1, y: 0 };
            let nextDirection = { x: 1, y: 0 };
            let food = { x: 0, y: 0 };
            let score = 0;
            let highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
            let gameRunning = false;
            let gameLoop = null;
            let speed = 150;

            // Food types with financial theme
            const foodTypes = [
                { symbol: '$', color: '#00ff41', points: 10 },
                { symbol: '₿', color: '#ffcc00', points: 25 },
                { symbol: '💎', color: '#00efff', points: 50 },
                { symbol: '📈', color: '#ff00de', points: 15 }
            ];
            let currentFood = foodTypes[0];

            // UI Elements
            const scoreEl = document.getElementById('score');
            const highScoreEl = document.getElementById('highscore');
            const startBtn = document.getElementById('start-btn');
            const restartBtn = document.getElementById('restart-btn');
            const gameOverScreen = document.getElementById('game-over-screen');
            const finalScoreEl = document.getElementById('final-score');

            highScoreEl.textContent = highScore;

            function initGame() {
                updateGrid();
                snake = [
                    { x: Math.floor(cols / 2), y: Math.floor(rows / 2) },
                    { x: Math.floor(cols / 2) - 1, y: Math.floor(rows / 2) },
                    { x: Math.floor(cols / 2) - 2, y: Math.floor(rows / 2) }
                ];
                direction = { x: 1, y: 0 };
                nextDirection = { x: 1, y: 0 };
                score = 0;
                speed = 150;
                scoreEl.textContent = score;
                spawnFood();
                gameOverScreen.style.display = 'none';
            }

            function spawnFood() {
                let valid = false;
                while (!valid) {
                    food.x = Math.floor(Math.random() * cols);
                    food.y = Math.floor(Math.random() * rows);
                    valid = !snake.some(seg => seg.x === food.x && seg.y === food.y);
                }
                currentFood = foodTypes[Math.floor(Math.random() * foodTypes.length)];
            }

            function update() {
                direction = { ...nextDirection };

                const head = {
                    x: snake[0].x + direction.x,
                    y: snake[0].y + direction.y
                };

                // Wall collision
                if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows) {
                    gameOver();
                    return;
                }

                // Self collision
                if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
                    gameOver();
                    return;
                }

                snake.unshift(head);

                // Food collision
                if (head.x === food.x && head.y === food.y) {
                    score += currentFood.points;
                    scoreEl.textContent = score;
                    spawnFood();
                    if (speed > 70) speed -= 3;
                    clearInterval(gameLoop);
                    gameLoop = setInterval(gameStep, speed);
                } else {
                    snake.pop();
                }
            }

            function draw() {
                ctx.fillStyle = '#0a0a0a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Grid
                ctx.strokeStyle = 'rgba(0, 255, 65, 0.08)';
                ctx.lineWidth = 0.5;
                for (let i = 0; i <= cols; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * gridSize, 0);
                    ctx.lineTo(i * gridSize, canvas.height);
                    ctx.stroke();
                }
                for (let i = 0; i <= rows; i++) {
                    ctx.beginPath();
                    ctx.moveTo(0, i * gridSize);
                    ctx.lineTo(canvas.width, i * gridSize);
                    ctx.stroke();
                }

                // Snake
                snake.forEach((seg, i) => {
                    const alpha = 1 - (i / snake.length) * 0.5;
                    const hue = 120 + (i * 2);
                    ctx.fillStyle = i === 0 ? '#00ff41' : `hsla(${hue}, 100%, 50%, ${alpha})`;
                    ctx.shadowColor = '#00ff41';
                    ctx.shadowBlur = i === 0 ? 15 : 5;

                    ctx.beginPath();
                    ctx.roundRect(
                        seg.x * gridSize + 2,
                        seg.y * gridSize + 2,
                        gridSize - 4,
                        gridSize - 4,
                        4
                    );
                    ctx.fill();
                    ctx.shadowBlur = 0;
                });

                // Food
                ctx.fillStyle = currentFood.color;
                ctx.shadowColor = currentFood.color;
                ctx.shadowBlur = 20;
                ctx.font = `${gridSize - 4}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(
                    currentFood.symbol,
                    food.x * gridSize + gridSize / 2,
                    food.y * gridSize + gridSize / 2
                );
                ctx.shadowBlur = 0;
            }

            function gameOver() {
                gameRunning = false;
                clearInterval(gameLoop);

                if (score > highScore) {
                    highScore = score;
                    localStorage.setItem('snakeHighScore', highScore);
                    highScoreEl.textContent = highScore;
                }

                finalScoreEl.textContent = `SCORE: ${score}`;
                gameOverScreen.style.display = 'block';
                startBtn.style.display = 'block';
            }

            function gameStep() {
                update();
                draw();
            }

            function startGame() {
                initGame();
                gameRunning = true;
                startBtn.style.display = 'none';
                gameLoop = setInterval(gameStep, speed);
            }

            // Controls
            function setDirection(x, y) {
                if (direction.x === -x && direction.y === -y) return;
                if (direction.x === x && direction.y === y) return;
                nextDirection = { x, y };
            }

            // Keyboard
            document.addEventListener('keydown', (e) => {
                if (!gameRunning) {
                    if (e.key === ' ' || e.key === 'Enter') startGame();
                    return;
                }

                switch(e.key) {
                    case 'ArrowUp': case 'w': case 'W': setDirection(0, -1); break;
                    case 'ArrowDown': case 's': case 'S': setDirection(0, 1); break;
                    case 'ArrowLeft': case 'a': case 'A': setDirection(-1, 0); break;
                    case 'ArrowRight': case 'd': case 'D': setDirection(1, 0); break;
                }
            });

            // Mobile buttons
            document.getElementById('btn-up').addEventListener('touchstart', (e) => { e.preventDefault(); if (gameRunning) setDirection(0, -1); });
            document.getElementById('btn-down').addEventListener('touchstart', (e) => { e.preventDefault(); if (gameRunning) setDirection(0, 1); });
            document.getElementById('btn-left').addEventListener('touchstart', (e) => { e.preventDefault(); if (gameRunning) setDirection(-1, 0); });
            document.getElementById('btn-right').addEventListener('touchstart', (e) => { e.preventDefault(); if (gameRunning) setDirection(1, 0); });

            // Swipe controls on canvas
            let touchStartX = 0;
            let touchStartY = 0;

            canvas.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }, { passive: true });

            canvas.addEventListener('touchend', (e) => {
                if (!gameRunning) return;

                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;

                const dx = touchEndX - touchStartX;
                const dy = touchEndY - touchStartY;

                const minSwipe = 25;

                if (Math.abs(dx) > Math.abs(dy)) {
                    if (Math.abs(dx) > minSwipe) setDirection(dx > 0 ? 1 : -1, 0);
                } else {
                    if (Math.abs(dy) > minSwipe) setDirection(0, dy > 0 ? 1 : -1);
                }
            });

            // Buttons
            startBtn.addEventListener('click', startGame);
            startBtn.addEventListener('touchend', (e) => { e.preventDefault(); startGame(); });
            restartBtn.addEventListener('click', startGame);
            restartBtn.addEventListener('touchend', (e) => { e.preventDefault(); startGame(); });

            // Initial draw
            initGame();
            draw();
        </script>
    </body>
    </html>
    """
    components.html(snake_html, height=700)

# --- NEURAL PULSE (EGG #5) ---
def render_neural_pulse():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_neural_back"):
            return_to_hub()
            st.rerun()

    neural_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background: #000;
                font-family: 'Courier New', monospace;
                overflow: hidden;
                touch-action: none;
                -webkit-user-select: none;
                user-select: none;
            }

            .container {
                display: flex;
                flex-direction: column;
                align-items: center;
                min-height: 100vh;
                padding: 15px;
            }

            .title {
                color: #00ff41;
                font-size: 1.3rem;
                text-align: center;
                margin-bottom: 10px;
                text-shadow: 0 0 20px rgba(0, 255, 65, 0.5);
            }

            .subtitle {
                color: #666;
                font-size: 0.75rem;
                text-align: center;
                margin-bottom: 15px;
            }

            #canvas {
                border: 1px solid #00ff41;
                border-radius: 10px;
                background: rgba(0, 20, 10, 0.5);
                max-width: 100%;
                touch-action: none;
            }

            .stats {
                display: flex;
                gap: 20px;
                margin-top: 15px;
                flex-wrap: wrap;
                justify-content: center;
            }

            .stat {
                text-align: center;
                padding: 10px 15px;
                background: rgba(0, 255, 65, 0.1);
                border: 1px solid rgba(0, 255, 65, 0.3);
                border-radius: 8px;
            }

            .stat-value {
                color: #00ff41;
                font-size: 1.5rem;
                font-weight: bold;
            }

            .stat-label {
                color: #666;
                font-size: 0.7rem;
            }

            .controls {
                display: flex;
                gap: 10px;
                margin-top: 15px;
                flex-wrap: wrap;
                justify-content: center;
            }

            .btn {
                background: rgba(0, 255, 65, 0.15);
                border: 1px solid #00ff41;
                color: #00ff41;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: inherit;
                font-size: 0.85rem;
                cursor: pointer;
                transition: all 0.3s;
                -webkit-tap-highlight-color: transparent;
            }

            .btn:active {
                background: rgba(0, 255, 65, 0.4);
                transform: scale(0.95);
            }

            .btn.pink {
                border-color: #ff00de;
                color: #ff00de;
                background: rgba(255, 0, 222, 0.15);
            }

            .btn.pink:active {
                background: rgba(255, 0, 222, 0.4);
            }

            .info {
                color: #444;
                font-size: 0.7rem;
                text-align: center;
                margin-top: 15px;
                max-width: 300px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="title">🧠 NEURAL PULSE</div>
            <div class="subtitle">Toque para ativar neurônios</div>

            <canvas id="canvas"></canvas>

            <div class="stats">
                <div class="stat">
                    <div class="stat-value" id="neurons">0</div>
                    <div class="stat-label">NEURÔNIOS</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="signals">0</div>
                    <div class="stat-label">SINAIS</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="thoughts">0</div>
                    <div class="stat-label">PENSAMENTOS</div>
                </div>
            </div>

            <div class="controls">
                <button class="btn" id="addLayer">+ Camada</button>
                <button class="btn pink" id="pulse">⚡ Pulsar Tudo</button>
                <button class="btn" id="reset">↺ Reset</button>
            </div>

            <div class="info">
                Rede neural artificial com propagação de sinais em tempo real
            </div>
        </div>

        <script>
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');

            // Responsive canvas
            function resize() {
                const size = Math.min(window.innerWidth - 30, 380);
                canvas.width = size;
                canvas.height = size;
            }
            resize();
            window.addEventListener('resize', resize);

            // Neural network
            let layers = [];
            let connections = [];
            let signals = [];
            let totalSignals = 0;
            let thoughts = 0;

            function createNetwork(numLayers = 4) {
                layers = [];
                connections = [];
                signals = [];

                const neuronsPerLayer = [3, 5, 5, 3];

                for (let l = 0; l < numLayers; l++) {
                    const layer = [];
                    const count = neuronsPerLayer[l] || 4;
                    const layerX = (canvas.width / (numLayers + 1)) * (l + 1);

                    for (let n = 0; n < count; n++) {
                        const neuronY = (canvas.height / (count + 1)) * (n + 1);
                        layer.push({
                            x: layerX,
                            y: neuronY,
                            activation: 0,
                            pulseRadius: 0
                        });
                    }
                    layers.push(layer);
                }

                // Create connections
                for (let l = 0; l < layers.length - 1; l++) {
                    for (let n = 0; n < layers[l].length; n++) {
                        for (let m = 0; m < layers[l + 1].length; m++) {
                            connections.push({
                                from: { layer: l, neuron: n },
                                to: { layer: l + 1, neuron: m },
                                weight: Math.random() * 0.5 + 0.5,
                                signal: 0
                            });
                        }
                    }
                }

                document.getElementById('neurons').textContent =
                    layers.reduce((sum, l) => sum + l.length, 0);
            }

            function activateNeuron(layerIdx, neuronIdx) {
                const neuron = layers[layerIdx][neuronIdx];
                neuron.activation = 1;
                neuron.pulseRadius = 0;
                totalSignals++;

                // Propagate to next layer
                if (layerIdx < layers.length - 1) {
                    connections.forEach(conn => {
                        if (conn.from.layer === layerIdx && conn.from.neuron === neuronIdx) {
                            setTimeout(() => {
                                signals.push({
                                    x: neuron.x,
                                    y: neuron.y,
                                    targetX: layers[conn.to.layer][conn.to.neuron].x,
                                    targetY: layers[conn.to.layer][conn.to.neuron].y,
                                    progress: 0,
                                    toLayer: conn.to.layer,
                                    toNeuron: conn.to.neuron,
                                    color: `hsl(${120 + layerIdx * 60}, 100%, 50%)`
                                });
                            }, Math.random() * 200);
                        }
                    });
                } else {
                    // Output layer reached = thought!
                    thoughts++;
                }

                document.getElementById('signals').textContent = totalSignals;
                document.getElementById('thoughts').textContent = thoughts;
            }

            function draw() {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw connections
                connections.forEach(conn => {
                    const from = layers[conn.from.layer][conn.from.neuron];
                    const to = layers[conn.to.layer][conn.to.neuron];

                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                    ctx.strokeStyle = `rgba(0, 255, 65, ${0.1 + conn.weight * 0.2})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                });

                // Draw signals
                signals = signals.filter(s => {
                    s.progress += 0.03;

                    if (s.progress >= 1) {
                        activateNeuron(s.toLayer, s.toNeuron);
                        return false;
                    }

                    const x = s.x + (s.targetX - s.x) * s.progress;
                    const y = s.y + (s.targetY - s.y) * s.progress;

                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fillStyle = s.color;
                    ctx.fill();

                    // Glow
                    ctx.beginPath();
                    ctx.arc(x, y, 8, 0, Math.PI * 2);
                    ctx.fillStyle = s.color.replace('50%)', '50%, 0.3)').replace('hsl', 'hsla');
                    ctx.fill();

                    return true;
                });

                // Draw neurons
                layers.forEach((layer, li) => {
                    layer.forEach((neuron, ni) => {
                        // Pulse effect
                        if (neuron.pulseRadius > 0 && neuron.pulseRadius < 30) {
                            ctx.beginPath();
                            ctx.arc(neuron.x, neuron.y, neuron.pulseRadius, 0, Math.PI * 2);
                            ctx.strokeStyle = `rgba(0, 255, 65, ${1 - neuron.pulseRadius / 30})`;
                            ctx.lineWidth = 2;
                            ctx.stroke();
                            neuron.pulseRadius += 1;
                        }

                        // Decay activation
                        neuron.activation *= 0.95;

                        // Neuron body
                        const color = li === 0 ? '#00ff41' :
                                      li === layers.length - 1 ? '#ff00de' : '#00efff';

                        ctx.beginPath();
                        ctx.arc(neuron.x, neuron.y, 12 + neuron.activation * 8, 0, Math.PI * 2);
                        ctx.fillStyle = neuron.activation > 0.1 ? color : '#333';
                        ctx.fill();

                        ctx.beginPath();
                        ctx.arc(neuron.x, neuron.y, 8, 0, Math.PI * 2);
                        ctx.fillStyle = neuron.activation > 0.1 ? '#fff' : '#222';
                        ctx.fill();
                    });
                });

                requestAnimationFrame(draw);
            }

            // Touch handling
            canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const touch = e.touches[0];
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;

                // Find nearest neuron in input layer
                let minDist = Infinity;
                let nearestNeuron = null;

                layers[0].forEach((neuron, idx) => {
                    const dist = Math.sqrt((x - neuron.x) ** 2 + (y - neuron.y) ** 2);
                    if (dist < minDist && dist < 50) {
                        minDist = dist;
                        nearestNeuron = idx;
                    }
                });

                if (nearestNeuron !== null) {
                    activateNeuron(0, nearestNeuron);
                }
            });

            canvas.addEventListener('click', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                layers[0].forEach((neuron, idx) => {
                    const dist = Math.sqrt((x - neuron.x) ** 2 + (y - neuron.y) ** 2);
                    if (dist < 50) {
                        activateNeuron(0, idx);
                    }
                });
            });

            // Buttons
            document.getElementById('addLayer').addEventListener('click', () => {
                const newCount = layers.length + 1;
                if (newCount <= 6) createNetwork(newCount);
            });

            document.getElementById('pulse').addEventListener('click', () => {
                layers[0].forEach((_, idx) => {
                    setTimeout(() => activateNeuron(0, idx), idx * 100);
                });
            });

            document.getElementById('reset').addEventListener('click', () => {
                totalSignals = 0;
                thoughts = 0;
                createNetwork(4);
                document.getElementById('signals').textContent = '0';
                document.getElementById('thoughts').textContent = '0';
            });

            // Init
            createNetwork(4);
            draw();
        </script>
    </body>
    </html>
    """
    components.html(neural_html, height=680)

# --- PARTICLE LIFE (EGG #6) ---
def render_particle_life():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_particle_back"):
            return_to_hub()
            st.rerun()

    particle_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background: #000;
                font-family: 'Courier New', monospace;
                overflow: hidden;
                touch-action: none;
                -webkit-user-select: none;
            }

            .container {
                display: flex;
                flex-direction: column;
                align-items: center;
                min-height: 100vh;
                padding: 10px;
            }

            .title {
                color: #ff00de;
                font-size: 1.3rem;
                margin-bottom: 5px;
                text-shadow: 0 0 20px rgba(255, 0, 222, 0.5);
            }

            .subtitle {
                color: #666;
                font-size: 0.7rem;
                margin-bottom: 10px;
            }

            #canvas {
                border: 1px solid #ff00de;
                border-radius: 10px;
                background: #050510;
            }

            .legend {
                display: flex;
                gap: 15px;
                margin-top: 12px;
                flex-wrap: wrap;
                justify-content: center;
            }

            .legend-item {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 0.7rem;
                color: #888;
            }

            .legend-dot {
                width: 12px;
                height: 12px;
                border-radius: 50%;
            }

            .controls {
                display: flex;
                gap: 8px;
                margin-top: 12px;
                flex-wrap: wrap;
                justify-content: center;
            }

            .btn {
                background: rgba(255, 0, 222, 0.15);
                border: 1px solid #ff00de;
                color: #ff00de;
                padding: 10px 15px;
                border-radius: 8px;
                font-family: inherit;
                font-size: 0.75rem;
                cursor: pointer;
                -webkit-tap-highlight-color: transparent;
            }

            .btn:active {
                background: rgba(255, 0, 222, 0.4);
                transform: scale(0.95);
            }

            .info {
                color: #444;
                font-size: 0.65rem;
                text-align: center;
                margin-top: 10px;
                padding: 0 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="title">✨ PARTICLE LIFE</div>
            <div class="subtitle">Vida artificial emergente</div>

            <canvas id="canvas"></canvas>

            <div class="legend">
                <div class="legend-item">
                    <div class="legend-dot" style="background: #ff0000;"></div>
                    <span>Vermelho</span>
                </div>
                <div class="legend-item">
                    <div class="legend-dot" style="background: #00ff00;"></div>
                    <span>Verde</span>
                </div>
                <div class="legend-item">
                    <div class="legend-dot" style="background: #0088ff;"></div>
                    <span>Azul</span>
                </div>
                <div class="legend-item">
                    <div class="legend-dot" style="background: #ffff00;"></div>
                    <span>Amarelo</span>
                </div>
            </div>

            <div class="controls">
                <button class="btn" id="chaos">🌀 Caos</button>
                <button class="btn" id="harmony">☯ Harmonia</button>
                <button class="btn" id="predator">🦈 Predador</button>
                <button class="btn" id="random">🎲 Random</button>
            </div>

            <div class="info">
                Partículas seguem regras simples de atração/repulsão.<br>
                Comportamentos complexos emergem naturalmente.
            </div>
        </div>

        <script>
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');

            function resize() {
                const size = Math.min(window.innerWidth - 20, 360);
                canvas.width = size;
                canvas.height = size;
            }
            resize();
            window.addEventListener('resize', resize);

            const colors = ['#ff0000', '#00ff00', '#0088ff', '#ffff00'];
            let particles = [];
            let rules = {};

            function randomRules() {
                rules = {};
                colors.forEach(c1 => {
                    rules[c1] = {};
                    colors.forEach(c2 => {
                        rules[c1][c2] = (Math.random() - 0.5) * 2;
                    });
                });
            }

            function harmonyRules() {
                rules = {};
                colors.forEach((c1, i) => {
                    rules[c1] = {};
                    colors.forEach((c2, j) => {
                        if (i === j) rules[c1][c2] = -0.3;
                        else if ((i + 1) % 4 === j) rules[c1][c2] = 0.5;
                        else rules[c1][c2] = 0.1;
                    });
                });
            }

            function chaosRules() {
                rules = {};
                colors.forEach(c1 => {
                    rules[c1] = {};
                    colors.forEach(c2 => {
                        rules[c1][c2] = (Math.random() - 0.3) * 3;
                    });
                });
            }

            function predatorRules() {
                rules = {
                    '#ff0000': { '#ff0000': 0.1, '#00ff00': 0.8, '#0088ff': -0.5, '#ffff00': 0 },
                    '#00ff00': { '#ff0000': -0.8, '#00ff00': 0.2, '#0088ff': 0.5, '#ffff00': 0 },
                    '#0088ff': { '#ff0000': 0, '#00ff00': -0.5, '#0088ff': 0.1, '#ffff00': 0.8 },
                    '#ffff00': { '#ff0000': 0.3, '#00ff00': 0, '#0088ff': -0.8, '#ffff00': 0.2 }
                };
            }

            function createParticles(count = 200) {
                particles = [];
                const perColor = Math.floor(count / colors.length);

                colors.forEach(color => {
                    for (let i = 0; i < perColor; i++) {
                        particles.push({
                            x: Math.random() * canvas.width,
                            y: Math.random() * canvas.height,
                            vx: 0,
                            vy: 0,
                            color: color
                        });
                    }
                });
            }

            function applyRule(p1, p2, g) {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const d = Math.sqrt(dx * dx + dy * dy);

                if (d > 0 && d < 80) {
                    const f = g / d;
                    p1.vx += f * dx * 0.5;
                    p1.vy += f * dy * 0.5;
                }
            }

            function update() {
                for (let i = 0; i < particles.length; i++) {
                    const p1 = particles[i];
                    let fx = 0, fy = 0;

                    for (let j = 0; j < particles.length; j++) {
                        if (i === j) continue;
                        const p2 = particles[j];
                        const g = rules[p1.color][p2.color];
                        applyRule(p1, p2, g);
                    }

                    // Friction
                    p1.vx *= 0.5;
                    p1.vy *= 0.5;

                    // Update position
                    p1.x += p1.vx;
                    p1.y += p1.vy;

                    // Wrap around
                    if (p1.x < 0) p1.x = canvas.width;
                    if (p1.x > canvas.width) p1.x = 0;
                    if (p1.y < 0) p1.y = canvas.height;
                    if (p1.y > canvas.height) p1.y = 0;
                }
            }

            function draw() {
                ctx.fillStyle = 'rgba(5, 5, 16, 0.2)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                particles.forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = p.color;
                    ctx.fill();
                });

                update();
                requestAnimationFrame(draw);
            }

            // Touch to add particles
            canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left;
                const y = e.touches[0].clientY - rect.top;

                for (let i = 0; i < 10; i++) {
                    particles.push({
                        x: x + (Math.random() - 0.5) * 30,
                        y: y + (Math.random() - 0.5) * 30,
                        vx: (Math.random() - 0.5) * 2,
                        vy: (Math.random() - 0.5) * 2,
                        color: colors[Math.floor(Math.random() * colors.length)]
                    });
                }

                // Limit particles
                if (particles.length > 400) {
                    particles = particles.slice(-400);
                }
            });

            // Buttons
            document.getElementById('chaos').addEventListener('click', () => {
                chaosRules();
                createParticles(200);
            });

            document.getElementById('harmony').addEventListener('click', () => {
                harmonyRules();
                createParticles(200);
            });

            document.getElementById('predator').addEventListener('click', () => {
                predatorRules();
                createParticles(200);
            });

            document.getElementById('random').addEventListener('click', () => {
                randomRules();
                createParticles(200);
            });

            // Init
            randomRules();
            createParticles(200);
            draw();
        </script>
    </body>
    </html>
    """
    components.html(particle_html, height=620)

# --- SYNTH LAB (EGG #7) ---
def render_synth_lab():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_synth_back"):
            return_to_hub()
            st.rerun()

    synth_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background: linear-gradient(180deg, #0a0015 0%, #150025 100%);
                font-family: 'Courier New', monospace;
                min-height: 100vh;
                touch-action: manipulation;
                -webkit-user-select: none;
            }

            .container {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 15px;
                max-width: 400px;
                margin: 0 auto;
            }

            .title {
                color: #00efff;
                font-size: 1.4rem;
                margin-bottom: 5px;
                text-shadow: 0 0 30px rgba(0, 239, 255, 0.5);
            }

            .subtitle {
                color: #666;
                font-size: 0.7rem;
                margin-bottom: 15px;
            }

            /* Visualizer */
            #visualizer {
                width: 100%;
                height: 80px;
                border: 1px solid #00efff;
                border-radius: 10px;
                margin-bottom: 15px;
                background: rgba(0, 20, 30, 0.5);
            }

            /* Pad Grid */
            .pad-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
                width: 100%;
                margin-bottom: 15px;
            }

            .pad {
                aspect-ratio: 1;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
                cursor: pointer;
                transition: all 0.1s;
                -webkit-tap-highlight-color: transparent;
                border: 2px solid;
            }

            .pad:active, .pad.active {
                transform: scale(0.92);
                filter: brightness(1.5);
                box-shadow: 0 0 30px var(--glow);
            }

            .pad.c { background: rgba(255, 0, 100, 0.3); border-color: #ff0064; --glow: #ff0064; }
            .pad.d { background: rgba(255, 100, 0, 0.3); border-color: #ff6400; --glow: #ff6400; }
            .pad.e { background: rgba(255, 200, 0, 0.3); border-color: #ffc800; --glow: #ffc800; }
            .pad.f { background: rgba(0, 255, 100, 0.3); border-color: #00ff64; --glow: #00ff64; }
            .pad.g { background: rgba(0, 200, 255, 0.3); border-color: #00c8ff; --glow: #00c8ff; }
            .pad.a { background: rgba(100, 0, 255, 0.3); border-color: #6400ff; --glow: #6400ff; }
            .pad.b { background: rgba(200, 0, 255, 0.3); border-color: #c800ff; --glow: #c800ff; }
            .pad.c2 { background: rgba(255, 0, 200, 0.3); border-color: #ff00c8; --glow: #ff00c8; }

            /* Controls */
            .controls {
                width: 100%;
                margin-bottom: 15px;
            }

            .control-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }

            .control-label {
                color: #888;
                font-size: 0.7rem;
                width: 60px;
            }

            .slider {
                flex: 1;
                -webkit-appearance: none;
                height: 8px;
                border-radius: 4px;
                background: rgba(0, 239, 255, 0.2);
                outline: none;
            }

            .slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #00efff;
                cursor: pointer;
            }

            /* Wave selector */
            .wave-select {
                display: flex;
                gap: 8px;
                justify-content: center;
                margin-bottom: 15px;
            }

            .wave-btn {
                padding: 10px 15px;
                background: rgba(0, 239, 255, 0.1);
                border: 1px solid #00efff;
                color: #00efff;
                border-radius: 8px;
                font-size: 0.75rem;
                cursor: pointer;
                -webkit-tap-highlight-color: transparent;
            }

            .wave-btn.active {
                background: rgba(0, 239, 255, 0.4);
            }

            .wave-btn:active {
                transform: scale(0.95);
            }

            .info {
                color: #444;
                font-size: 0.65rem;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="title">🎹 SYNTH LAB</div>
            <div class="subtitle">Sintetizador interativo</div>

            <canvas id="visualizer"></canvas>

            <div class="pad-grid">
                <div class="pad c" data-note="C4">C</div>
                <div class="pad d" data-note="D4">D</div>
                <div class="pad e" data-note="E4">E</div>
                <div class="pad f" data-note="F4">F</div>
                <div class="pad g" data-note="G4">G</div>
                <div class="pad a" data-note="A4">A</div>
                <div class="pad b" data-note="B4">B</div>
                <div class="pad c2" data-note="C5">C+</div>
            </div>

            <div class="wave-select">
                <button class="wave-btn active" data-wave="sine">Sine</button>
                <button class="wave-btn" data-wave="square">Square</button>
                <button class="wave-btn" data-wave="sawtooth">Saw</button>
                <button class="wave-btn" data-wave="triangle">Tri</button>
            </div>

            <div class="controls">
                <div class="control-row">
                    <span class="control-label">Attack</span>
                    <input type="range" class="slider" id="attack" min="0" max="1" step="0.01" value="0.1">
                </div>
                <div class="control-row">
                    <span class="control-label">Release</span>
                    <input type="range" class="slider" id="release" min="0" max="2" step="0.01" value="0.5">
                </div>
                <div class="control-row">
                    <span class="control-label">Reverb</span>
                    <input type="range" class="slider" id="reverb" min="0" max="1" step="0.01" value="0.3">
                </div>
            </div>

            <div class="info">
                Toque nos pads para criar música<br>
                Ajuste os controles para modificar o som
            </div>
        </div>

        <script>
            // Audio context
            let audioCtx = null;
            let analyser = null;
            let waveform = 'sine';

            const noteFreqs = {
                'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
                'G4': 392.00, 'A4': 440.00, 'B4': 493.88, 'C5': 523.25
            };

            function initAudio() {
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    analyser = audioCtx.createAnalyser();
                    analyser.connect(audioCtx.destination);
                    analyser.fftSize = 256;
                }
            }

            function playNote(note, pad) {
                initAudio();

                const attack = parseFloat(document.getElementById('attack').value);
                const release = parseFloat(document.getElementById('release').value);

                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = waveform;
                osc.frequency.value = noteFreqs[note];

                gain.gain.setValueAtTime(0, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + attack);
                gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + attack + release);

                osc.connect(gain);
                gain.connect(analyser);

                osc.start();
                osc.stop(audioCtx.currentTime + attack + release + 0.1);

                // Visual feedback
                pad.classList.add('active');
                setTimeout(() => pad.classList.remove('active'), 150);
            }

            // Visualizer
            const canvas = document.getElementById('visualizer');
            const ctx = canvas.getContext('2d');

            function resizeCanvas() {
                canvas.width = canvas.offsetWidth * 2;
                canvas.height = canvas.offsetHeight * 2;
                ctx.scale(2, 2);
            }
            resizeCanvas();

            function drawVisualizer() {
                const width = canvas.offsetWidth;
                const height = canvas.offsetHeight;

                ctx.fillStyle = 'rgba(0, 20, 30, 0.3)';
                ctx.fillRect(0, 0, width, height);

                if (analyser) {
                    const bufferLength = analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(bufferLength);
                    analyser.getByteTimeDomainData(dataArray);

                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#00efff';
                    ctx.beginPath();

                    const sliceWidth = width / bufferLength;
                    let x = 0;

                    for (let i = 0; i < bufferLength; i++) {
                        const v = dataArray[i] / 128.0;
                        const y = (v * height) / 2;

                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);

                        x += sliceWidth;
                    }

                    ctx.lineTo(width, height / 2);
                    ctx.stroke();

                    // Glow effect
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#00efff';
                }

                requestAnimationFrame(drawVisualizer);
            }
            drawVisualizer();

            // Pad events
            document.querySelectorAll('.pad').forEach(pad => {
                const note = pad.dataset.note;

                pad.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    playNote(note, pad);
                });

                pad.addEventListener('mousedown', () => playNote(note, pad));
            });

            // Wave selection
            document.querySelectorAll('.wave-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    waveform = btn.dataset.wave;
                });
            });
        </script>
    </body>
    </html>
    """
    components.html(synth_html, height=680)

# --- BIO-LAB: GENETIC CULTIVATOR MINI-GAME (EGG #5) ---
def render_bio_lab():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_biolab_back"):
            return_to_hub()
            st.rerun()

    logo_b64 = get_logo_base64()
    
    biolab_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;900&family=Exo+2:wght@300;600&display=swap" rel="stylesheet">
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{
                overflow: hidden;
                background: #010401;
                font-family: 'Exo 2', sans-serif;
                touch-action: none;
                color: #e2e8f0;
            }}
            canvas {{ display: block; }}
            
            /* UI PANELS */
            .glass-panel {{
                background: rgba(5, 15, 5, 0.75);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(0, 255, 65, 0.2);
                border-radius: 20px;
                padding: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                z-index: 100;
                position: absolute;
            }}

            #top-status {{
                top: 15px; left: 50%; transform: translateX(-50%);
                width: 90%; max-width: 450px;
                display: flex; justify-content: space-between; align-items: center;
                border-top: 2px solid #00ff41;
            }}

            #bottom-controls {{
                bottom: 15px; left: 50%; transform: translateX(-50%);
                width: 95%; max-width: 480px;
                display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
            }}

            #info-log {{
                top: 80px; left: 15px; width: 180px; height: 160px;
                display: flex; flex-direction: column; gap: 8px;
                font-size: 0.6rem; overflow-y: auto;
                background: rgba(0, 10, 0, 0.6);
            }}

            /* TYPOGRAPHY */
            .label {{ font-family: 'Orbitron', sans-serif; font-size: 0.55rem; color: #00ff41; letter-spacing: 1px; text-transform: uppercase; }}
            .value {{ font-weight: 800; font-size: 0.85rem; color: #fff; }}
            .phase-title {{ font-family: 'Orbitron', sans-serif; font-size: 0.75rem; color: #00ff41; }}

            /* BARS */
            .bar-container {{ width: 100%; height: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; margin-top: 4px; overflow: hidden; }}
            .bar-fill {{ height: 100%; width: 0%; transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); }}
            #water-bar {{ background: #0ea5e9; box-shadow: 0 0 10px #0ea5e9; }}
            #nutri-bar {{ background: #facc15; box-shadow: 0 0 10px #facc15; }}
            #prog-bar {{ background: linear-gradient(90deg, #00ff41, #fff); box-shadow: 0 0 15px #00ff41; }}

            /* CONTROLS */
            .ctrl-group {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }}
            .game-btn {{
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(0, 255, 65, 0.3);
                border-radius: 12px;
                padding: 10px;
                color: white;
                display: flex; flex-direction: column; align-items: center; gap: 4px;
                cursor: pointer; transition: 0.2s;
            }}
            .game-btn:active {{ transform: scale(0.95); background: rgba(0, 255, 65, 0.2); }}
            .game-btn i {{ font-size: 1.2rem; font-style: normal; }}
            .game-btn span {{ font-size: 0.5rem; text-transform: uppercase; color: #888; }}

            #phase-desc {{ font-size: 0.55rem; color: #aaa; font-style: italic; margin-top: 4px; line-height: 1.3; }}

            /* MINI VARS (Temp/Hum/Light) */
            .mini-vars {{ display: flex; gap: 15px; }}
            .mini-item {{ display: flex; flex-direction: column; align-items: center; }}
            .mini-val {{ font-size: 0.7rem; color: #fff; font-weight: bold; }}
            .mini-lbl {{ font-size: 0.45rem; color: #666; }}

            #event-msg {{
                position: absolute; top: 30%; left: 50%; transform: translateX(-50%);
                color: #00ff41; font-family: 'Orbitron', sans-serif; font-size: 1rem;
                text-shadow: 0 0 10px #00ff41; opacity: 0; pointer-events: none; z-index: 200;
            }}

            /* ANIMATIONS */
            @keyframes scanline {{ 0%{{ top: 0% }} 100%{{ top: 100% }} }}
            #scanline {{ position: fixed; top: 0; left: 0; width: 100%; height: 2px; background: rgba(0, 255, 65, 0.1); z-index: 50; animation: scanline 8s linear infinite; pointer-events: none; }}
        </style>
    </head>
    <body>
        <div id="scanline"></div>
        <div id="event-msg">SISTEMA ATIVO</div>

        <!-- TOP STATUS -->
        <div id="top-status" class="glass-panel">
            <div>
                <div class="label">Status Genético</div>
                <div id="phase-name" class="phase-title">GERMINAÇÃO</div>
                <div id="phase-desc">Aguardando ativação celular...</div>
            </div>
            <div class="mini-vars">
                <div class="mini-item"><span class="mini-val" id="val-temp">24°</span><span class="mini-lbl">TEMP</span></div>
                <div class="mini-item"><span class="mini-val" id="val-hum">60%</span><span class="mini-lbl">HUM</span></div>
                <div class="mini-item"><span class="mini-val" id="val-light">80%</span><span class="mini-lbl">UV</span></div>
            </div>
        </div>

        <!-- LOG PANEL -->
        <div id="info-log" class="glass-panel">
            <div class="label" style="border-bottom: 1px solid #333; padding-bottom: 2px;">Data_Log.exe</div>
            <div id="log-content"></div>
        </div>

        <!-- BOTTOM CONTROLS -->
        <div id="bottom-controls" class="glass-panel">
            <div>
                <div class="label">Vigor da Planta <span id="txt-health" style="float:right">100%</span></div>
                <div class="bar-container"><div id="health-bar" class="bar-fill" style="background: #10b981;"></div></div>
                <div class="label" style="margin-top: 8px;">Desenvolvimento <span id="txt-prog" style="float:right">0%</span></div>
                <div class="bar-container"><div id="prog-bar" class="bar-fill"></div></div>
            </div>
            <div class="ctrl-group">
                <button class="game-btn" onclick="game.interact('water')"><i>💧</i><span>Regar</span></button>
                <button class="game-btn" onclick="game.interact('nutri')"><i>🌱</i><span>Nutri</span></button>
                <button class="game-btn" onclick="game.interact('temp')"><i>🌡️</i><span>Temp</span></button>
                <button class="game-btn" onclick="game.interact('light')"><i>💡</i><span>Light</span></button>
            </div>
        </div>

        <canvas id="renderContext"></canvas>

        <script>
            const canvas = document.getElementById('renderContext');
            const ctx = canvas.getContext('2d');
            let w, h;

            const logoImg = new Image();
            logoImg.src = "data:image/png;base64,{logo_b64}";

            function resize() {{
                w = window.innerWidth;
                h = window.innerHeight;
                canvas.width = w * devicePixelRatio;
                canvas.height = h * devicePixelRatio;
                ctx.scale(devicePixelRatio, devicePixelRatio);
            }}
            window.addEventListener('resize', resize);
            resize();

            const game = {{
                phase: 'seed',
                progress: 1,
                health: 90,
                water: 60,
                nutri: 50,
                temp: 24,
                hum: 60,
                light: 80,
                lastTick: Date.now(),
                particles: [],

                phases: {{
                    seed: {{ name: "Germinação", desc: "A zona radicular está se estabelecendo. Mantenha umidade alta.", color: "#00ff41" }},
                    veg: {{ name: "Vegetativo", desc: "Fase de explosão fóliar. Requer alta intensidade de UV e nutrientes.", color: "#34d399" }},
                    bloom: {{ name: "Floração", desc: "Produção de resina e terpenos. Reduza a umidade para evitar mofo.", color: "#ff00de" }},
                    ready: {{ name: "Maturação", desc: "Tricomas leitosos detectados. Pronto para colheita final.", color: "#fff" }}
                }},

                init() {{
                    this.addLog("Iniciando bio-sequenciamento...");
                    this.loop();
                    this.setPhase('seed');
                }},

                setPhase(p) {{
                    this.phase = p;
                    const info = this.phases[p];
                    document.getElementById('phase-name').innerText = info.name;
                    document.getElementById('phase-name').style.color = info.color;
                    document.getElementById('phase-desc').innerText = info.desc;
                    this.addLog(`Entrando em fase: ${{info.name}}`);
                }},

                addLog(msg) {{
                    const log = document.getElementById('log-content');
                    const div = document.createElement('div');
                    div.style.color = (msg.includes('!')) ? '#f87171' : '#888';
                    div.innerText = `> ${{msg}}`;
                    log.prepend(div);
                    if (log.children.length > 8) log.lastChild.remove();
                }},

                update() {{
                    const dt = (Date.now() - this.lastTick) / 1000;
                    this.lastTick = Date.now();

                    // Natural decay
                    this.water = Math.max(0, this.water - 1.2 * dt);
                    this.nutri = Math.max(0, this.nutri - 0.8 * dt);
                    this.hum = 40 + (this.water / 2); // Humidity tied to soil water
                    
                    // Temp drift
                    this.temp += (Math.random() - 0.5) * 0.1;
                    
                    // Condition evaluation
                    let badConditions = 0;
                    if (this.water < 20 || this.water > 90) badConditions++;
                    if (this.temp < 18 || this.temp > 32) badConditions++;
                    if (this.nutri < 10) badConditions++;
                    
                    if (badConditions > 0) {{
                        this.health = Math.max(0, this.health - 2 * badConditions * dt);
                    }} else {{
                        this.health = Math.min(100, this.health + 1 * dt);
                    }}

                    // Development
                    if (this.health > 40) {{
                        const speed = (this.health / 100) * (this.light / 100) * 1.5;
                        this.progress += speed * dt;
                    }}

                    // Phase logic
                    if (this.phase === 'seed' && this.progress > 25) this.setPhase('veg');
                    if (this.phase === 'veg' && this.progress > 70) this.setPhase('bloom');
                    if (this.phase === 'bloom' && this.progress >= 100) {{
                        this.progress = 100;
                        this.setPhase('ready');
                    }}

                    this.updateUI();
                }},

                updateUI() {{
                    document.getElementById('val-temp').innerText = Math.round(this.temp) + '°';
                    document.getElementById('val-hum').innerText = Math.round(this.hum) + '%';
                    document.getElementById('val-light').innerText = Math.round(this.light) + '%';
                    
                    document.getElementById('health-bar').style.width = this.health + '%';
                    document.getElementById('prog-bar').style.width = this.progress + '%';
                    document.getElementById('txt-health').innerText = Math.round(this.health) + '%';
                    document.getElementById('txt-prog').innerText = Math.round(this.progress) + '%';
                }},

                interact(type) {{
                    if (type === 'water') {{
                        this.water = Math.min(100, this.water + 15);
                        this.addLog("Irrigação manual ativada.");
                        this.spawnParticles('#0ea5e9', 15);
                    }}
                    if (type === 'nutri') {{
                        this.nutri = Math.min(100, this.nutri + 20);
                        this.addLog("Solução nutriente injetada.");
                        this.spawnParticles('#facc15', 15);
                    }}
                    if (type === 'temp') {{
                        this.temp = 25;
                        this.addLog("ESTABILIZADOR TÉRMICO ATIVO.");
                    }}
                    if (type === 'light') {{
                        this.light = (this.light > 80) ? 50 : 100;
                        this.addLog(`Ciclo de luz: ${{Math.round(this.light)}}%`);
                    }}
                }},

                spawnParticles(color, count) {{
                    for(let i=0; i<count; i++) {{
                        this.particles.push({{
                            x: w/2 + (Math.random()-0.5)*120,
                            y: h/2 - 50,
                            vx: (Math.random()-0.5)*4,
                            vy: Math.random()*5,
                            life: 1,
                            color: color
                        }});
                    }}
                }},

                draw() {{
                    ctx.clearRect(0,0,w,h);
                    
                    // Atmosphere Glow
                    const g = ctx.createRadialGradient(w/2, h*0.6, 10, w/2, h*0.6, 300);
                    g.addColorStop(0, 'rgba(0, 40, 0, 0.4)');
                    g.addColorStop(1, 'transparent');
                    ctx.fillStyle = g;
                    ctx.fillRect(0,0,w,h);

                    this.drawPlant(w/2, h*0.7);

                    // Logo / Pot
                    if (logoImg.complete) {{
                        ctx.save();
                        ctx.shadowBlur = 25; ctx.shadowColor = '#00ff41';
                        ctx.drawImage(logoImg, w/2 - 50, h*0.7 - 50, 100, 100);
                        ctx.restore();
                    }}

                    // Particles
                    this.particles.forEach((p, idx) => {{
                        p.x += p.vx; p.y += p.vy; p.life -= 0.02;
                        if (p.life <= 0) this.particles.splice(idx, 1);
                        ctx.fillStyle = p.color;
                        ctx.globalAlpha = p.life;
                        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill();
                    }});
                }},

                drawPlant(x, y) {{
                    const s = (h/800) * (this.progress/100);
                    const tilt = Math.sin(Date.now()/1500)*0.08;

                    if (this.progress < 5) {{
                        ctx.fillStyle = '#00ff41';
                        ctx.shadowBlur = 10; ctx.shadowColor = '#00ff41';
                        ctx.beginPath(); ctx.arc(x, y-10, 4, 0, Math.PI*2); ctx.fill();
                        return;
                    }}

                    const stemH = h * 0.45 * (this.progress/100);
                    ctx.strokeStyle = '#042b04';
                    ctx.lineWidth = 14 * s + 2;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.quadraticCurveTo(x + 40*tilt, y - stemH/2, x, y - stemH);
                    ctx.stroke();

                    // Foliage
                    const nodeCount = Math.floor(this.progress/10) + 2;
                    for(let i=1; i<=nodeCount; i++) {{
                        const ny = y - (i/nodeCount)*stemH;
                        const side = (i%2 === 0) ? 1 : -1;
                        const ls = s * (1.3 - (i/nodeCount)*0.6);
                        this.drawLeaf(x, ny, ls, side*Math.PI/3 + tilt);
                    }}

                    // Flowers (Bloom)
                    if (this.phase === 'bloom' || this.phase === 'ready') {{
                        const fS = (this.progress-70)/30;
                        for(let i=0; i<6; i++) {{
                            const fy = y - stemH * (0.5 + (i/6)*0.5);
                            this.drawBud(x + (Math.random()-0.5)*15, fy, 18*fS*s);
                        }}
                    }}
                }},

                drawLeaf(x, y, s, a) {{
                    ctx.save();
                    ctx.translate(x, y); ctx.rotate(a);
                    const blades = 7;
                    for(let i=0; i<blades; i++) {{
                        const ba = ((i/(blades-1))-0.5)*Math.PI*0.8;
                        const len = (1 - Math.abs(i-3)*0.2) * 70 * s;
                        ctx.save();
                        ctx.rotate(ba);
                        const grad = ctx.createLinearGradient(0,0,0,-len);
                        grad.addColorStop(0, '#042b04'); grad.addColorStop(1, '#00ff41');
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.moveTo(0,0);
                        ctx.quadraticCurveTo(6*s, -len/2, 0, -len);
                        ctx.quadraticCurveTo(-6*s, -len/2, 0, 0);
                        ctx.fill();
                        ctx.restore();
                    }}
                    ctx.restore();
                }},

                drawBud(x, y, sz) {{
                    ctx.fillStyle = '#ff00de';
                    ctx.shadowBlur = 15; ctx.shadowColor = '#ff00de';
                    ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.globalAlpha = 0.5;
                    for(let i=0; i<4; i++) {{
                        ctx.beginPath();
                        ctx.arc(x+(Math.random()-0.5)*sz, y+(Math.random()-0.5)*sz, 2, 0, Math.PI*2);
                        ctx.fill();
                    }}
                    ctx.globalAlpha = 1;
                }},

                loop() {{
                    this.update();
                    this.draw();
                    requestAnimationFrame(() => this.loop());
                }}
            }};

            game.init();
        </script>
    </body>
    </html>
    """
    components.html(biolab_html, height=750)

# --- MATRIX RAIN (EGG #6) - INTERACTIVE VERSION ---
def render_matrix_rain():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_matrix_back"):
            return_to_hub()
            st.rerun()

    matrix_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #000; overflow: hidden; font-family: 'Orbitron', sans-serif; }
            canvas { display: block; }

            .hud {
                position: fixed; top: 20px; left: 20px;
                color: #00ff41; font-family: 'Share Tech Mono', monospace;
                font-size: 0.85rem; z-index: 100; text-shadow: 0 0 10px #00ff41;
            }
            .hud-row { margin: 5px 0; }
            .hud-label { color: #008f11; }
            .hud-value { color: #00ff41; }

            .typed-message {
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                font-family: 'Orbitron', sans-serif; font-size: 4rem;
                color: #fff; text-shadow: 0 0 30px #00ff41, 0 0 60px #00ff41;
                pointer-events: none; opacity: 0; transition: opacity 0.3s;
                z-index: 200; text-align: center; max-width: 90vw;
            }
            .typed-message.show { opacity: 1; }

            .instructions {
                position: fixed; bottom: 20px; left: 50%;
                transform: translateX(-50%); color: #008f11;
                font-family: 'Share Tech Mono', monospace;
                font-size: 0.8rem; text-align: center; z-index: 100;
            }
            .instructions span { color: #00ff41; }

            .power-indicator {
                position: fixed; top: 20px; right: 20px;
                width: 150px; z-index: 100;
            }
            .power-bar {
                height: 8px; background: rgba(0, 255, 65, 0.2);
                border: 1px solid #00ff41; border-radius: 4px; overflow: hidden;
            }
            .power-fill {
                height: 100%; background: linear-gradient(90deg, #00ff41, #22d3ee);
                width: 0%; transition: width 0.3s;
            }
            .power-label {
                color: #008f11; font-family: 'Share Tech Mono', monospace;
                font-size: 0.7rem; margin-top: 5px; text-align: center;
            }

            .ripple {
                position: fixed; border: 2px solid #00ff41; border-radius: 50%;
                pointer-events: none; animation: rippleExpand 1s ease-out forwards;
            }
            @keyframes rippleExpand {
                0% { width: 0; height: 0; opacity: 1; }
                100% { width: 300px; height: 300px; opacity: 0; margin: -150px; }
            }

            .achievement {
                position: fixed; top: -100px; left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #fbbf24, #f59e0b);
                color: #000; padding: 15px 30px; border-radius: 50px;
                font-family: 'Orbitron', sans-serif; font-weight: 700;
                z-index: 300; transition: top 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                box-shadow: 0 10px 40px rgba(251, 191, 36, 0.5);
            }
            .achievement.show { top: 80px; }

            .combo-display {
                position: fixed; top: 50%; right: 30px;
                transform: translateY(-50%);
                font-family: 'Orbitron', sans-serif; font-size: 2rem;
                color: #fbbf24; text-shadow: 0 0 20px #fbbf24;
                opacity: 0; transition: all 0.3s; z-index: 150;
            }
            .combo-display.show { opacity: 1; transform: translateY(-50%) scale(1.2); }
        </style>
    </head>
    <body>
        <canvas id="matrix"></canvas>

        <div class="hud">
            <div class="hud-row"><span class="hud-label">STREAMS:</span> <span class="hud-value" id="streams">0</span></div>
            <div class="hud-row"><span class="hud-label">FPS:</span> <span class="hud-value" id="fps">60</span></div>
            <div class="hud-row"><span class="hud-label">SCORE:</span> <span class="hud-value" id="score">0</span></div>
            <div class="hud-row"><span class="hud-label">MODE:</span> <span class="hud-value" id="mode">NORMAL</span></div>
        </div>

        <div class="power-indicator">
            <div class="power-bar"><div class="power-fill" id="power-fill"></div></div>
            <div class="power-label">CHAOS POWER</div>
        </div>

        <div class="typed-message" id="typed-message"></div>
        <div class="combo-display" id="combo">x1</div>

        <div class="instructions">
            <span>[CLICK]</span> Ripple +10pts | <span>[TYPE]</span> Message | <span>[SPACE]</span> Chaos mode | <span>[1-5]</span> Colors
        </div>

        <div class="achievement" id="achievement"></div>

        <script>
            const canvas = document.getElementById('matrix');
            const ctx = canvas.getContext('2d');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            const colorThemes = {
                matrix: ['#00ff41', '#008f11', '#22d3ee'],
                fire: ['#ff4400', '#ff8800', '#ffcc00'],
                ice: ['#00ffff', '#0088ff', '#ffffff'],
                purple: ['#ff00de', '#8b5cf6', '#a855f7'],
                gold: ['#fbbf24', '#f59e0b', '#eab308']
            };

            let colors = colorThemes.matrix;
            const chars = 'BARROOTS$¥€£₿01アイウエオカキクケコ金融投資株式';
            const fontSize = 16;
            let columns = Math.floor(canvas.width / fontSize);
            let drops = Array(columns).fill(1);
            let speeds = Array(columns).fill(0).map(() => 0.5 + Math.random() * 1.5);

            let score = 0, combo = 1, comboTimer = null;
            let chaosPower = 0, chaosMode = false;
            let typedText = '', typedTimeout = null;
            let frameCount = 0, lastTime = performance.now(), fps = 60;

            const achievements = {
                first100: { u: false, t: '🎯 First 100 Points!' },
                chaos: { u: false, t: '🌀 CHAOS UNLEASHED!' },
                combo5: { u: false, t: '🔥 5x Combo!' },
                score1000: { u: false, t: '💰 1000 Points!' },
                colorist: { u: false, t: '🎨 Color Master!' }
            };

            function showAchievement(key) {
                if (achievements[key].u) return;
                achievements[key].u = true;
                const el = document.getElementById('achievement');
                el.textContent = achievements[key].t;
                el.classList.add('show');
                setTimeout(() => el.classList.remove('show'), 3000);
            }

            function addScore(pts) {
                score += pts * combo;
                clearTimeout(comboTimer);
                combo = Math.min(10, combo + 1);
                document.getElementById('combo').textContent = 'x' + combo;
                document.getElementById('combo').classList.add('show');
                comboTimer = setTimeout(() => {
                    combo = 1;
                    document.getElementById('combo').classList.remove('show');
                }, 2000);

                if (score >= 100 && !achievements.first100.u) showAchievement('first100');
                if (score >= 1000 && !achievements.score1000.u) showAchievement('score1000');
                if (combo >= 5 && !achievements.combo5.u) showAchievement('combo5');
            }

            function createRipple(x, y) {
                const ripple = document.createElement('div');
                ripple.className = 'ripple';
                ripple.style.left = x + 'px';
                ripple.style.top = y + 'px';
                ripple.style.borderColor = colors[0];
                document.body.appendChild(ripple);
                setTimeout(() => ripple.remove(), 1000);

                const col = Math.floor(x / fontSize);
                for (let i = Math.max(0, col - 5); i < Math.min(columns, col + 5); i++) {
                    drops[i] = Math.random() * 10;
                    speeds[i] = 2 + Math.random() * 3;
                }
            }

            function draw() {
                const fadeAlpha = chaosMode ? 0.02 : 0.05;
                ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.font = fontSize + 'px monospace';

                for (let i = 0; i < drops.length; i++) {
                    const char = chars[Math.floor(Math.random() * chars.length)];
                    let color = colors[Math.floor(Math.random() * colors.length)];

                    if (chaosMode) {
                        color = `hsl(${(Date.now() / 10 + i * 10) % 360}, 100%, 50%)`;
                        speeds[i] = 1 + Math.sin(Date.now() / 500 + i) * 2;
                    }

                    if (Math.random() > 0.9) {
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = color;
                    } else {
                        ctx.fillStyle = color;
                        ctx.shadowBlur = 0;
                    }

                    ctx.fillText(char, i * fontSize, drops[i] * fontSize);
                    ctx.shadowBlur = 0;

                    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                        drops[i] = 0;
                        speeds[i] = 0.5 + Math.random() * 1.5;
                    }
                    drops[i] += speeds[i];
                }

                frameCount++;
                const now = performance.now();
                if (now - lastTime >= 1000) {
                    fps = frameCount;
                    frameCount = 0;
                    lastTime = now;
                }

                document.getElementById('streams').textContent = columns;
                document.getElementById('fps').textContent = fps;
                document.getElementById('score').textContent = score;
                document.getElementById('mode').textContent = chaosMode ? 'CHAOS' : 'NORMAL';
                document.getElementById('power-fill').style.width = chaosPower + '%';

                if (!chaosMode && chaosPower > 0) chaosPower = Math.max(0, chaosPower - 0.1);

                requestAnimationFrame(draw);
            }

            canvas.addEventListener('click', (e) => {
                addScore(10);
                chaosPower = Math.min(100, chaosPower + 5);
                createRipple(e.clientX, e.clientY);
            });

            document.addEventListener('keydown', (e) => {
                if (e.code === 'Space') {
                    e.preventDefault();
                    if (chaosPower >= 50) {
                        chaosMode = !chaosMode;
                        chaosPower = chaosMode ? chaosPower : 0;
                        if (chaosMode) showAchievement('chaos');
                    }
                    return;
                }

                if (e.key >= '1' && e.key <= '5') {
                    const themes = Object.keys(colorThemes);
                    colors = colorThemes[themes[parseInt(e.key) - 1]];
                    showAchievement('colorist');
                    return;
                }

                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                    addScore(5);
                    typedText += e.key.toUpperCase();
                    if (typedText.length > 20) typedText = typedText.slice(-20);
                    const msgEl = document.getElementById('typed-message');
                    msgEl.textContent = typedText;
                    msgEl.classList.add('show');
                    clearTimeout(typedTimeout);
                    typedTimeout = setTimeout(() => {
                        msgEl.classList.remove('show');
                        typedText = '';
                    }, 2000);
                    chaosPower = Math.min(100, chaosPower + 2);
                }
            });

            window.addEventListener('resize', () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                columns = Math.floor(canvas.width / fontSize);
                drops = Array(columns).fill(1);
                speeds = Array(columns).fill(0).map(() => 0.5 + Math.random() * 1.5);
            });

            draw();
        </script>
    </body>
    </html>
    """
    components.html(matrix_html, height=700)

# --- CONFETTI PARTY (EGG #7) - CLICKER GAME ---
def render_confetti_party():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_confetti_back"):
            return_to_hub()
            st.rerun()

    confetti_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%);
                min-height: 100vh; overflow: hidden; font-family: 'Orbitron', sans-serif;
            }
            canvas { position: fixed; top: 0; left: 0; pointer-events: none; z-index: 5; }

            .game-ui {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                display: flex; flex-direction: column; align-items: center;
                justify-content: center; z-index: 10;
            }

            .stats-bar {
                position: fixed; top: 20px; left: 20px; right: 20px;
                display: flex; justify-content: space-between; gap: 20px;
                z-index: 100;
            }
            .stat-box {
                background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3);
                padding: 15px 25px; border-radius: 12px; text-align: center; flex: 1;
            }
            .stat-label { font-size: 0.7rem; color: #a5b4fc; margin-bottom: 5px; }
            .stat-value { font-size: 1.5rem; color: #fff; font-weight: 700; }
            .stat-value.gold { color: #fbbf24; }

            .main-btn {
                width: 200px; height: 200px; border-radius: 50%;
                background: linear-gradient(135deg, #6366f1, #a855f7);
                border: 4px solid #fff; font-size: 4rem;
                cursor: pointer; transition: all 0.1s;
                box-shadow: 0 0 60px rgba(99, 102, 241, 0.5);
                display: flex; align-items: center; justify-content: center;
            }
            .main-btn:hover { transform: scale(1.05); box-shadow: 0 0 80px rgba(99, 102, 241, 0.7); }
            .main-btn:active { transform: scale(0.9); }
            .main-btn.fever { animation: feverPulse 0.2s infinite; background: linear-gradient(135deg, #f59e0b, #ef4444); }
            @keyframes feverPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }

            .multiplier {
                margin-top: 20px; font-size: 2rem; color: #fbbf24;
                text-shadow: 0 0 20px #fbbf24; opacity: 0;
                transition: all 0.3s; transform: scale(0.5);
            }
            .multiplier.show { opacity: 1; transform: scale(1); }

            .powerups {
                position: fixed; bottom: 20px; left: 50%;
                transform: translateX(-50%);
                display: flex; gap: 15px; z-index: 100;
            }
            .powerup-btn {
                width: 70px; height: 70px; border-radius: 12px;
                border: 2px solid #333; background: rgba(0,0,0,0.5);
                font-size: 1.8rem; cursor: pointer; transition: all 0.3s;
                display: flex; align-items: center; justify-content: center;
                flex-direction: column; position: relative;
            }
            .powerup-btn:hover:not(:disabled) { border-color: #6366f1; transform: translateY(-5px); }
            .powerup-btn:disabled { opacity: 0.3; cursor: not-allowed; }
            .powerup-btn .cost {
                position: absolute; bottom: -20px; font-size: 0.6rem;
                color: #fbbf24; font-family: 'Share Tech Mono', monospace;
            }
            .powerup-btn.active { border-color: #fbbf24; box-shadow: 0 0 20px rgba(251, 191, 36, 0.5); }

            .floating-text {
                position: fixed; pointer-events: none; font-weight: 700;
                font-size: 1.5rem; animation: floatUp 1s ease-out forwards; z-index: 200;
            }
            @keyframes floatUp {
                0% { opacity: 1; transform: translateY(0) scale(1); }
                100% { opacity: 0; transform: translateY(-100px) scale(1.5); }
            }

            .progress-bar {
                width: 200px; height: 8px; background: rgba(255,255,255,0.1);
                border-radius: 4px; margin-top: 15px; overflow: hidden;
            }
            .progress-fill {
                height: 100%; background: linear-gradient(90deg, #fbbf24, #ef4444);
                width: 0%; transition: width 0.1s;
            }

            .level-up {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                font-size: 3rem; color: #fbbf24; text-shadow: 0 0 30px #fbbf24;
                opacity: 0; pointer-events: none; z-index: 300;
            }
            .level-up.show { animation: levelUpAnim 1.5s ease-out forwards; }
            @keyframes levelUpAnim {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                20% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(2); }
            }
        </style>
    </head>
    <body>
        <canvas id="confetti"></canvas>

        <div class="stats-bar">
            <div class="stat-box">
                <div class="stat-label">CONFETTI</div>
                <div class="stat-value gold" id="points">0</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">PER CLICK</div>
                <div class="stat-value" id="perClick">1</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">AUTO/SEC</div>
                <div class="stat-value" id="autoRate">0</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">LEVEL</div>
                <div class="stat-value" id="level">1</div>
            </div>
        </div>

        <div class="game-ui">
            <button class="main-btn" id="main-btn">🎉</button>
            <div class="multiplier" id="multiplier">x1</div>
            <div class="progress-bar"><div class="progress-fill" id="progress"></div></div>
        </div>

        <div class="powerups">
            <button class="powerup-btn" id="pu-click" title="Double Click Power">
                👆<span class="cost">100</span>
            </button>
            <button class="powerup-btn" id="pu-auto" title="Auto Clicker">
                🤖<span class="cost">250</span>
            </button>
            <button class="powerup-btn" id="pu-fever" title="Fever Mode (10s)">
                🔥<span class="cost">500</span>
            </button>
            <button class="powerup-btn" id="pu-boom" title="Mega Explosion">
                💥<span class="cost">1000</span>
            </button>
        </div>

        <div class="level-up" id="level-up">LEVEL UP!</div>

        <script>
            const canvas = document.getElementById('confetti');
            const ctx = canvas.getContext('2d');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            // Game State
            let points = 0, perClick = 1, autoRate = 0, level = 1;
            let combo = 1, comboTimer = null, feverMode = false;
            let confettis = [], floatingTexts = [];

            const colors = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#22d3ee', '#f472b6', '#34d399'];

            const costs = { click: 100, auto: 250, fever: 500, boom: 1000 };

            class Confetti {
                constructor(x, y, explosive = false) {
                    this.x = x; this.y = y;
                    this.size = explosive ? Math.random() * 15 + 8 : Math.random() * 10 + 5;
                    this.color = colors[Math.floor(Math.random() * colors.length)];
                    const force = explosive ? 25 : 15;
                    this.speedX = (Math.random() - 0.5) * force;
                    this.speedY = Math.random() * -force - 5;
                    this.gravity = 0.3;
                    this.rotation = Math.random() * 360;
                    this.rotationSpeed = (Math.random() - 0.5) * 15;
                    this.opacity = 1;
                    this.shapes = ['rect', 'circle', 'star', 'heart'];
                    this.shape = this.shapes[Math.floor(Math.random() * this.shapes.length)];
                }

                update() {
                    this.speedY += this.gravity;
                    this.x += this.speedX;
                    this.y += this.speedY;
                    this.rotation += this.rotationSpeed;
                    this.opacity -= 0.008;
                }

                draw() {
                    ctx.save();
                    ctx.translate(this.x, this.y);
                    ctx.rotate(this.rotation * Math.PI / 180);
                    ctx.globalAlpha = this.opacity;
                    ctx.fillStyle = this.color;

                    if (this.shape === 'rect') {
                        ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
                    } else if (this.shape === 'circle') {
                        ctx.beginPath();
                        ctx.arc(0, 0, this.size/2, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (this.shape === 'star') {
                        this.drawStar(ctx, 0, 0, 5, this.size/2, this.size/4);
                    } else if (this.shape === 'heart') {
                        this.drawHeart(ctx, 0, 0, this.size);
                    }
                    ctx.restore();
                }

                drawStar(ctx, cx, cy, spikes, outerR, innerR) {
                    ctx.beginPath();
                    for (let i = 0; i < spikes * 2; i++) {
                        const r = i % 2 === 0 ? outerR : innerR;
                        const angle = (i * Math.PI) / spikes - Math.PI / 2;
                        ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
                    }
                    ctx.closePath();
                    ctx.fill();
                }

                drawHeart(ctx, x, y, size) {
                    ctx.beginPath();
                    ctx.moveTo(x, y + size / 4);
                    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size / 4);
                    ctx.bezierCurveTo(x - size / 2, y + size / 2, x, y + size * 0.7, x, y + size * 0.7);
                    ctx.bezierCurveTo(x, y + size * 0.7, x + size / 2, y + size / 2, x + size / 2, y + size / 4);
                    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + size / 4);
                    ctx.fill();
                }
            }

            function createFloatingText(x, y, text, color = '#fbbf24') {
                const el = document.createElement('div');
                el.className = 'floating-text';
                el.style.left = x + 'px';
                el.style.top = y + 'px';
                el.style.color = color;
                el.textContent = text;
                document.body.appendChild(el);
                setTimeout(() => el.remove(), 1000);
            }

            function explode(x, y, count = 50, explosive = false) {
                for (let i = 0; i < count; i++) {
                    confettis.push(new Confetti(x, y, explosive));
                }
            }

            function addPoints(amount, x, y) {
                const total = Math.floor(amount * combo * (feverMode ? 3 : 1));
                points += total;
                createFloatingText(x, y, '+' + total);
                updateUI();
                checkLevelUp();
            }

            function updateUI() {
                document.getElementById('points').textContent = Math.floor(points);
                document.getElementById('perClick').textContent = perClick;
                document.getElementById('autoRate').textContent = autoRate;
                document.getElementById('level').textContent = level;

                // Update powerup buttons
                document.getElementById('pu-click').disabled = points < costs.click;
                document.getElementById('pu-auto').disabled = points < costs.auto;
                document.getElementById('pu-fever').disabled = points < costs.fever || feverMode;
                document.getElementById('pu-boom').disabled = points < costs.boom;
            }

            function checkLevelUp() {
                const nextLevel = Math.floor(points / 1000) + 1;
                if (nextLevel > level) {
                    level = nextLevel;
                    perClick = Math.floor(1 + level * 0.5);
                    document.getElementById('level-up').classList.add('show');
                    setTimeout(() => document.getElementById('level-up').classList.remove('show'), 1500);

                    // Big celebration
                    for (let i = 0; i < 5; i++) {
                        setTimeout(() => {
                            explode(Math.random() * canvas.width, Math.random() * canvas.height * 0.7, 80, true);
                        }, i * 100);
                    }
                }

                // Progress to next level
                const progress = ((points % 1000) / 1000) * 100;
                document.getElementById('progress').style.width = progress + '%';
            }

            function handleClick(e) {
                const rect = e.target.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;

                addPoints(perClick, x, y);
                explode(x, y, feverMode ? 80 : 30);

                // Combo system
                clearTimeout(comboTimer);
                combo = Math.min(10, combo + 0.5);
                document.getElementById('multiplier').textContent = 'x' + combo.toFixed(1);
                document.getElementById('multiplier').classList.add('show');
                comboTimer = setTimeout(() => {
                    combo = 1;
                    document.getElementById('multiplier').classList.remove('show');
                }, 1000);
            }

            // Main button
            document.getElementById('main-btn').addEventListener('click', handleClick);

            // Powerups
            document.getElementById('pu-click').addEventListener('click', () => {
                if (points >= costs.click) {
                    points -= costs.click;
                    perClick += 1;
                    costs.click = Math.floor(costs.click * 1.5);
                    document.querySelector('#pu-click .cost').textContent = costs.click;
                    updateUI();
                }
            });

            document.getElementById('pu-auto').addEventListener('click', () => {
                if (points >= costs.auto) {
                    points -= costs.auto;
                    autoRate += 1;
                    costs.auto = Math.floor(costs.auto * 1.5);
                    document.querySelector('#pu-auto .cost').textContent = costs.auto;
                    updateUI();
                }
            });

            document.getElementById('pu-fever').addEventListener('click', () => {
                if (points >= costs.fever && !feverMode) {
                    points -= costs.fever;
                    feverMode = true;
                    document.getElementById('main-btn').classList.add('fever');
                    setTimeout(() => {
                        feverMode = false;
                        document.getElementById('main-btn').classList.remove('fever');
                    }, 10000);
                    updateUI();
                }
            });

            document.getElementById('pu-boom').addEventListener('click', () => {
                if (points >= costs.boom) {
                    points -= costs.boom;
                    for (let i = 0; i < 10; i++) {
                        setTimeout(() => {
                            const x = Math.random() * canvas.width;
                            const y = Math.random() * canvas.height;
                            explode(x, y, 100, true);
                            addPoints(50, x, y);
                        }, i * 100);
                    }
                    updateUI();
                }
            });

            // Auto clicker
            setInterval(() => {
                if (autoRate > 0) {
                    const x = canvas.width / 2;
                    const y = canvas.height / 2;
                    addPoints(autoRate, x, y);
                    if (Math.random() > 0.7) explode(x, y, 10);
                }
            }, 1000);

            // Animation loop
            function animate() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                confettis = confettis.filter(c => c.opacity > 0);
                confettis.forEach(c => { c.update(); c.draw(); });
                requestAnimationFrame(animate);
            }

            window.addEventListener('resize', () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            });

            updateUI();
            animate();
        </script>
    </body>
    </html>
    """
    components.html(confetti_html, height=700)

# --- CYBER GLITCH (EGG #8) - INTERACTIVE HACKER TERMINAL ---
def render_cyber_glitch():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_glitch_back"):
            return_to_hub()
            st.rerun()

    glitch_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background: #0a0a0a; min-height: 100vh; overflow: hidden;
                font-family: 'Share Tech Mono', monospace; padding: 20px;
            }

            .terminal-window {
                background: rgba(0, 20, 0, 0.9); border: 2px solid #00ff41;
                border-radius: 8px; max-width: 900px; margin: 0 auto;
                box-shadow: 0 0 50px rgba(0, 255, 65, 0.2);
            }

            .terminal-header {
                background: linear-gradient(90deg, #1a1a1a, #2a2a2a);
                padding: 10px 15px; border-bottom: 1px solid #00ff41;
                display: flex; align-items: center; gap: 10px;
            }
            .terminal-btn { width: 12px; height: 12px; border-radius: 50%; }
            .btn-red { background: #ff5f56; }
            .btn-yellow { background: #ffbd2e; }
            .btn-green { background: #27ca3f; }
            .terminal-title {
                color: #00ff41; font-size: 0.8rem; margin-left: 10px;
                font-family: 'Orbitron', sans-serif;
            }

            .terminal-body {
                padding: 20px; height: 500px; overflow-y: auto;
                font-size: 0.9rem; line-height: 1.6;
            }
            .terminal-body::-webkit-scrollbar { width: 8px; }
            .terminal-body::-webkit-scrollbar-track { background: #0a0a0a; }
            .terminal-body::-webkit-scrollbar-thumb { background: #00ff41; border-radius: 4px; }

            .output-line { margin: 3px 0; }
            .output-line.system { color: #00ff41; }
            .output-line.error { color: #ff4444; }
            .output-line.warning { color: #fbbf24; }
            .output-line.info { color: #22d3ee; }
            .output-line.success { color: #34d399; }
            .output-line.ascii { color: #a5b4fc; white-space: pre; font-size: 0.7rem; }

            .input-line {
                display: flex; align-items: center; margin-top: 10px;
            }
            .prompt { color: #00ff41; margin-right: 10px; }
            .input-field {
                flex: 1; background: transparent; border: none;
                color: #00ff41; font-family: inherit; font-size: inherit;
                outline: none; caret-color: #00ff41;
            }

            .scanline {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: repeating-linear-gradient(
                    0deg, rgba(0, 0, 0, 0.1) 0px, rgba(0, 0, 0, 0.1) 1px,
                    transparent 1px, transparent 2px
                );
                pointer-events: none; z-index: 100; animation: scanMove 8s linear infinite;
            }
            @keyframes scanMove {
                0% { transform: translateY(0); }
                100% { transform: translateY(100%); }
            }

            .glitch-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                pointer-events: none; z-index: 101; opacity: 0;
            }
            .glitch-overlay.active {
                animation: glitchFlash 0.5s ease-out;
            }
            @keyframes glitchFlash {
                0% { opacity: 0.8; background: #ff00de; }
                50% { opacity: 0.5; background: #00ff41; }
                100% { opacity: 0; }
            }

            .status-bar {
                position: fixed; bottom: 0; left: 0; right: 0;
                background: #111; padding: 8px 20px;
                display: flex; justify-content: space-between;
                font-size: 0.75rem; color: #666; border-top: 1px solid #333;
            }
            .status-bar span { color: #00ff41; }

            .achievement-popup {
                position: fixed; top: 20px; right: -400px;
                background: linear-gradient(135deg, #fbbf24, #f59e0b);
                color: #000; padding: 15px 25px; border-radius: 8px;
                font-weight: 700; transition: right 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                z-index: 200; box-shadow: 0 10px 40px rgba(251, 191, 36, 0.5);
            }
            .achievement-popup.show { right: 20px; }
        </style>
    </head>
    <body>
        <div class="scanline"></div>
        <div class="glitch-overlay" id="glitch-overlay"></div>

        <div class="terminal-window">
            <div class="terminal-header">
                <div class="terminal-btn btn-red"></div>
                <div class="terminal-btn btn-yellow"></div>
                <div class="terminal-btn btn-green"></div>
                <span class="terminal-title">BARROOTS_TERMINAL v3.14</span>
            </div>
            <div class="terminal-body" id="terminal-body">
                <div class="output-line ascii">
 ██████╗██╗   ██╗██████╗ ███████╗██████╗
██╔════╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗
██║      ╚████╔╝ ██████╔╝█████╗  ██████╔╝
██║       ╚██╔╝  ██╔══██╗██╔══╝  ██╔══██╗
╚██████╗   ██║   ██████╔╝███████╗██║  ██║
 ╚═════╝   ╚═╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝
                </div>
                <div class="output-line system">[SYSTEM] Welcome to BARROOTS Cyber Terminal</div>
                <div class="output-line info">[INFO] Type 'help' for available commands</div>
            </div>
            <div class="input-line">
                <span class="prompt">root@barroots:~$</span>
                <input type="text" class="input-field" id="input-field" autofocus autocomplete="off">
            </div>
        </div>

        <div class="status-bar">
            <div>STATUS: <span>CONNECTED</span> | UPTIME: <span id="uptime">00:00:00</span></div>
            <div>COMMANDS: <span id="cmd-count">0</span> | LEVEL: <span id="level">ROOKIE</span></div>
        </div>

        <div class="achievement-popup" id="achievement"></div>

        <script>
            const terminal = document.getElementById('terminal-body');
            const input = document.getElementById('input-field');
            const glitchOverlay = document.getElementById('glitch-overlay');

            let commandCount = 0;
            let startTime = Date.now();
            let secretsFound = 0;
            const history = [];
            let historyIndex = -1;

            const achievements = {
                first: { u: false, t: '🎯 First Command!' },
                hacker: { u: false, t: '💻 Hacker Mode!' },
                explorer: { u: false, t: '🔍 Secret Hunter!' },
                master: { u: false, t: '👑 Terminal Master!' },
                glitcher: { u: false, t: '👾 Glitch Lord!' }
            };

            const secrets = {
                'barroots': 'You found the secret word! 🌿',
                '42': 'The answer to life, universe, and everything!',
                'konami': '↑↑↓↓←→←→BA - Classic!',
                'neo': 'Follow the white rabbit...',
                'hack': 'You are already in. 😎',
                'money': '💰💰💰 STONKS! 📈',
                'crypto': '₿ To the moon! 🚀',
                'matrix': 'There is no spoon.',
                'password': 'Nice try! The password is... just kidding.',
                'sudo': 'With great power comes great responsibility.'
            };

            const commands = {
                help: () => [
                    { t: 'system', m: '╔══════════════════════════════════════╗' },
                    { t: 'system', m: '║       AVAILABLE COMMANDS             ║' },
                    { t: 'system', m: '╠══════════════════════════════════════╣' },
                    { t: 'info', m: '║ help     - Show this menu            ║' },
                    { t: 'info', m: '║ clear    - Clear terminal            ║' },
                    { t: 'info', m: '║ status   - System status             ║' },
                    { t: 'info', m: '║ scan     - Scan network              ║' },
                    { t: 'info', m: '║ decrypt  - Decrypt files             ║' },
                    { t: 'info', m: '║ hack     - Initiate hack sequence    ║' },
                    { t: 'info', m: '║ portfolio- View portfolio data       ║' },
                    { t: 'info', m: '║ glitch   - Trigger glitch effect     ║' },
                    { t: 'info', m: '║ matrix   - Enter the matrix          ║' },
                    { t: 'info', m: '║ fortune  - Get your fortune          ║' },
                    { t: 'info', m: '║ secrets  - Find hidden secrets       ║' },
                    { t: 'system', m: '╚══════════════════════════════════════╝' }
                ],

                clear: () => {
                    terminal.innerHTML = '';
                    return [];
                },

                status: () => [
                    { t: 'system', m: '[SYSTEM STATUS]' },
                    { t: 'success', m: '  CPU: ████████░░ 82%' },
                    { t: 'success', m: '  RAM: ██████░░░░ 64%' },
                    { t: 'warning', m: '  NET: █████████░ 91%' },
                    { t: 'success', m: '  SEC: ██████████ 100% SECURE' },
                    { t: 'info', m: '  Commands executed: ' + commandCount }
                ],

                scan: () => {
                    triggerGlitch();
                    return [
                        { t: 'system', m: '[SCANNING NETWORK...]' },
                        { t: 'info', m: '  192.168.1.1 - Router (SECURE)' },
                        { t: 'info', m: '  192.168.1.42 - BARROOTS_SERVER' },
                        { t: 'warning', m: '  192.168.1.66 - Unknown Device' },
                        { t: 'success', m: '  192.168.1.100 - Your Machine' },
                        { t: 'system', m: '[SCAN COMPLETE] 4 devices found' }
                    ];
                },

                decrypt: () => {
                    triggerGlitch();
                    return [
                        { t: 'system', m: '[DECRYPTING FILES...]' },
                        { t: 'info', m: '  ████░░░░░░ 40%' },
                        { t: 'info', m: '  ████████░░ 80%' },
                        { t: 'success', m: '  ██████████ 100%' },
                        { t: 'success', m: '[DECRYPTION COMPLETE]' },
                        { t: 'warning', m: '  SECRET: Your portfolio is looking good! 📈' }
                    ];
                },

                hack: () => {
                    triggerGlitch();
                    showAchievement('hacker');
                    return [
                        { t: 'error', m: '[WARNING] INITIATING HACK SEQUENCE...' },
                        { t: 'system', m: '  Bypassing firewall...' },
                        { t: 'system', m: '  Injecting payload...' },
                        { t: 'system', m: '  Escalating privileges...' },
                        { t: 'success', m: '[SUCCESS] ACCESS GRANTED' },
                        { t: 'warning', m: '  Just kidding. This is a simulation. 😎' }
                    ];
                },

                portfolio: () => [
                    { t: 'system', m: '[PORTFOLIO DATA]' },
                    { t: 'success', m: '  Total: R$ ∞' },
                    { t: 'info', m: '  Stocks: █████████░ 90%' },
                    { t: 'info', m: '  Crypto: ██░░░░░░░░ 20%' },
                    { t: 'info', m: '  Fixed:  ████░░░░░░ 40%' },
                    { t: 'success', m: '  Status: TO THE MOON 🚀' }
                ],

                glitch: () => {
                    for (let i = 0; i < 5; i++) {
                        setTimeout(triggerGlitch, i * 200);
                    }
                    showAchievement('glitcher');
                    return [{ t: 'error', m: '[GLITCH ACTIVATED] R̷E̷A̷L̷I̷T̷Y̷ ̷C̷O̷R̷R̷U̷P̷T̷E̷D̷' }];
                },

                matrix: () => {
                    triggerGlitch();
                    return [
                        { t: 'success', m: '  Wake up, Neo...' },
                        { t: 'success', m: '  The Matrix has you...' },
                        { t: 'success', m: '  Follow the white rabbit.' },
                        { t: 'warning', m: '  Knock, knock, Neo.' }
                    ];
                },

                fortune: () => {
                    const fortunes = [
                        '💰 Your investments will multiply soon!',
                        '📈 A bull market approaches...',
                        '🚀 Prepare for liftoff!',
                        '💎 Diamond hands will be rewarded.',
                        '🌙 Buy the dip, hold the rip!',
                        '🔮 The stars align for financial success.',
                        '⚡ Great gains await the patient.',
                        '🎯 Trust the process.'
                    ];
                    return [{ t: 'warning', m: fortunes[Math.floor(Math.random() * fortunes.length)] }];
                },

                secrets: () => {
                    showAchievement('explorer');
                    return [
                        { t: 'system', m: '[SECRET WORDS HINT]' },
                        { t: 'info', m: '  Try typing: barroots, 42, neo, hack...' },
                        { t: 'info', m: '  There are ' + Object.keys(secrets).length + ' secrets to find!' },
                        { t: 'warning', m: '  Secrets found: ' + secretsFound + '/' + Object.keys(secrets).length }
                    ];
                }
            };

            function addOutput(type, message) {
                const line = document.createElement('div');
                line.className = 'output-line ' + type;
                line.textContent = message;
                terminal.appendChild(line);
                terminal.scrollTop = terminal.scrollHeight;
            }

            function processCommand(cmd) {
                const trimmed = cmd.trim().toLowerCase();
                if (!trimmed) return;

                commandCount++;
                document.getElementById('cmd-count').textContent = commandCount;
                history.unshift(cmd);
                historyIndex = -1;

                addOutput('system', '> ' + cmd);

                // Check for secrets
                if (secrets[trimmed]) {
                    secretsFound++;
                    addOutput('success', '[SECRET FOUND] ' + secrets[trimmed]);
                    triggerGlitch();
                    if (secretsFound >= 5) showAchievement('explorer');
                    return;
                }

                // Execute command
                if (commands[trimmed]) {
                    const output = commands[trimmed]();
                    output.forEach((o, i) => {
                        setTimeout(() => addOutput(o.t, o.m), i * 100);
                    });
                } else {
                    addOutput('error', '[ERROR] Command not found: ' + trimmed);
                    addOutput('info', '[HINT] Type "help" for available commands');
                }

                // Achievements
                if (commandCount === 1) showAchievement('first');
                if (commandCount >= 20) showAchievement('master');

                // Update level
                const levels = ['ROOKIE', 'HACKER', 'ELITE', 'MASTER', 'LEGEND'];
                const lvl = Math.min(4, Math.floor(commandCount / 10));
                document.getElementById('level').textContent = levels[lvl];
            }

            function triggerGlitch() {
                glitchOverlay.classList.add('active');
                setTimeout(() => glitchOverlay.classList.remove('active'), 500);
            }

            function showAchievement(key) {
                if (achievements[key].u) return;
                achievements[key].u = true;
                const el = document.getElementById('achievement');
                el.textContent = achievements[key].t;
                el.classList.add('show');
                setTimeout(() => el.classList.remove('show'), 3000);
            }

            // Input handling
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    processCommand(input.value);
                    input.value = '';
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (historyIndex < history.length - 1) {
                        historyIndex++;
                        input.value = history[historyIndex];
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (historyIndex > 0) {
                        historyIndex--;
                        input.value = history[historyIndex];
                    } else {
                        historyIndex = -1;
                        input.value = '';
                    }
                }
            });

            // Uptime counter
            setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
                const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
                const s = String(elapsed % 60).padStart(2, '0');
                document.getElementById('uptime').textContent = h + ':' + m + ':' + s;
            }, 1000);

            // Random glitch
            setInterval(() => {
                if (Math.random() > 0.98) triggerGlitch();
            }, 2000);

            // Focus input on click
            document.addEventListener('click', () => input.focus());
        </script>
    </body>
    </html>
    """
    components.html(glitch_html, height=700)

# --- ALPHA CAMBIAL LOGIC (EGG #9) ---
def render_fx_pnl():
    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_fxpnl_back"):
            return_to_hub()
            st.rerun()

    with st.spinner("Calculando alfa cambial..."):
        df_assets  = load_assets()
        df_cambio  = load_cambio()

    if df_assets.empty:
        st.warning("Sem dados de portfólio disponíveis.")
        return

    df_pos, _ = calcular_carteira_fechada(df_assets)
    if df_pos.empty:
        st.warning("Nenhuma posição aberta encontrada.")
        return

    # ── Market data ──
    tickers = df_pos['Ticker'].tolist()
    for t in ['BRL=X', 'EURBRL=X', 'CADBRL=X']:
        if t not in tickers:
            tickers.append(t)
    map_prices, _ = fetch_market_data(tickers)

    rates = {
        'USD': map_prices.get('BRL=X',    5.50),
        'EUR': map_prices.get('EURBRL=X', 6.00),
        'CAD': map_prices.get('CADBRL=X', 4.00),
        'BRL': 1.0,
    }
    CURRENCY_META = {
        'USD': {'flag': '🇺🇸', 'symbol': 'USD'},
        'EUR': {'flag': '🇪🇺', 'symbol': 'EUR'},
        'CAD': {'flag': '🇨🇦', 'symbol': 'CAD'},
        'BRL': {'flag': '🇧🇷', 'symbol': 'BRL'},
    }

    # ── VET (weighted avg purchase rate) per currency ──
    vet_map = {}
    if not df_cambio.empty and 'moeda_origem' in df_cambio.columns:
        for moeda in ['USD', 'EUR', 'CAD']:
            df_m = df_cambio[df_cambio['moeda_origem'].astype(str).str.upper() == moeda]
            if df_m.empty:
                continue
            if 'taxa' in df_m.columns:
                valid = df_m[df_m['taxa'] > 0]
                if not valid.empty:
                    if 'valor_origem' in valid.columns and valid['valor_origem'].sum() > 0:
                        vet_map[moeda] = (
                            (valid['taxa'] * valid['valor_origem']).sum()
                            / valid['valor_origem'].sum()
                        )
                    else:
                        vet_map[moeda] = valid['taxa'].mean()
            elif 'valor_origem' in df_m.columns and 'valor_destino' in df_m.columns:
                tot = df_m['valor_origem'].sum()
                if tot > 0:
                    vet_map[moeda] = df_m['valor_destino'].sum() / tot

    # ── Group positions by currency ──
    cdata = {}
    for _, row in df_pos.iterrows():
        moeda        = str(row['Moeda']).upper()
        ticker       = row['Ticker']
        qtd          = float(row['Qtd'])
        pm           = float(row['PM_Origem'])
        price        = float(map_prices.get(ticker, pm))
        if price <= 0:
            price = pm

        rate         = rates.get(moeda, 1.0)
        pnl_native   = (price - pm) * qtd
        pnl_brl      = pnl_native * rate
        invested_n   = pm * qtd

        if moeda not in cdata:
            cdata[moeda] = {
                'assets': [], 'pnl_native': 0.0,
                'pnl_brl': 0.0, 'invested_native': 0.0,
            }
        cdata[moeda]['assets'].append({
            'ticker':     ticker,
            'pnl_pct':    ((price / pm) - 1) * 100 if pm > 0 else 0.0,
            'pnl_native': pnl_native,
        })
        cdata[moeda]['pnl_native']     += pnl_native
        cdata[moeda]['pnl_brl']        += pnl_brl
        cdata[moeda]['invested_native'] += invested_n

    # ── FX P&L + totals ──
    total_asset_pnl_brl = 0.0
    total_fx_pnl_brl    = 0.0
    for moeda, d in cdata.items():
        rate_now       = rates.get(moeda, 1.0)
        d['rate_now']  = rate_now
        if moeda == 'BRL':
            d['vet']        = 1.0
            d['fx_pnl_brl'] = 0.0
        else:
            vet_m           = vet_map.get(moeda, rate_now)
            d['vet']        = vet_m
            d['fx_pnl_brl'] = (rate_now - vet_m) * d['invested_native']
        d['total_pnl_brl']   = d['pnl_brl'] + d['fx_pnl_brl']
        total_asset_pnl_brl += d['pnl_brl']
        total_fx_pnl_brl    += d['fx_pnl_brl']

    grand_total = total_asset_pnl_brl + total_fx_pnl_brl

    # ── Format helpers ──
    def fmt_brl(v):
        s = '+' if v >= 0 else '-'
        return f"{s}R$ {abs(v):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')

    def fmt_native(v, sym):
        s = '+' if v >= 0 else '-'
        return f"{s}{sym} {abs(v):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')

    def pc(v):
        return 'pos' if v >= 0 else 'neg'

    # ── Build currency blocks HTML ──
    sorted_currencies = sorted(
        cdata.items(), key=lambda x: abs(x[1]['invested_native']), reverse=True
    )

    blocks_html = ''
    for moeda, d in sorted_currencies:
        meta     = CURRENCY_META.get(moeda, {'flag': '💱', 'symbol': moeda})
        flag     = meta['flag']
        symbol   = meta['symbol']
        rate_now = d['rate_now']
        vet_m    = d['vet']

        # Rate badge (fx gain%)
        if moeda == 'BRL':
            rate_badge_html = ''
            rate_info_html  = '<span class="rate-info">moeda base · sem câmbio</span>'
        else:
            diff_pct = ((rate_now - vet_m) / vet_m * 100) if vet_m > 0 else 0.0
            sign     = '+' if diff_pct >= 0 else ''
            rate_badge_html = (
                f'<div class="rate-badge {pc(diff_pct)}">'
                f'câmbio {sign}{diff_pct:.1f}%</div>'
            )
            vet_label = f'VET {vet_m:.4f}' if moeda in vet_map else 'VET —'
            rate_info_html = (
                f'<span class="rate-now">R$ {rate_now:.4f} hoje</span>'
                f'<span class="rate-sep"> · </span>'
                f'<span class="rate-vet">{vet_label}</span>'
            )

        # Asset P&L
        asset_pnl_n = d['pnl_native']
        asset_pnl_b = d['pnl_brl']
        if moeda == 'BRL':
            asset_str = fmt_brl(asset_pnl_n)
        else:
            asset_str = (
                f'{fmt_native(asset_pnl_n, symbol)}'
                f'<span class="sub-brl"> &nbsp;{fmt_brl(asset_pnl_b)}</span>'
            )

        # FX P&L
        fx_pnl = d['fx_pnl_brl']
        if moeda == 'BRL':
            fx_row_html = ''
        else:
            no_vet = moeda not in vet_map
            fx_display = 'sem dados de câmbio' if no_vet else fmt_brl(fx_pnl)
            fx_cls     = 'neutral' if no_vet else pc(fx_pnl)
            fx_row_html = f'''
            <div class="pnl-row">
                <span class="pnl-label">💱 Ganho cambial</span>
                <span class="pnl-val {fx_cls}">{fx_display}</span>
            </div>'''

        # Total
        total_v   = d['total_pnl_brl']
        total_str = fmt_brl(total_v)

        # Asset chips (top 5 sorted by abs pnl%)
        top5 = sorted(d['assets'], key=lambda x: abs(x['pnl_pct']), reverse=True)[:5]
        chips = ''.join(
            f'<span class="chip {pc(a["pnl_pct"])}">'
            f'{a["ticker"]} {("+" if a["pnl_pct"] >= 0 else "")}{a["pnl_pct"]:.1f}%</span>'
            for a in top5
        )

        blocks_html += f'''
        <div class="currency-block">
            <div class="currency-header">
                <div class="currency-left">
                    <span class="currency-flag">{flag}</span>
                    <div>
                        <div class="currency-code">{moeda}</div>
                        <div class="rate-info-line">{rate_info_html}</div>
                    </div>
                </div>
                {rate_badge_html}
            </div>
            <div class="pnl-rows">
                <div class="pnl-row">
                    <span class="pnl-label">📈 Lucro nos ativos</span>
                    <span class="pnl-val {pc(asset_pnl_n)}">{asset_str}</span>
                </div>
                {fx_row_html}
                <div class="pnl-row total-row">
                    <span class="pnl-label">⚡ Total em BRL</span>
                    <span class="pnl-val {pc(total_v)}">{total_str}</span>
                </div>
            </div>
            <div class="asset-chips">{chips}</div>
        </div>'''

    # ── Summary values ──
    summary_html = f'''
        <div class="summary-row">
            <div class="sum-block">
                <div class="sum-label">P&L ATIVOS</div>
                <div class="sum-val {pc(total_asset_pnl_brl)}">{fmt_brl(total_asset_pnl_brl)}</div>
            </div>
            <div class="sum-block">
                <div class="sum-label">P&L CÂMBIO</div>
                <div class="sum-val {pc(total_fx_pnl_brl)}">{fmt_brl(total_fx_pnl_brl)}</div>
            </div>
            <div class="sum-block grand">
                <div class="sum-label">TOTAL</div>
                <div class="sum-val {pc(grand_total)}">{fmt_brl(grand_total)}</div>
            </div>
        </div>'''

    # ── Full page HTML ──
    height = max(640, 320 + len(cdata) * 230)
    components.html(f"""<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
    background: #0a0a12;
    color: #fff;
    font-family: 'Share Tech Mono', monospace;
    padding: 8px 10px 60px;
}}
.fx-page {{
    max-width: 860px;
    margin: 0 auto;
}}
.fx-header {{
    text-align: center;
    padding: 10px 0 20px;
}}
.fx-title {{
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(1.3rem, 5.5vw, 2.2rem);
    font-weight: 900;
    color: #fff;
    text-shadow: 2px 2px 0 #00ff41, -2px -2px 0 #ff00de;
    letter-spacing: 4px;
    text-transform: uppercase;
}}
.fx-subtitle {{
    font-size: clamp(0.55rem, 2vw, 0.68rem);
    color: #444;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-top: 7px;
}}
.summary-row {{
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 22px;
}}
.sum-block {{
    background: rgba(20,20,35,0.95);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 14px 8px;
    text-align: center;
}}
.sum-block.grand {{
    border-color: rgba(255,204,0,0.3);
    background: rgba(28,24,4,0.95);
}}
.sum-label {{
    font-size: clamp(0.48rem, 1.8vw, 0.58rem);
    color: #555;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 7px;
}}
.sum-val {{
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(0.62rem, 2.8vw, 1rem);
    font-weight: 700;
    line-height: 1.2;
}}
.currency-block {{
    background: rgba(13,13,22,0.97);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 18px;
    padding: 16px;
    margin-bottom: 12px;
}}
.currency-header {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 8px;
}}
.currency-left {{
    display: flex;
    align-items: center;
    gap: 12px;
}}
.currency-flag {{
    font-size: clamp(1.6rem, 5vw, 2rem);
    line-height: 1;
}}
.currency-code {{
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(1rem, 3.5vw, 1.25rem);
    font-weight: 700;
    color: #fff;
}}
.rate-info-line {{
    font-size: clamp(0.55rem, 1.8vw, 0.65rem);
    margin-top: 3px;
    line-height: 1.4;
}}
.rate-now {{ color: #999; }}
.rate-sep {{ color: #444; }}
.rate-vet {{ color: #555; }}
.rate-info {{ color: #444; font-style: italic; }}
.rate-badge {{
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(0.58rem, 1.8vw, 0.7rem);
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 20px;
    white-space: nowrap;
}}
.pnl-rows {{
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-top: 12px;
}}
.pnl-row {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    gap: 8px;
}}
.total-row {{
    border-top: 1px solid rgba(255,255,255,0.12);
    border-bottom: none;
    padding-top: 11px;
    margin-top: 3px;
}}
.pnl-label {{
    font-size: clamp(0.65rem, 2.2vw, 0.75rem);
    color: #777;
    flex-shrink: 0;
}}
.pnl-val {{
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(0.7rem, 2.5vw, 0.88rem);
    font-weight: 700;
    text-align: right;
    word-break: break-all;
}}
.total-row .pnl-val {{
    font-size: clamp(0.8rem, 3vw, 1rem);
}}
.sub-brl {{
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65em;
    opacity: 0.55;
}}
.pos     {{ color: #00ff41; }}
.neg     {{ color: #ff4455; }}
.neutral {{ color: #666; font-style: italic; }}
.sum-val.pos {{ color: #00ff41; text-shadow: 0 0 14px rgba(0,255,65,0.25); }}
.sum-val.neg {{ color: #ff4455; text-shadow: 0 0 14px rgba(255,68,85,0.25); }}
.rate-badge.pos {{ background: rgba(0,255,65,0.1);  color: #00ff41; border: 1px solid rgba(0,255,65,0.25); }}
.rate-badge.neg {{ background: rgba(255,68,85,0.1); color: #ff4455; border: 1px solid rgba(255,68,85,0.25); }}
.asset-chips {{
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 13px;
}}
.chip {{
    font-size: clamp(0.55rem, 1.8vw, 0.65rem);
    padding: 4px 9px;
    border-radius: 10px;
    white-space: nowrap;
}}
.chip.pos {{ background: rgba(0,255,65,0.08);  color: #00ff41; border: 1px solid rgba(0,255,65,0.18); }}
.chip.neg {{ background: rgba(255,68,85,0.08); color: #ff4455; border: 1px solid rgba(255,68,85,0.18); }}
.section-label {{
    font-size: clamp(0.5rem, 1.8vw, 0.58rem);
    color: #2a2a3a;
    letter-spacing: 3px;
    text-transform: uppercase;
    text-align: center;
    margin: 6px 0 16px;
}}
</style>
</head>
<body>
<div class="fx-page">
  <div class="fx-header">
    <div class="fx-title">ALPHA CAMBIAL</div>
    <div class="fx-subtitle">Lucro Real &middot; Ativo vs C&acirc;mbio &middot; Por Moeda</div>
  </div>
  {summary_html}
  <div class="section-label">// DETALHE POR MOEDA //</div>
  {blocks_html}
</div>
</body>
</html>""", height=height, scrolling=True)


# --- MAIN HUB RENDER ---
if st.session_state.active_egg is None:
    st.markdown('<div class="glitch-title">EXTRAS</div>', unsafe_allow_html=True)
    st.markdown('<p style="text-align: center; color: #666; font-size: 1.2rem; margin-bottom: 40px;">// ACESSO RESTRITO: NÍVEL 5 //</p>', unsafe_allow_html=True)
    
    r1c1, r1c2, r1c3, r1c4 = st.columns(4)
    
    with r1c1:
        # SLOT 1: SNAKE GAME
        container = st.container()
        container.markdown("""
        <div class="egg-card unlocked">
            <div class="icon">🐍</div>
            <div class="label">FINANCIAL SNAKE</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("INICIAR SISTEMA", key="btn_egg_1", use_container_width=True):
            enter_egg(1)
            st.rerun()

    with r1c2:
        # SLOT 2: BIO DOME
        container = st.container()
        container.markdown("""
        <div class="egg-card unlocked">
            <div class="icon">🧬</div>
            <div class="label">MARKET BIO-DOME</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("INICIAR SIMULAÇÃO", key="btn_egg_2", use_container_width=True):
            enter_egg(2)
            st.rerun()
            
    with r1c3:
        # SLOT 3: SOLAR SYSTEM
        container = st.container()
        container.markdown("""
        <div class="egg-card unlocked">
            <div class="icon">🪐</div>
            <div class="label">CELESTIAL ECONOMY</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("INICIAR ÓRBITA", key="btn_egg_3", use_container_width=True):
            enter_egg(3)
            st.rerun()

    with r1c4:
        # SLOT 4: GLOBAL OPS (New)
        container = st.container()
        container.markdown("""
        <div class="egg-card unlocked">
            <div class="icon">🌍</div>
            <div class="label">GLOBAL OPERATIONS</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("INICIAR UPLINK", key="btn_egg_4", use_container_width=True):
            enter_egg(4)
            st.rerun()

    # --- ROW 2: BIO-LAB ---
    r2c1, r2c2, r2c3, r2c4 = st.columns(4)
    with r2c1:
        # SLOT 5: BIO-LAB
        container = st.container()
        container.markdown("""
        <div class="egg-card unlocked">
            <div class="icon">🌿</div>
            <div class="label">BIO-LAB BREEDER</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("INICIAR CULTIVO", key="btn_egg_5", use_container_width=True):
            enter_egg(5)
            st.rerun()

    with r2c2:
        # SLOT 6: MATRIX RAIN
        container = st.container()
        container.markdown("""
        <div class="egg-card unlocked">
            <div class="icon">🔢</div>
            <div class="label">MATRIX RAIN</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("INICIAR DOWNLOAD", key="btn_egg_6", use_container_width=True):
            enter_egg(6)
            st.rerun()

    with r2c3:
        # SLOT 7: CONFETTI PARTY
        container = st.container()
        container.markdown("""
        <div class="egg-card unlocked">
            <div class="icon">🎊</div>
            <div class="label">CONFETTI PARTY</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("INICIAR FESTA", key="btn_egg_7", use_container_width=True):
            enter_egg(7)
            st.rerun()

    with r2c4:
        # SLOT 8: CYBER GLITCH
        container = st.container()
        container.markdown("""
        <div class="egg-card unlocked">
            <div class="icon">👾</div>
            <div class="label">CYBER GLITCH</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("INICIAR HACK", key="btn_egg_8", use_container_width=True):
            enter_egg(8)
            st.rerun()

    # --- ROW 3: ALPHA CAMBIAL + LOCKED SLOTS ---
    r3c1, r3c2, r3c3, r3c4 = st.columns(4)

    with r3c1:
        # SLOT 9: ALPHA CAMBIAL
        container = st.container()
        container.markdown("""
        <div class="egg-card unlocked">
            <div class="icon">💱</div>
            <div class="label">ALPHA CAMBIAL</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("INICIAR ANÁLISE", key="btn_egg_9", use_container_width=True):
            enter_egg(9)
            st.rerun()

    locked_slots = [
        ("AI CHATBOT",   "🤖"),
        ("TIME TRAVEL",  "⏳"),
        ("HOLODECK",     "🧊"),
    ]
    for i, (label, icon) in enumerate(locked_slots):
        col = [r3c2, r3c3, r3c4][i]
        with col:
            st.markdown(f"""
            <div class="egg-card locked">
                <div class="icon">{icon}</div>
                <div class="label">{label}</div>
            </div>
            """, unsafe_allow_html=True)
            st.button("BLOQUEADO", key=f"btn_lock_{i}", disabled=True, use_container_width=True)

# --- EGG ROUTER ---
elif st.session_state.active_egg == 1:
    render_snake_game()
elif st.session_state.active_egg == 2:
    render_bio_dome()
elif st.session_state.active_egg == 3:
    render_solar_system()
elif st.session_state.active_egg == 4:
    render_global_map(return_to_hub)
elif st.session_state.active_egg == 5:
    render_bio_lab()
elif st.session_state.active_egg == 6:
    render_matrix_rain()
elif st.session_state.active_egg == 7:
    render_confetti_party()
elif st.session_state.active_egg == 8:
    render_cyber_glitch()
elif st.session_state.active_egg == 9:
    render_fx_pnl()
