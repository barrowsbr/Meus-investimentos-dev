#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# 1. GCP Service Account (Google Sheets / Drive)
#    Injetado via GCP_SERVICE_ACCOUNT_JSON env var (Cloud Run secret).
#    service_account.json vai para /app/backend/ — mesmo diretório que
#    core/data/gsheets.py resolve como project_root (dois níveis acima de data/).
# ---------------------------------------------------------------------------
if [ -n "$GCP_SERVICE_ACCOUNT_JSON" ] && [ ! -f "/app/backend/service_account.json" ]; then
    printf '%s' "$GCP_SERVICE_ACCOUNT_JSON" > /app/backend/service_account.json
fi

# ---------------------------------------------------------------------------
# 2. Inicia FastAPI com Uvicorn
#    Roda de dentro de /app/backend/ para que 'import app.*' e 'import core.*' funcionem.
#    Cloud Run injeta $PORT (padrão 8080)
# ---------------------------------------------------------------------------
cd /app/backend
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8080}" \
    --workers 1
