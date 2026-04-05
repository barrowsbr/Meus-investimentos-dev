#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# 1. GCP Service Account (Google Sheets / Drive)
#    Injetado via GCP_SERVICE_ACCOUNT_JSON env var (Cloud Run secret)
# ---------------------------------------------------------------------------
if [ -n "$GCP_SERVICE_ACCOUNT_JSON" ] && [ ! -f "dash/Dash/service_account.json" ]; then
    mkdir -p dash/Dash
    printf '%s' "$GCP_SERVICE_ACCOUNT_JSON" > dash/Dash/service_account.json
fi

# ---------------------------------------------------------------------------
# 2. Inicia FastAPI com Uvicorn
#    Cloud Run injeta $PORT (padrão 8080)
# ---------------------------------------------------------------------------
exec uvicorn backend.app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8080}" \
    --workers 1
