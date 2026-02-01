import streamlit as st
import streamlit.components.v1 as components
from core.auth import require_auth
from core.data.loader import load_assets

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

    # Data Preparation
    df = load_assets()
    ecosystem_data = []
    
    if not df.empty:
        # Group by class/macro-allocation
        if 'classe' in df.columns and 'valor_atual' in df.columns:
            # Clean and sum
            df['valor_atual'] = pd.to_numeric(df['valor_atual'], errors='coerce').fillna(0)
            grouped = df.groupby('classe')['valor_atual'].sum().reset_index()
            total_val = grouped['valor_atual'].sum()
            
            # Map classes to "Species" colors
            color_map = {
                'Renda Fixa': '#00ff41',    # Stable Green
                'Ações': '#ff00de',         # Volatile Pink
                'FIIs': '#00efff',          # Blue Construction
                'Cripto': '#ffcc00',        # Gold/Crypto
                'Exterior': '#ff4400',      # Red International
                'Caixa': '#ffffff'          # White Neutral
            }
            
            for _, row in grouped.iterrows():
                classe = row['classe']
                val = row['valor_atual']
                if total_val > 0:
                    pct = (val / total_val) * 100
                    # Determine organism count based on allocation %
                    count = max(3, int(pct / 2)) 
                    # Normalize radius
                    radius = max(5, int(pct * 0.8))
                    
                    color = color_map.get(classe, '#888888')
                    
                    ecosystem_data.append({
                        'species': classe,
                        'color': color,
                        'count': count,
                        'radius': radius,
                        'value': float(val)
                    })

    # Fallback if empty
    if not ecosystem_data:
        ecosystem_data = [
            {'species': 'Unknown', 'color': '#00ff41', 'count': 20, 'radius': 10, 'value': 0}
        ]

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
                // Movement
                this.x += this.vx;
                this.y += this.vy;

                // Wall Bounce
                if (this.x + this.radius > width || this.x - this.radius < 0) this.vx = -this.vx;
                if (this.y + this.radius > height || this.y - this.radius < 0) this.vy = -this.vy;

                // Mouse Gravity Well
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

                // Friction
                this.vx *= 0.99;
                this.vy *= 0.99;

                // Minimum movement (Brownian motion)
                if (Math.abs(this.vx) < 0.2) this.vx += (Math.random() - 0.5) * 0.5;
                if (Math.abs(this.vy) < 0.2) this.vy += (Math.random() - 0.5) * 0.5;

                // Pulsing Life
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
                
                // Nucleus
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
            
            // Trails effect
            ctx.fillStyle = "rgba(0, 5, 10, 0.2)";
            ctx.fillRect(0, 0, width, height);

            particles.forEach(p => {{
                p.update();
                p.draw();
            }});
            
            // Connections
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

        // Interact
        window.addEventListener('mousedown', e => {{
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.active = true;
        }});
        
        window.addEventListener('mousemove', e => {{
            if (mouse.active) {{
                mouse.x = e.clientX;
                mouse.y = e.clientY;
            }}
        }});

        window.addEventListener('mouseup', () => {{
            mouse.active = false;
        }});
        
        // Touch support
        window.addEventListener('touchstart', e => {{
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
            mouse.active = true;
        }});
        window.addEventListener('touchend', () => {{
            mouse.active = false;
        }});

        init();
        animate();
    </script>
    </body>
    </html>
    """
    components.html(bio_html, height=700)


# --- HOME BUTTON ---
if st.session_state.active_egg is None:
    c_home1, c_home2 = st.columns([8, 1])
    with c_home2:
        if st.button("🔌 DESCONECTAR", use_container_width=True):
            st.switch_page("Home.py")

# --- MAIN HUB RENDER ---
if st.session_state.active_egg is None:
    st.markdown('<div class="glitch-title">HUB DE PROJETOS SECRETOS</div>', unsafe_allow_html=True)
    st.markdown('<p style="text-align: center; color: #666; font-size: 1.2rem; margin-bottom: 40px;">// ACESSO RESTRITO: NÍVEL 5 //</p>', unsafe_allow_html=True)
    
    # Grid Layout with Columns
    # ROW 1 (Slots 1-4)
    r1c1, r1c2, r1c3, r1c4 = st.columns(4)
    
    with r1c1:
        # SLOT 1: SNAKE GAME (UNLOCKED)
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
        # SLOT 2: CLIENT REQUEST - BIO DOME
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
    
    # Distribute remaining slots
    remaining_cols = [r1c3, r1c4]
    
    # Create Row 2
    r2 = st.columns(4)
    remaining_cols.extend(r2)
    
    # Create Row 3
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
