#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# 1. GCP Service Account (Google Sheets / Drive)
#    Inject via GCP_SERVICE_ACCOUNT_JSON env var (Cloud Run secret)
# ---------------------------------------------------------------------------
if [ -n "$GCP_SERVICE_ACCOUNT_JSON" ] && [ ! -f "service_account.json" ]; then
    echo "$GCP_SERVICE_ACCOUNT_JSON" > service_account.json
fi

# ---------------------------------------------------------------------------
# 2. Streamlit secrets (.streamlit/secrets.toml)
#    Inject GEMINI_API_KEY via env var
# ---------------------------------------------------------------------------
mkdir -p .streamlit

if [ ! -f ".streamlit/secrets.toml" ]; then
    touch .streamlit/secrets.toml
fi

if [ -n "$GEMINI_API_KEY" ] && ! grep -q "GEMINI_API_KEY" .streamlit/secrets.toml; then
    echo "GEMINI_API_KEY = \"$GEMINI_API_KEY\"" >> .streamlit/secrets.toml
fi

# ---------------------------------------------------------------------------
# 3. Start Streamlit
#    Cloud Run sets $PORT (usually 8080); fallback to 8080
# ---------------------------------------------------------------------------
exec streamlit run Home.py \
    --server.port="${PORT:-8080}" \
    --server.address=0.0.0.0 \
    --server.headless=true \
    --browser.gatherUsageStats=false
