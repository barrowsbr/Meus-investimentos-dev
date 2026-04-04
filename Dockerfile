FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY dash/Dash/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY dash/Dash/ .

# Entrypoint script (generates secrets at runtime from env vars)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Cloud Run injects PORT (default 8080); Streamlit default is 8501
EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
