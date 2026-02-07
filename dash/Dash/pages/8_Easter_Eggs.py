import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import json
from core.auth import require_auth
from core.data.loader import load_assets, load_fixed_income, load_fixed_income_manual, load_proventos
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

    # Data Preparation
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
            'Commodities': 0x84cc16
        }

        for i, row in grouped.iterrows():
            classe = row['Class']
            val = row['Value']
            if total_market_val > 0:
                pct = (val / total_market_val)
                import math
                size = 0.6 + (math.sqrt(pct) * 2.5)
                distance = 12 + (i * 6.0)
                speed = 0.003 + (0.015 * (1.0 - pct))

                solar_data.append({
                    'name': classe,
                    'color': color_map.get(classe, 0x888888),
                    'size': float(size),
                    'distance': float(distance),
                    'speed': float(speed),
                    'value': float(val),
                    'pct': float(pct * 100)
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
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{
                overflow: hidden;
                background: #000;
                font-family: 'Orbitron', sans-serif;
                touch-action: none;
            }}

            /* Main Info Panel */
            #info-panel {{
                position: absolute; top: 15px; left: 15px;
                background: linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(20,20,40,0.9) 100%);
                padding: 20px; border-radius: 15px;
                border: 1px solid rgba(255,204,0,0.3);
                box-shadow: 0 0 30px rgba(255,204,0,0.1), inset 0 0 20px rgba(0,0,0,0.5);
                z-index: 100; min-width: 220px;
                backdrop-filter: blur(10px);
            }}
            #info-panel h2 {{
                color: #ffcc00; margin: 0 0 8px 0; font-size: 0.9rem;
                text-transform: uppercase; letter-spacing: 2px;
                text-shadow: 0 0 10px rgba(255,204,0,0.5);
            }}
            #total-value {{
                font-size: 1.4rem; color: #fff; font-weight: 700;
                text-shadow: 0 0 15px rgba(255,255,255,0.3);
            }}
            #info-panel .subtitle {{
                font-size: 0.65rem; color: #666; margin-top: 5px;
                letter-spacing: 1px;
            }}

            /* Planet Detail Panel */
            #planet-detail {{
                position: absolute; top: 15px; right: 15px;
                background: linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(10,30,20,0.95) 100%);
                padding: 20px; border-radius: 15px;
                border: 1px solid rgba(0,255,65,0.3);
                box-shadow: 0 0 30px rgba(0,255,65,0.1);
                z-index: 100; min-width: 250px;
                display: none; backdrop-filter: blur(10px);
            }}
            #planet-detail.visible {{ display: block; animation: slideIn 0.3s ease; }}
            @keyframes slideIn {{
                from {{ opacity: 0; transform: translateX(20px); }}
                to {{ opacity: 1; transform: translateX(0); }}
            }}
            #planet-detail h3 {{
                margin: 0 0 15px 0; font-size: 1.2rem;
                text-transform: uppercase; letter-spacing: 2px;
            }}
            .detail-row {{
                display: flex; justify-content: space-between;
                padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);
            }}
            .detail-label {{ color: #888; font-size: 0.7rem; }}
            .detail-value {{ color: #fff; font-size: 0.85rem; font-weight: 700; }}
            .pct-bar {{
                height: 6px; background: rgba(255,255,255,0.1);
                border-radius: 3px; margin-top: 10px; overflow: hidden;
            }}
            .pct-fill {{
                height: 100%; border-radius: 3px;
                transition: width 0.5s ease;
            }}

            /* Controls Panel */
            #controls {{
                position: absolute; bottom: 15px; left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.8);
                padding: 12px 25px; border-radius: 25px;
                border: 1px solid rgba(255,255,255,0.1);
                display: flex; gap: 20px; align-items: center;
                z-index: 100; backdrop-filter: blur(10px);
            }}
            .control-group {{
                display: flex; align-items: center; gap: 8px;
            }}
            .control-label {{
                font-size: 0.6rem; color: #888;
                text-transform: uppercase; letter-spacing: 1px;
            }}
            .control-btn {{
                width: 36px; height: 36px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 50%; color: #fff;
                cursor: pointer; font-size: 1rem;
                transition: all 0.2s;
                display: flex; align-items: center; justify-content: center;
            }}
            .control-btn:hover {{ background: rgba(255,255,255,0.15); }}
            .control-btn.active {{
                background: rgba(0,255,65,0.2);
                border-color: #00ff41;
                color: #00ff41;
            }}
            #speed-slider {{
                width: 80px; height: 4px;
                -webkit-appearance: none;
                background: rgba(255,255,255,0.2);
                border-radius: 2px; outline: none;
            }}
            #speed-slider::-webkit-slider-thumb {{
                -webkit-appearance: none;
                width: 14px; height: 14px;
                background: #ffcc00;
                border-radius: 50%; cursor: pointer;
                box-shadow: 0 0 10px rgba(255,204,0,0.5);
            }}

            /* Legend */
            #legend {{
                position: absolute; bottom: 80px; left: 15px;
                background: rgba(0,0,0,0.7);
                padding: 15px; border-radius: 10px;
                border: 1px solid rgba(255,255,255,0.1);
                z-index: 100; max-height: 200px;
                overflow-y: auto; font-size: 0.7rem;
            }}
            .legend-item {{
                display: flex; align-items: center; gap: 8px;
                padding: 4px 0; cursor: pointer;
                transition: all 0.2s;
            }}
            .legend-item:hover {{ transform: translateX(5px); }}
            .legend-color {{
                width: 12px; height: 12px; border-radius: 50%;
                box-shadow: 0 0 8px currentColor;
            }}
            .legend-name {{ color: #ccc; }}

            /* Floating Label */
            #planet-label {{
                position: absolute; pointer-events: none;
                transform: translate(-50%, -120%);
                z-index: 200; display: none;
                text-align: center;
            }}
            #planet-label .name {{
                font-size: 1rem; font-weight: 700;
                text-shadow: 0 0 10px currentColor;
            }}
            #planet-label .value {{
                font-size: 0.8rem; color: #fff;
                background: rgba(0,0,0,0.7);
                padding: 4px 10px; border-radius: 10px;
                margin-top: 5px;
            }}

            /* Instructions */
            #instructions {{
                position: absolute; bottom: 80px; right: 15px;
                color: #555; font-size: 0.6rem;
                text-align: right; line-height: 1.6;
            }}

            /* Mobile adjustments */
            @media (max-width: 768px) {{
                #info-panel {{ padding: 12px; min-width: 160px; }}
                #info-panel h2 {{ font-size: 0.7rem; }}
                #total-value {{ font-size: 1rem; }}
                #planet-detail {{ right: 10px; min-width: 200px; padding: 15px; }}
                #controls {{ padding: 10px 15px; gap: 12px; }}
                .control-btn {{ width: 32px; height: 32px; font-size: 0.9rem; }}
                #legend {{ display: none; }}
                #instructions {{ display: none; }}
            }}

            /* Shooting star animation */
            .shooting-star {{
                position: fixed;
                width: 100px; height: 2px;
                background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.8), rgba(255,255,255,0));
                transform: rotate(-45deg);
                animation: shoot 1s linear forwards;
                pointer-events: none;
            }}
            @keyframes shoot {{
                from {{ transform: translateX(-100px) translateY(-100px) rotate(-45deg); opacity: 1; }}
                to {{ transform: translateX(300px) translateY(300px) rotate(-45deg); opacity: 0; }}
            }}
        </style>
    </head>
    <body>
        <div id="info-panel">
            <h2>CELESTIAL ECONOMY</h2>
            <div id="total-value">{total_val_fmt}</div>
            <div class="subtitle">PORTFOLIO TOTAL VALUE</div>
        </div>

        <div id="planet-detail">
            <h3 id="detail-name">Planet</h3>
            <div class="detail-row">
                <span class="detail-label">VALUE</span>
                <span class="detail-value" id="detail-value">R$ 0,00</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">ALLOCATION</span>
                <span class="detail-value" id="detail-pct">0%</span>
            </div>
            <div class="pct-bar">
                <div class="pct-fill" id="detail-bar"></div>
            </div>
        </div>

        <div id="legend"></div>

        <div id="controls">
            <div class="control-group">
                <span class="control-label">ZOOM</span>
                <button class="control-btn" id="zoom-in">+</button>
                <button class="control-btn" id="zoom-out">−</button>
            </div>
            <div class="control-group">
                <span class="control-label">TIME</span>
                <input type="range" id="speed-slider" min="0" max="200" value="100">
            </div>
            <div class="control-group">
                <button class="control-btn active" id="auto-rotate" title="Auto Rotate">↻</button>
                <button class="control-btn" id="top-view" title="Top View">⊙</button>
            </div>
        </div>

        <div id="instructions">
            DRAG to rotate • SCROLL to zoom<br>
            CLICK planet for details
        </div>

        <div id="planet-label">
            <div class="name"></div>
            <div class="value"></div>
        </div>

        <script>
            // === SETUP ===
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
            const renderer = new THREE.WebGLRenderer({{ antialias: true, alpha: true }});
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.2;
            document.body.appendChild(renderer.domElement);

            // === STATE ===
            let timeScale = 1;
            let autoRotate = true;
            let selectedPlanet = null;
            let cameraAngle = 0;
            let cameraHeight = 35;
            let cameraDistance = 60;
            let targetCameraAngle = 0;
            let targetCameraHeight = 35;
            let targetCameraDistance = 60;
            let isDragging = false;
            let previousMousePosition = {{ x: 0, y: 0 }};

            // === LIGHTING ===
            const ambientLight = new THREE.AmbientLight(0x222244, 0.5);
            scene.add(ambientLight);

            const sunLight = new THREE.PointLight(0xffeecc, 2.5, 200);
            sunLight.position.set(0, 0, 0);
            scene.add(sunLight);

            // === STARFIELD ===
            function createStarfield() {{
                const starsGeo = new THREE.BufferGeometry();
                const starsCount = 5000;
                const positions = new Float32Array(starsCount * 3);
                const colors = new Float32Array(starsCount * 3);
                const sizes = new Float32Array(starsCount);

                for (let i = 0; i < starsCount; i++) {{
                    const radius = 200 + Math.random() * 600;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);

                    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
                    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
                    positions[i * 3 + 2] = radius * Math.cos(phi);

                    // Varied star colors (white, blue, yellow, red)
                    const colorChoice = Math.random();
                    if (colorChoice < 0.6) {{
                        colors[i * 3] = 1; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 1;
                    }} else if (colorChoice < 0.75) {{
                        colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 1;
                    }} else if (colorChoice < 0.9) {{
                        colors[i * 3] = 1; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.7;
                    }} else {{
                        colors[i * 3] = 1; colors[i * 3 + 1] = 0.6; colors[i * 3 + 2] = 0.5;
                    }}

                    sizes[i] = 0.5 + Math.random() * 1.5;
                }}

                starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                starsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                starsGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

                const starsMat = new THREE.PointsMaterial({{
                    size: 1,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.9,
                    sizeAttenuation: true
                }});

                return new THREE.Points(starsGeo, starsMat);
            }}
            const starfield = createStarfield();
            scene.add(starfield);

            // === NEBULA BACKGROUND ===
            function createNebula() {{
                const nebulaGeo = new THREE.BufferGeometry();
                const nebulaCount = 500;
                const positions = new Float32Array(nebulaCount * 3);
                const colors = new Float32Array(nebulaCount * 3);

                for (let i = 0; i < nebulaCount; i++) {{
                    positions[i * 3] = (Math.random() - 0.5) * 800;
                    positions[i * 3 + 1] = (Math.random() - 0.5) * 400;
                    positions[i * 3 + 2] = -300 - Math.random() * 200;

                    const hue = 0.6 + Math.random() * 0.3; // Purple to blue
                    const color = new THREE.Color().setHSL(hue, 0.8, 0.3);
                    colors[i * 3] = color.r;
                    colors[i * 3 + 1] = color.g;
                    colors[i * 3 + 2] = color.b;
                }}

                nebulaGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                nebulaGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

                const nebulaMat = new THREE.PointsMaterial({{
                    size: 15,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.3,
                    sizeAttenuation: true
                }});

                return new THREE.Points(nebulaGeo, nebulaMat);
            }}
            scene.add(createNebula());

            // === SUN ===
            function createSun() {{
                const sunGroup = new THREE.Group();

                // Core
                const coreGeo = new THREE.SphereGeometry(5, 64, 64);
                const coreMat = new THREE.MeshBasicMaterial({{ color: 0xffdd44 }});
                const core = new THREE.Mesh(coreGeo, coreMat);
                sunGroup.add(core);

                // Inner glow
                for (let i = 0; i < 3; i++) {{
                    const glowGeo = new THREE.SphereGeometry(5.5 + i * 0.8, 32, 32);
                    const glowMat = new THREE.MeshBasicMaterial({{
                        color: new THREE.Color().setHSL(0.12 - i * 0.02, 1, 0.5),
                        transparent: true,
                        opacity: 0.15 - i * 0.04,
                        side: THREE.BackSide
                    }});
                    sunGroup.add(new THREE.Mesh(glowGeo, glowMat));
                }}

                // Corona particles
                const coronaGeo = new THREE.BufferGeometry();
                const coronaCount = 2000;
                const coronaPositions = new Float32Array(coronaCount * 3);
                const coronaColors = new Float32Array(coronaCount * 3);

                for (let i = 0; i < coronaCount; i++) {{
                    const radius = 5.5 + Math.random() * 4;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);

                    coronaPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
                    coronaPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
                    coronaPositions[i * 3 + 2] = radius * Math.cos(phi);

                    const brightness = 0.5 + Math.random() * 0.5;
                    coronaColors[i * 3] = 1;
                    coronaColors[i * 3 + 1] = 0.6 + Math.random() * 0.3;
                    coronaColors[i * 3 + 2] = 0.2 * Math.random();
                }}

                coronaGeo.setAttribute('position', new THREE.BufferAttribute(coronaPositions, 3));
                coronaGeo.setAttribute('color', new THREE.BufferAttribute(coronaColors, 3));

                const coronaMat = new THREE.PointsMaterial({{
                    size: 0.3,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.6,
                    blending: THREE.AdditiveBlending
                }});

                const corona = new THREE.Points(coronaGeo, coronaMat);
                corona.name = 'corona';
                sunGroup.add(corona);

                return sunGroup;
            }}
            const sun = createSun();
            scene.add(sun);

            // === ASTEROID BELT ===
            function createAsteroidBelt(innerRadius, outerRadius) {{
                const asteroidGeo = new THREE.BufferGeometry();
                const asteroidCount = 1500;
                const positions = new Float32Array(asteroidCount * 3);
                const colors = new Float32Array(asteroidCount * 3);
                const sizes = new Float32Array(asteroidCount);

                for (let i = 0; i < asteroidCount; i++) {{
                    const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
                    const theta = Math.random() * Math.PI * 2;
                    const heightVariation = (Math.random() - 0.5) * 2;

                    positions[i * 3] = radius * Math.cos(theta);
                    positions[i * 3 + 1] = heightVariation;
                    positions[i * 3 + 2] = radius * Math.sin(theta);

                    const brightness = 0.3 + Math.random() * 0.4;
                    colors[i * 3] = brightness;
                    colors[i * 3 + 1] = brightness * 0.9;
                    colors[i * 3 + 2] = brightness * 0.8;

                    sizes[i] = 0.1 + Math.random() * 0.3;
                }}

                asteroidGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                asteroidGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                asteroidGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

                const asteroidMat = new THREE.PointsMaterial({{
                    size: 0.3,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.7
                }});

                return new THREE.Points(asteroidGeo, asteroidMat);
            }}

            // === PLANETS ===
            const planetsData = {solar_json};
            const planets = [];
            const totalValue = planetsData.reduce((sum, p) => sum + p.value, 0);

            // Create asteroid belt if we have enough planets
            if (planetsData.length > 2) {{
                const beltInner = 12 + planetsData.length * 2;
                const beltOuter = beltInner + 4;
                const asteroidBelt = createAsteroidBelt(beltInner, beltOuter);
                asteroidBelt.name = 'asteroidBelt';
                scene.add(asteroidBelt);
            }}

            // Build legend
            const legendEl = document.getElementById('legend');

            planetsData.forEach((p, index) => {{
                // Orbit ring with gradient
                const orbitGeo = new THREE.RingGeometry(p.distance - 0.08, p.distance + 0.08, 128);
                const orbitMat = new THREE.MeshBasicMaterial({{
                    color: 0x334455,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.4
                }});
                const orbit = new THREE.Mesh(orbitGeo, orbitMat);
                orbit.rotation.x = Math.PI / 2;
                scene.add(orbit);

                // Pivot for orbit
                const pivot = new THREE.Object3D();
                pivot.rotation.y = Math.random() * Math.PI * 2;
                scene.add(pivot);

                // Planet group
                const planetGroup = new THREE.Group();
                planetGroup.position.set(p.distance, 0, 0);

                // Planet mesh
                const geometry = new THREE.SphereGeometry(p.size, 48, 48);
                const material = new THREE.MeshStandardMaterial({{
                    color: p.color,
                    roughness: 0.4,
                    metalness: 0.3,
                    emissive: p.color,
                    emissiveIntensity: 0.15
                }});
                const mesh = new THREE.Mesh(geometry, material);

                // Atmosphere
                const atmoGeo = new THREE.SphereGeometry(p.size * 1.15, 32, 32);
                const atmoMat = new THREE.MeshBasicMaterial({{
                    color: p.color,
                    transparent: true,
                    opacity: 0.08,
                    side: THREE.BackSide
                }});
                mesh.add(new THREE.Mesh(atmoGeo, atmoMat));

                // Rings for larger planets (top 3)
                if (index < 3 && p.size > 1.5) {{
                    const ringGeo = new THREE.RingGeometry(p.size * 1.4, p.size * 2.2, 64);
                    const ringMat = new THREE.MeshBasicMaterial({{
                        color: p.color,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.3
                    }});
                    const ring = new THREE.Mesh(ringGeo, ringMat);
                    ring.rotation.x = Math.PI / 2 + 0.3;
                    mesh.add(ring);
                }}

                planetGroup.add(mesh);
                pivot.add(planetGroup);

                const planetObj = {{
                    group: planetGroup,
                    mesh: mesh,
                    pivot: pivot,
                    orbit: orbit,
                    speed: p.speed,
                    name: p.name,
                    value: p.value,
                    pct: p.pct,
                    color: p.color,
                    distance: p.distance,
                    baseEmissive: 0.15
                }};
                planets.push(planetObj);

                // Legend item
                const colorHex = '#' + p.color.toString(16).padStart(6, '0');
                const legendItem = document.createElement('div');
                legendItem.className = 'legend-item';
                legendItem.innerHTML = `
                    <div class="legend-color" style="background: ${{colorHex}}; color: ${{colorHex}};"></div>
                    <span class="legend-name">${{p.name}}</span>
                `;
                legendItem.onclick = () => selectPlanet(planetObj);
                legendEl.appendChild(legendItem);
            }});

            // === COMETS ===
            const comets = [];
            function createComet() {{
                const cometGroup = new THREE.Group();

                // Head
                const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
                const headMat = new THREE.MeshBasicMaterial({{ color: 0x88ccff }});
                cometGroup.add(new THREE.Mesh(headGeo, headMat));

                // Tail
                const tailGeo = new THREE.BufferGeometry();
                const tailCount = 50;
                const tailPositions = new Float32Array(tailCount * 3);
                const tailColors = new Float32Array(tailCount * 3);

                for (let i = 0; i < tailCount; i++) {{
                    tailPositions[i * 3] = -i * 0.5 + (Math.random() - 0.5) * 0.3;
                    tailPositions[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
                    tailPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;

                    const alpha = 1 - i / tailCount;
                    tailColors[i * 3] = 0.5 + alpha * 0.5;
                    tailColors[i * 3 + 1] = 0.8 + alpha * 0.2;
                    tailColors[i * 3 + 2] = 1;
                }}

                tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPositions, 3));
                tailGeo.setAttribute('color', new THREE.BufferAttribute(tailColors, 3));

                const tailMat = new THREE.PointsMaterial({{
                    size: 0.15,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.6,
                    blending: THREE.AdditiveBlending
                }});

                cometGroup.add(new THREE.Points(tailGeo, tailMat));

                // Initial position
                const angle = Math.random() * Math.PI * 2;
                const distance = 80 + Math.random() * 40;
                cometGroup.position.set(
                    Math.cos(angle) * distance,
                    (Math.random() - 0.5) * 20,
                    Math.sin(angle) * distance
                );

                cometGroup.userData = {{
                    velocity: new THREE.Vector3(
                        -Math.cos(angle) * 0.3,
                        (Math.random() - 0.5) * 0.1,
                        -Math.sin(angle) * 0.3
                    ),
                    life: 300 + Math.random() * 200
                }};

                return cometGroup;
            }}

            // Add initial comets
            for (let i = 0; i < 3; i++) {{
                const comet = createComet();
                scene.add(comet);
                comets.push(comet);
            }}

            // === CAMERA ===
            camera.position.set(0, targetCameraHeight, targetCameraDistance);
            camera.lookAt(0, 0, 0);

            // === INTERACTION ===
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();
            const label = document.getElementById('planet-label');
            const detailPanel = document.getElementById('planet-detail');

            function selectPlanet(planet) {{
                selectedPlanet = planet;

                const colorHex = '#' + planet.color.toString(16).padStart(6, '0');

                document.getElementById('detail-name').textContent = planet.name;
                document.getElementById('detail-name').style.color = colorHex;
                document.getElementById('detail-value').textContent = 'R$ ' + planet.value.toLocaleString('pt-BR', {{minimumFractionDigits: 2}});
                document.getElementById('detail-pct').textContent = planet.pct.toFixed(1) + '%';
                document.getElementById('detail-bar').style.width = planet.pct + '%';
                document.getElementById('detail-bar').style.background = colorHex;

                detailPanel.classList.add('visible');

                // Highlight planet
                planets.forEach(p => {{
                    p.mesh.material.emissiveIntensity = p === planet ? 0.5 : 0.1;
                    p.orbit.material.opacity = p === planet ? 0.7 : 0.2;
                }});

                // Move camera to focus
                targetCameraDistance = planet.distance + 20;
            }}

            function deselectPlanet() {{
                selectedPlanet = null;
                detailPanel.classList.remove('visible');
                planets.forEach(p => {{
                    p.mesh.material.emissiveIntensity = p.baseEmissive;
                    p.orbit.material.opacity = 0.4;
                }});
            }}

            function handleHover(clientX, clientY) {{
                mouse.x = (clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(clientY / window.innerHeight) * 2 + 1;

                raycaster.setFromCamera(mouse, camera);
                const meshes = planets.map(p => p.mesh);
                const intersects = raycaster.intersectObjects(meshes);

                if (intersects.length > 0) {{
                    const planet = planets.find(p => p.mesh === intersects[0].object);
                    if (planet) {{
                        const colorHex = '#' + planet.color.toString(16).padStart(6, '0');
                        label.style.display = 'block';
                        label.style.left = clientX + 'px';
                        label.style.top = clientY + 'px';
                        label.querySelector('.name').textContent = planet.name;
                        label.querySelector('.name').style.color = colorHex;
                        label.querySelector('.value').textContent = 'R$ ' + planet.value.toLocaleString('pt-BR', {{minimumFractionDigits: 2}});
                        document.body.style.cursor = 'pointer';

                        if (!selectedPlanet) {{
                            planet.mesh.material.emissiveIntensity = 0.4;
                        }}
                    }}
                }} else {{
                    label.style.display = 'none';
                    document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
                    if (!selectedPlanet) {{
                        planets.forEach(p => p.mesh.material.emissiveIntensity = p.baseEmissive);
                    }}
                }}
            }}

            // Mouse events
            renderer.domElement.addEventListener('mousedown', (e) => {{
                isDragging = true;
                previousMousePosition = {{ x: e.clientX, y: e.clientY }};
            }});

            window.addEventListener('mouseup', () => {{
                isDragging = false;
            }});

            window.addEventListener('mousemove', (e) => {{
                handleHover(e.clientX, e.clientY);

                if (isDragging) {{
                    const deltaX = e.clientX - previousMousePosition.x;
                    const deltaY = e.clientY - previousMousePosition.y;

                    targetCameraAngle -= deltaX * 0.005;
                    targetCameraHeight = Math.max(5, Math.min(80, targetCameraHeight + deltaY * 0.3));

                    previousMousePosition = {{ x: e.clientX, y: e.clientY }};
                    autoRotate = false;
                    document.getElementById('auto-rotate').classList.remove('active');
                }}
            }});

            renderer.domElement.addEventListener('click', (e) => {{
                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

                raycaster.setFromCamera(mouse, camera);
                const meshes = planets.map(p => p.mesh);
                const intersects = raycaster.intersectObjects(meshes);

                if (intersects.length > 0) {{
                    const planet = planets.find(p => p.mesh === intersects[0].object);
                    if (planet) selectPlanet(planet);
                }} else {{
                    deselectPlanet();
                }}
            }});

            // Touch events
            let touchStart = {{ x: 0, y: 0 }};
            let lastTouchDistance = 0;

            renderer.domElement.addEventListener('touchstart', (e) => {{
                if (e.touches.length === 1) {{
                    touchStart = {{ x: e.touches[0].clientX, y: e.touches[0].clientY }};
                    isDragging = true;
                }} else if (e.touches.length === 2) {{
                    lastTouchDistance = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                }}
            }});

            renderer.domElement.addEventListener('touchmove', (e) => {{
                e.preventDefault();

                if (e.touches.length === 1 && isDragging) {{
                    const deltaX = e.touches[0].clientX - touchStart.x;
                    const deltaY = e.touches[0].clientY - touchStart.y;

                    targetCameraAngle -= deltaX * 0.008;
                    targetCameraHeight = Math.max(5, Math.min(80, targetCameraHeight + deltaY * 0.2));

                    touchStart = {{ x: e.touches[0].clientX, y: e.touches[0].clientY }};
                    autoRotate = false;
                    document.getElementById('auto-rotate').classList.remove('active');
                }} else if (e.touches.length === 2) {{
                    const distance = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    const delta = lastTouchDistance - distance;
                    targetCameraDistance = Math.max(20, Math.min(150, targetCameraDistance + delta * 0.2));
                    lastTouchDistance = distance;
                }}
            }});

            renderer.domElement.addEventListener('touchend', (e) => {{
                isDragging = false;

                // Tap to select
                if (e.changedTouches.length === 1) {{
                    const touch = e.changedTouches[0];
                    handleHover(touch.clientX, touch.clientY);

                    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
                    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;

                    raycaster.setFromCamera(mouse, camera);
                    const meshes = planets.map(p => p.mesh);
                    const intersects = raycaster.intersectObjects(meshes);

                    if (intersects.length > 0) {{
                        const planet = planets.find(p => p.mesh === intersects[0].object);
                        if (planet) selectPlanet(planet);
                    }}
                }}
            }});

            // Scroll zoom
            renderer.domElement.addEventListener('wheel', (e) => {{
                e.preventDefault();
                targetCameraDistance = Math.max(20, Math.min(150, targetCameraDistance + e.deltaY * 0.05));
            }}, {{ passive: false }});

            // Control buttons
            document.getElementById('zoom-in').onclick = () => targetCameraDistance = Math.max(20, targetCameraDistance - 10);
            document.getElementById('zoom-out').onclick = () => targetCameraDistance = Math.min(150, targetCameraDistance + 10);
            document.getElementById('speed-slider').oninput = (e) => timeScale = e.target.value / 100;
            document.getElementById('auto-rotate').onclick = (e) => {{
                autoRotate = !autoRotate;
                e.target.classList.toggle('active', autoRotate);
            }};
            document.getElementById('top-view').onclick = () => {{
                targetCameraHeight = 80;
                targetCameraDistance = 80;
            }};

            // === ANIMATION ===
            let time = 0;

            function animate() {{
                requestAnimationFrame(animate);
                time += 0.016 * timeScale;

                // Sun animation
                sun.rotation.y += 0.002 * timeScale;
                const corona = sun.getObjectByName('corona');
                if (corona) {{
                    corona.rotation.y -= 0.003 * timeScale;
                    corona.rotation.x += 0.001 * timeScale;
                }}

                // Planet orbits
                planets.forEach(p => {{
                    p.pivot.rotation.y += p.speed * timeScale;
                    p.mesh.rotation.y += 0.01 * timeScale;
                }});

                // Asteroid belt rotation
                const asteroidBelt = scene.getObjectByName('asteroidBelt');
                if (asteroidBelt) {{
                    asteroidBelt.rotation.y += 0.0005 * timeScale;
                }}

                // Comets
                comets.forEach((comet, i) => {{
                    comet.position.add(comet.userData.velocity.clone().multiplyScalar(timeScale));
                    comet.userData.life -= timeScale;

                    // Reset comet when out of bounds or dead
                    if (comet.userData.life <= 0 || comet.position.length() < 10) {{
                        scene.remove(comet);
                        comets[i] = createComet();
                        scene.add(comets[i]);
                    }}
                }});

                // Starfield subtle rotation
                starfield.rotation.y += 0.0001 * timeScale;

                // Camera
                if (autoRotate) {{
                    targetCameraAngle += 0.002 * timeScale;
                }}

                cameraAngle += (targetCameraAngle - cameraAngle) * 0.05;
                cameraHeight += (targetCameraHeight - cameraHeight) * 0.05;
                cameraDistance += (targetCameraDistance - cameraDistance) * 0.05;

                camera.position.x = Math.sin(cameraAngle) * cameraDistance;
                camera.position.z = Math.cos(cameraAngle) * cameraDistance;
                camera.position.y = cameraHeight;
                camera.lookAt(0, 0, 0);

                renderer.render(scene, camera);
            }}

            // === RESIZE ===
            window.addEventListener('resize', () => {{
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            }});

            // === SHOOTING STARS ===
            function createShootingStar() {{
                const star = document.createElement('div');
                star.className = 'shooting-star';
                star.style.left = Math.random() * window.innerWidth + 'px';
                star.style.top = Math.random() * (window.innerHeight / 2) + 'px';
                document.body.appendChild(star);
                setTimeout(() => star.remove(), 1000);
            }}

            setInterval(() => {{
                if (Math.random() < 0.3) createShootingStar();
            }}, 3000);

            // Start
            animate();
        </script>
    </body>
    </html>
    """
    components.html(solar_html, height=750)

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

# --- MAIN HUB RENDER ---
if st.session_state.active_egg is None:
    st.markdown('<div class="glitch-title">HUB DE PROJETOS SECRETOS</div>', unsafe_allow_html=True)
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

    locked_slots = [
        # Removed ("NFT GALLERY", "💎") to fit BIO-LAB
        ("CRYPTO MINER", "⛏️"),
        ("AI CHATBOT", "🤖"),
        ("TIME TRAVEL", "⏳"),
        ("HOLODECK", "🧊"),
        ("PORTAL GUN", "🌀"),
        ("SOURCE CODE", "📜")
    ]
    
    remaining_cols = [r2c2, r2c3, r2c4]
    r3 = st.columns(4)
    remaining_cols.extend(r3)
    
    for i, (label, icon) in enumerate(locked_slots):
        if i < len(remaining_cols):
            with remaining_cols[i]:
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
