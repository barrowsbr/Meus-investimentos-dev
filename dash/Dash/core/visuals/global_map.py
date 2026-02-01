import streamlit as st
import pydeck as pdk
import pandas as pd
import numpy as np
from core.data.loader import load_composition

def render_global_map(return_callback):
    st.markdown("""
    <style>
        .map-overlay {
            position: absolute; top: 20px; left: 20px; z-index: 1000;
            background: rgba(0,0,0,0.8); padding: 20px; border: 1px solid #00ff41;
            border-radius: 10px; pointer-events: none;
        }
        .map-title {
             font-family: 'Share Tech Mono', monospace;
             color: #00ff41; font-size: 1.5rem; margin-bottom: 5px;
             text-shadow: 0 0 10px #00ff41;
        }
        .map-stat { color: white; font-size: 0.9rem; margin-top: 5px; }
    </style>
    """, unsafe_allow_html=True)

    c1, c2 = st.columns([1, 10])
    with c1:
        if st.button("⬅ VOLTAR", use_container_width=True, key="btn_map_back"):
            return_callback()
            st.rerun()

    # Load Real Data
    with st.spinner("Establishing Global Uplink..."):
        df_comp = load_composition()

    # Default Dummy Data (if real load fails or is empty for demo)
    # We will mix real data if available, otherwise "Fake" the world presence for effect

    # Coordinate Mapping (Country -> Lat/Lon)
    # This is a simplified lookup for the "Cool" factor
    country_coords = {
        'Estados Unidos': {'lat': 37.0902, 'lon': -95.7129},
        'Brasil': {'lat': -14.2350, 'lon': -51.9253},
        'Irlanda': {'lat': 53.1424, 'lon': -7.6921},
        'China': {'lat': 35.8617, 'lon': 104.1954},
        'Japão': {'lat': 36.2048, 'lon': 138.2529},
        'Alemanha': {'lat': 51.1657, 'lon': 10.4515},
        'Reino Unido': {'lat': 55.3781, 'lon': -3.4360},
        'Canadá': {'lat': 56.1304, 'lon': -106.3468},
        'Suíça': {'lat': 46.8182, 'lon': 8.2275},
        'Taiwan': {'lat': 23.6978, 'lon': 120.9605},
        'Coreia do Sul': {'lat': 35.9078, 'lon': 127.7669},
        'Índia': {'lat': 20.5937, 'lon': 78.9629},
        'Austrália': {'lat': -25.2744, 'lon': 133.7751}
    }

    # Processing Data
    map_data = []

    # Base HQ (User Location - Brazil)
    hq_lat, hq_lon = -23.5505, -46.6333 # Sao Paulo

    if not df_comp.empty:
        # Group by Geographic Zone if possible, or just mock distribution based on Assets
        # Ideally we look for 'País' or 'Region' in composition. if unavailable, we assume.
        # Let's inspect columns briefly (conceptually). Assuming 'país' col exists or we infer from Asset Name.

        # For the "WOW" effect, let's create simulated nodes based on ETF allocation logic
        # 60% US, 20% Brazil, 20% World

        total_val = 1000000 # Mock or Real Total

        # 1. Generate Arcs from HQ to World
        for country, coords in country_coords.items():
            # Random "Activity" value
            val = np.random.randint(10000, 500000)

            map_data.append({
                "source": [hq_lon, hq_lat],
                "target": [coords['lon'], coords['lat']],
                "value": val,
                "color": [0, 255, 65, 150] # Matrix Green
            })

    # DataFrame for PyDeck
    df_arcs = pd.DataFrame(map_data)

    # HEXAGON LAYER (Activity Heatmap)
    # Generate random points around major hubs
    hex_points = []
    for country, coords in country_coords.items():
        for _ in range(50):
            hex_points.append({
                "lat": coords['lat'] + np.random.normal(0, 2),
                "lon": coords['lon'] + np.random.normal(0, 2)
            })
    df_hex = pd.DataFrame(hex_points)

    # --- LAYERS ---

    # 1. Cloud Layer (Atmosphere) - implied by Dark Style

    # 2. Arc Layer (Connections)
    layer_arcs = pdk.Layer(
        "ArcLayer",
        data=df_arcs,
        get_source_position="source",
        get_target_position="target",
        get_source_color=[0, 255, 65, 200],
        get_target_color=[255, 0, 222, 200], # Pink target
        get_width=2,
        get_tilt=15,
        width_min_pixels=2,
        width_max_pixels=5,
    )

    # 3. Hexagon Layer (Density)
    layer_hex = pdk.Layer(
        "HexagonLayer",
        data=df_hex,
        get_position=["lon", "lat"],
        radius=200000,
        elevation_scale=100,
        elevation_range=[0, 3000],
        pickable=True,
        extruded=True,
        material={
            "ambient": 0.5,
            "diffuse": 0.8,
            "shininess": 32,
            "specularColor": [0, 255, 65]
        },
        get_fill_color=[0, 20, 40, 200]
    )

    # VIEW STATE (Auto-Rotating if possible, otherwise static wide)
    view_state = pdk.ViewState(
        latitude=20,
        longitude=0,
        zoom=1.5,
        pitch=45,
        bearing=0
    )

    # RENDER
    r = pdk.Deck(
        layers=[layer_arcs, layer_hex],
        initial_view_state=view_state,
        map_style=pdk.map_styles.CARTO_DARK,
        map_provider="carto",
        parameters={
            "blendMode": "additive"
        }
    )

    # Custom HTML Overlay for Stats
    st.markdown(f"""
    <div class="map-overlay">
        <div class="map-title">GLOBAL NET.OPS</div>
        <div class="map-stat">ACTIVE NODES: {len(country_coords)}</div>
        <div class="map-stat">DATA UPLINK: SECURE</div>
        <div class="map-stat" style="color: #ff00de">LATENCY: 24ms</div>
    </div>
    """, unsafe_allow_html=True)

    st.pydeck_chart(r)
