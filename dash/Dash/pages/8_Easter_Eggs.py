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

# --- SNAKE GAME LOGIC (EGG #1) ---
def render_snake_game():
    st.markdown("""
    <style>
        .game-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #000; z-index: 1000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .snake-title {
            font-family: 'Press Start 2P', cursive;
            color: #00ff41;
            margin-bottom: 20px;
            text-shadow: 0 0 10px #00ff41;
        }
    </style>
    """, unsafe_allow_html=True)

    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True):
            return_to_hub()
            st.rerun()
            
    # Ticker Feeder
    df = load_assets()
    tickers = ["$BRL", "$USD", "$BTC", "$GOLD"]
    if not df.empty:
        raw_tickers = df['ticker'].dropna().unique().tolist()
        if raw_tickers:
            tickers = [f"${t}" for t in raw_tickers]
    tickets_js_array = str(tickers)

    game_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <style>
        body {{ background: transparent; color: white; text-align: center; font-family: 'Courier New', monospace; overflow: hidden; }}
        canvas {{ border: 4px solid #00ff41; box-shadow: 0 0 20px #00ff41, inset 0 0 20px #00ff41; background-color: #000; display: block; margin: 0 auto; }}
        #score {{ color: #00ff41; font-size: 24px; margin-bottom: 10px; text-shadow: 0 0 5px #00ff41; font-weight: bold; }}
    </style>
    </head>
    <body>
    <div id="score">PATRIMÔNIO: R$ 0,00</div>
    <canvas id="gameCanvas" width="800" height="500"></canvas>
    <script>
        const canvas = document.getElementById("gameCanvas");
        const ctx = canvas.getContext("2d");
        const box = 20;
        let score = 0;
        const tickers = {tickets_js_array};
        let snake = [{{ x: 10 * box, y: 10 * box }}];
        let d;
        let food = {{ x: Math.floor(Math.random()*(canvas.width/box))*box, y: Math.floor(Math.random()*(canvas.height/box))*box, symbol: tickers[0] }};

        document.addEventListener("keydown", direction);
        function direction(event) {{
            if(event.keyCode == 37 && d != "RIGHT") d = "LEFT";
            else if(event.keyCode == 38 && d != "DOWN") d = "UP";
            else if(event.keyCode == 39 && d != "LEFT") d = "RIGHT";
            else if(event.keyCode == 40 && d != "UP") d = "DOWN";
        }}

        function draw() {{
            ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0,0,canvas.width,canvas.height); // Fade effect
            for(let i=0; i<snake.length; i++) {{
                ctx.fillStyle = (i==0)? "#00ff41" : "#00cc33";
                ctx.fillRect(snake[i].x, snake[i].y, box, box);
                ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.strokeRect(snake[i].x, snake[i].y, box, box);
            }}
            
            ctx.fillStyle = "#ff00de"; ctx.font = "16px monospace"; ctx.shadowBlur = 10; ctx.shadowColor = "#ff00de";
            ctx.fillText(food.symbol, food.x, food.y+15); ctx.shadowBlur = 0;

            let snakeX = snake[0].x; let snakeY = snake[0].y;
            if(d=="LEFT") snakeX -= box; if(d=="UP") snakeY -= box;
            if(d=="RIGHT") snakeX += box; if(d=="DOWN") snakeY += box;

            if(snakeX == food.x && snakeY == food.y) {{
                score += (Math.random()*1000)+100;
                document.getElementById("score").innerText = "PATRIMÔNIO: R$ " + score.toFixed(2);
                food = {{ x: Math.floor(Math.random()*(canvas.width/box))*box, y: Math.floor(Math.random()*(canvas.height/box))*box, symbol: tickers[Math.floor(Math.random()*tickers.length)] }};
            }} else {{ snake.pop(); }}

            let newHead = {{ x: snakeX, y: snakeY }};
            if(snakeX<0 || snakeX>=canvas.width || snakeY<0 || snakeY>=canvas.height || collision(newHead,snake)) {{
                clearInterval(game);
                ctx.fillStyle = "white"; ctx.font = "40px monospace";
                ctx.fillText("BEAR MARKET (GAME OVER)", canvas.width/2 - 250, canvas.height/2);
            }}
            snake.unshift(newHead);
        }}
        function collision(h,a) {{ for(let i=0; i<a.length; i++) {{ if(h.x==a[i].x && h.y==a[i].y) return true; }} return false; }}
        let game = setInterval(draw, 100);
    </script>
    </body>
    </html>
    """
    components.html(game_html, height=600)

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
    # Streamlit buttons don't render well inside HTML hrefs, so we use st.columns and buttons.
    # To simulate the grid, we'll use rows of columns.
    
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

    locked_slots = [
        ("SISTEMA SOLAR (3D)", "🪐"), 
        ("MATRIX RAIN", "💻"), 
        ("NFT GALLERY", "💎"),
        ("CRYPTO MINER", "⛏️"),
        ("AI CHATBOT", "🤖"),
        ("TIME TRAVEL", "⏳"),
        ("HOLODECK", "🧊"),
        ("PORTAL GUN", "🌀"),
        ("SOURCE CODE", "📜")
    ]
    
    # Distribute remaining 9 slots
    cols = [r1c2, r1c3, r1c4] + list(st.columns(4)) + list(st.columns(2)) # Flattening columns for grid logic is tricky in pure python loop, simplistic approach:
    
    # Let's do a cleaner grid loop
    all_placeholders = locked_slots
    
    # We already used r1c1.
    current_col_idx = 0
    grid_cols = [r1c2, r1c3, r1c4]
    
    # Create Row 2
    r2 = st.columns(4)
    grid_cols.extend(r2)
    
    # Create Row 3
    r3 = st.columns(4)
    grid_cols.extend(r3)
    
    for i, (label, icon) in enumerate(all_placeholders):
        if i < len(grid_cols):
            with grid_cols[i]:
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
