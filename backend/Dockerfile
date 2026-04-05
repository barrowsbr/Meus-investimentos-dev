FROM python:3.11-slim

WORKDIR /app

# Instala dependências (aproveita layer cache)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código da aplicação
# core/ agora reside dentro de backend/ — sem dependência de legado/
COPY backend/ ./backend/

# Remove secrets que NÃO devem estar na imagem
# (injetados em runtime via Cloud Run secret env vars)
RUN rm -f backend/service_account.json

# Entrypoint injeta secrets em runtime
COPY backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Cloud Run usa PORT=8080 por padrão
EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
