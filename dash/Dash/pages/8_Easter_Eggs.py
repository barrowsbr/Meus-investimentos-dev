import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import json
from core.auth import require_auth
from core.data.loader import load_assets, load_fixed_income, load_fixed_income_manual, load_proventos
from core.finance import calcular_carteira_fechada, summarize_fixed_income, summarize_fixed_income_hybrid
from core.data.market import fetch_market_data
from core.logic import identificar_setor_ativo

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
    st.markdown("""
    <style>
        .bio-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #000; z-index: 1000;
        }
    </style>
    """, unsafe_allow_html=True)

    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_bio_back"):
            return_to_hub()
            st.rerun()

    # Reuse Robust Data Logic for Bio-Dome too!
    df_portfolio = get_portfolio_data()
    ecosystem_data = []

    if not df_portfolio.empty:
        grouped = df_portfolio.groupby('Class')['Value'].sum().reset_index()
        total_val = grouped['Value'].sum()
        
        color_map = {
            'Renda Fixa': '#00ff41',
            'Tesouro': '#10b981',
            'CDBs': '#0ea5e9',
            'Ações': '#ff00de',
            'FIIs': '#00efff',
            'Cripto': '#ffcc00',
            'Ações intl': '#ff4400',
            'Caixa': '#ffffff',
            'ETFs': '#8b5cf6'
        }
        
        for _, row in grouped.iterrows():
            classe = row['Class']
            val = row['Value']
            if total_val > 0:
                pct = (val / total_val) * 100
                count = max(3, int(pct / 2)) 
                radius = max(5, int(pct * 0.8))
                color = color_map.get(classe, '#888888')
                
                ecosystem_data.append({
                    'species': classe,
                    'color': color,
                    'count': count,
                    'radius': radius,
                    'value': float(val)
                })

    # Fallback
    if not ecosystem_data:
        ecosystem_data = [{'species': 'Unknown', 'color': '#00ff41', 'count': 20, 'radius': 10, 'value': 0}]
    
    import json
    eco_json = json.dumps(ecosystem_data)

    bio_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <style>
        body {{ margin: 0; overflow: hidden; background: #000; font-family: 'Courier New', monospace; }}
        canvas {{ display: block; }}
        #ui-layer {{
            position: absolute; top: 20px; left: 20px; color: #00ff41; pointer-events: none;
            text-shadow: 0 0 5px #00ff41; background: rgba(0,0,0,0.5); padding: 10px; border: 1px solid #00ff41;
        }}
        .phenomenon {{
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            font-size: 3rem; color: white; opacity: 0; font-weight: bold; pointer-events: none;
            transition: opacity 1s;
        }}
    </style>
    </head>
    <body>
    <div id="ui-layer">
        <div>BIO-DOME STATUS: ALIVE</div>
        <div>SIMULATION SPEED: 1.0x</div>
        <div style="font-size: 0.8rem; margin-top: 5px; color: #aaa;">> CLICK TO CREATE GRAVITY WELL</div>
    </div>
    <div id="phenomenon" class="phenomenon">MARKET SHOCK</div>
    <canvas id="bioCanvas"></canvas>
    
    <script>
        const canvas = document.getElementById("bioCanvas");
        const ctx = canvas.getContext("2d");
        
        let width, height;
        let particles = [];
        let mouse = {{ x: null, y: null, active: false }};
        
        const ecosystem = {eco_json};

        function resize() {{
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
        }}
        window.addEventListener('resize', resize);
        resize();

        class Organism {{
            constructor(x, y, radius, color, species) {{
                this.x = x;
                this.y = y;
                this.radius = radius;
                this.baseRadius = radius;
                this.color = color;
                this.species = species;
                this.vx = (Math.random() - 0.5) * 2;
                this.vy = (Math.random() - 0.5) * 2;
                this.life = Math.random() * 100;
                this.pulseSpeed = 0.05 + Math.random() * 0.05;
            }}

            update() {{
                this.x += this.vx;
                this.y += this.vy;
                if (this.x + this.radius > width || this.x - this.radius < 0) this.vx = -this.vx;
                if (this.y + this.radius > height || this.y - this.radius < 0) this.vy = -this.vy;

                if (mouse.active) {{
                    const dx = mouse.x - this.x;
                    const dy = mouse.y - this.y;
                    const distance = Math.sqrt(dx*dx + dy*dy);
                    if (distance < 300) {{
                        const force = (300 - distance) / 300;
                        this.vx += (dx / distance) * force * 0.5;
                        this.vy += (dy / distance) * force * 0.5;
                    }}
                }}
                this.vx *= 0.99;
                this.vy *= 0.99;
                if (Math.abs(this.vx) < 0.2) this.vx += (Math.random() - 0.5) * 0.5;
                if (Math.abs(this.vy) < 0.2) this.vy += (Math.random() - 0.5) * 0.5;
                this.life += this.pulseSpeed;
                this.radius = this.baseRadius + Math.sin(this.life) * 2;
            }}

            draw() {{
                ctx.beginPath();
                ctx.arc(this.x, this.y, Math.max(0, this.radius), 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.shadowBlur = 15;
                ctx.shadowColor = this.color;
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = "rgba(255,255,255,0.3)";
                ctx.beginPath();
                ctx.arc(this.x - this.radius*0.3, this.y - this.radius*0.3, this.radius/4, 0, Math.PI*2);
                ctx.fill();
            }}
        }}

        function init() {{
            particles = [];
            ecosystem.forEach(group => {{
                for (let i = 0; i < group.count; i++) {{
                    const x = Math.random() * (width - 100) + 50;
                    const y = Math.random() * (height - 100) + 50;
                    particles.push(new Organism(x, y, group.radius, group.color, group.species));
                }}
            }});
        }}

        function animate() {{
            requestAnimationFrame(animate);
            ctx.fillStyle = "rgba(0, 5, 10, 0.2)";
            ctx.fillRect(0, 0, width, height);

            particles.forEach(p => {{
                p.update();
                p.draw();
            }});
            
            ctx.strokeStyle = "rgba(0, 255, 65, 0.05)";
            ctx.lineWidth = 1;
            for (let i = 0; i < particles.length; i++) {{
                for (let j = i; j < particles.length; j++) {{
                    if (particles[i].species === particles[j].species) {{ // Only connect same species
                        const dx = particles[i].x - particles[j].x;
                        const dy = particles[i].y - particles[j].y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist < 100) {{
                            ctx.beginPath();
                            ctx.moveTo(particles[i].x, particles[i].y);
                            ctx.lineTo(particles[j].x, particles[j].y);
                            ctx.stroke();
                        }}
                    }}
                }}
            }}
        }}

        window.addEventListener('mousedown', e => {{ mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }});
        window.addEventListener('mousemove', e => {{ if (mouse.active) {{ mouse.x = e.clientX; mouse.y = e.clientY; }} }});
        window.addEventListener('mouseup', () => {{ mouse.active = false; }});
        window.addEventListener('touchstart', e => {{ mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; mouse.active = true; }});
        window.addEventListener('touchend', () => {{ mouse.active = false; }});

        init();
        animate();
    </script>
    </body>
    </html>
    """
    components.html(bio_html, height=700)

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

    locked_slots = [
        ("MATRIX RAIN", "💻"), 
        ("NFT GALLERY", "💎"),
        ("CRYPTO MINER", "⛏️"),
        ("AI CHATBOT", "🤖"),
        ("TIME TRAVEL", "⏳"),
        ("HOLODECK", "🧊"),
        ("PORTAL GUN", "🌀"),
        ("SOURCE CODE", "📜")
    ]
    
    remaining_cols = [r1c4]
    r2 = st.columns(4)
    remaining_cols.extend(r2)
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
