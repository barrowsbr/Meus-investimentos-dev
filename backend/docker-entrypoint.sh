#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# 1. GCP Service Account (Google Sheets / Drive)
#    Injetado via GCP_SERVICE_ACCOUNT_JSON env var (Cloud Run secret)
# ---------------------------------------------------------------------------
if [ -n "$GCP_SERVICE_ACCOUNT_JSON" ] && [ ! -f "/app/dash/Dash/service_account.json" ]; then
    mkdir -p /app/dash/Dash
    printf '%s' "$GCP_SERVICE_ACCOUNT_JSON" > /app/dash/Dash/service_account.json
fi

# ---------------------------------------------------------------------------
# 2. Inicia FastAPI com Uvicorn
#    Roda de dentro de /app/backend/ para que 'import app.*' funcione.
#    PYTHONPATH inclui /app/backend (pacotes locais) e /app (para 'import core.*' via dash/Dash).
#    Cloud Run injeta $PORT (padrão 8080)
# ---------------------------------------------------------------------------
cd /app/backend
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8080}" \
    --workers 1
