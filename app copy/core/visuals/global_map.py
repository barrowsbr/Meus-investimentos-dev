import streamlit as st
import pydeck as pdk
import pandas as pd
import numpy as np
from core.data.loader import load_composition

def render_global_map(return_callback):
    st.markdown("""
    <style>
        /* Overlay removed as requested */
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
    
    # 1. Aggregate Data by Country (Keyword Matching mock-up for demo)
    # Real logic would need a 'Country' column in df_comp
    country_assets = {c: [] for c in country_coords.keys()}
    
    if not df_comp.empty:
        # Try to map assets to countries via keywords
        # If no match, assign to "Global" or random
        for idx, row in df_comp.iterrows():
            asset_name = str(row.get('ativo', row.get('ticker', 'Unknown')))
            val = float(row.get('valor_atual', row.get('total', 0)))
            
            # Simple Keyword Logic
            assigned = False
            lower_name = asset_name.lower()
            
            if any(x in lower_name for x in ['usa', 'eua', 'sp500', 'nasdaq', 'ivvb']):
                country_assets['Estados Unidos'].append(f"{asset_name} (${val/1000:.1f}k)")
                assigned = True
            elif any(x in lower_name for x in ['china', 'asia']):
                country_assets['China'].append(f"{asset_name} (${val/1000:.1f}k)")
                assigned = True
            elif any(x in lower_name for x in ['europe', 'europa', 'germany']):
                country_assets['Alemanha'].append(f"{asset_name} (${val/1000:.1f}k)")
                assigned = True
            elif any(x in lower_name for x in ['japao', 'japan']):
                country_assets['Japão'].append(f"{asset_name} (${val/1000:.1f}k)")
                assigned = True
            
            # If standard BR asset (default)
            if not assigned:
                country_assets['Brasil'].append(f"{asset_name} (${val/1000:.1f}k)")

    # 2. Generate Layers Data
    for country, coords in country_coords.items():
        # Get Assets for this country
        assets = country_assets.get(country, [])
        
        # If no real assets, generate "Ghost" data for the Easter Egg vibe
        if not assets:
            if country == 'Estados Unidos': assets = ["US-GOV BONDS", "NVIDIA CORP", "TESLA INC"]
            elif country == 'China': assets = ["TENCENT", "ALIBABA GRP"]
            elif country == 'Japão': assets = ["SONY GRP", "TOYOTA MOTORS"]
            elif country == 'Alemanha': assets = ["SIEMENS AG", "SAP SE"]
            else: assets = ["CLASSIFIED ASSET", "OFFSHORE ACCOUNT"]
            
        # Format for Tooltip
        asset_str = "<br>".join(assets[:5]) # Top 5
        if len(assets) > 5: asset_str += f"<br>...and {len(assets)-5} more"
        
        # Calculate Mock Value based on asset count (or real sum if we implemented it properly)
        node_val = len(assets) * 15000 + np.random.randint(5000, 50000)

        map_data.append({
            "source": [hq_lon, hq_lat],
            "target": [coords['lon'], coords['lat']],
            "country": country,
            "value": node_val,
            "assets": asset_str,
            "color": [0, 255, 65, 100] # Matrix Green
        })

    # DataFrame for PyDeck
    df_arcs = pd.DataFrame(map_data)
    
    # HEXAGON LAYER (Activity Heatmap) - slightly randomized around targets
    hex_points = []
    for item in map_data:
        t_lon, t_lat = item['target']
        # Create a cluster proportional to value
        count = int(item['value'] / 5000)
        for _ in range(max(5, count)):
            hex_points.append({
                "lat": t_lat + np.random.normal(0, 1.5),
                "lon": t_lon + np.random.normal(0, 1.5)
            })
    df_hex = pd.DataFrame(hex_points)

    # --- LAYERS ---
    
    # 1. Arc Layer (Connections)
    layer_arcs = pdk.Layer(
        "ArcLayer",
        data=df_arcs,
        get_source_position="source",
        get_target_position="target",
        get_source_color=[0, 255, 65, 160],
        get_target_color=[255, 0, 222, 160], # Pink target
        get_width=3,
        get_tilt=15,
        width_min_pixels=2,
        pickable=True, # Allow tooltip
        auto_highlight=True,
    )
    
    # 2. Scatter/Text Layer for Node Info (Visible Markers)
    layer_scatter = pdk.Layer(
        "ScatterplotLayer",
        data=df_arcs,
        get_position="target",
        get_color=[255, 255, 255, 200],
        get_radius=200000,
        pickable=True, # Crucial for tooltip
        auto_highlight=True,
        stroked=True,
        filled=True,
        radius_min_pixels=5,
        radius_max_pixels=20,
    )

    # 3. Hexagon Layer (Density)
    layer_hex = pdk.Layer(
        "HexagonLayer",
        data=df_hex,
        get_position=["lon", "lat"],
        radius=200000,
        elevation_scale=50,
        elevation_range=[0, 2000],
        pickable=False,
        extruded=True,
        material={
            "ambient": 0.5,
            "diffuse": 0.8,
            "shininess": 32,
            "specularColor": [0, 255, 65]
        },
        get_fill_color=[0, 60, 30, 180] 
    )

    # VIEW STATE
    view_state = pdk.ViewState(
        latitude=20,
        longitude=0,
        zoom=1.2,
        pitch=40,
        bearing=0
    )
    
    # RENDER
    # Tooltip Configuration
    tooltip = {
        "html": "<b>{country}</b><br><br><b>HOLDINGS:</b><br>{assets}<br><br><b>TOTAL EXP:</b> ${value}",
        "style": {
            "backgroundColor": "rgba(0, 0, 0, 0.9)",
            "color": "#00ff41",
            "fontSize": "12px",
            "fontFamily": "Share Tech Mono, monospace",
            "border": "1px solid #00ff41",
            "borderRadius": "5px",
            "padding": "10px"
        }
    }

    r = pdk.Deck(
        layers=[layer_hex, layer_arcs, layer_scatter],
        initial_view_state=view_state,
        map_style=pdk.map_styles.CARTO_DARK, 
        map_provider="carto",
        tooltip=tooltip, # ENABLE TOOLTIP
        parameters={
            "blendMode": "additive"
        }
    )

    # st.markdown(f"""
    # <div class="map-overlay">
    #     <div class="map-title">GLOBAL NET.OPS</div>
    #     <div class="map-stat">ACTIVE NODES: {len(country_coords)}</div>
    #     <div class="map-stat">DATA UPLINK: SECURE</div>
    #     <div class="map-stat" style="color: #ff00de">LATENCY: 24ms</div>
    # </div>
    # """, unsafe_allow_html=True)

    st.pydeck_chart(r)
