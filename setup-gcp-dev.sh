#!/bin/bash
# setup-gcp-dev.sh
# ================
# Configura o projeto GCP para o serviço meus-investimentos-dev (FastAPI).
# Execute UMA VEZ antes do primeiro deploy.
#
# Pré-requisito: gcloud CLI autenticado com permissão de admin no projeto.
#
# Uso:
#   chmod +x setup-gcp-dev.sh
#   ./setup-gcp-dev.sh

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="southamerica-east1"
SERVICE_NAME="meus-investimentos-dev"
REPO_NAME="cloud-run-source-deploy"

echo ">>> Projeto: $PROJECT_ID"
echo ">>> Região:  $REGION"
echo ">>> Serviço: $SERVICE_NAME"
echo ""

# ── 1. Cria repositório no Artifact Registry (se não existir) ──────────────
echo ">>> [1/3] Verificando Artifact Registry..."
if ! gcloud artifacts repositories describe "$REPO_NAME" \
    --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "    Criando repositório $REPO_NAME..."
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --description="Docker images para Cloud Run"
else
  echo "    Repositório já existe. OK."
fi

# ── 2. Garante que as secrets necessárias existem ──────────────────────────
echo ">>> [2/3] Verificando secrets..."
for SECRET in gcp-sa-json gemini-key; do
  if gcloud secrets describe "$SECRET" --project="$PROJECT_ID" &>/dev/null; then
    echo "    Secret '$SECRET' já existe. OK."
  else
    echo "    ATENÇÃO: Secret '$SECRET' não encontrada!"
    echo "    Crie-a em: https://console.cloud.google.com/security/secret-manager"
  fi
done

# ── 3. Cria trigger do Cloud Build apontando para o repo dev ───────────────
echo ">>> [3/3] Criando trigger do Cloud Build..."
echo ""
echo "    Execute no console GCP ou use o comando abaixo:"
echo ""
echo "    gcloud builds triggers create github \\"
echo "      --project=$PROJECT_ID \\"
echo "      --repo-name=Meus-investimentos-dev \\"
echo "      --repo-owner=barrowsbr \\"
echo "      --branch-pattern='^main$' \\"
echo "      --build-config=cloudbuild.yaml \\"
echo "      --name=meus-investimentos-dev-trigger \\"
echo "      --region=global"
echo ""
echo "    IMPORTANTE: Conecte o repositório GitHub antes:"
echo "    https://console.cloud.google.com/cloud-build/triggers/connect"
echo ""
echo ">>> Setup concluído!"
