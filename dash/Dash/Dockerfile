FROM python:3.11-slim

# Install nginx
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app files
COPY . .

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Make start script executable
RUN chmod +x start.sh

# Expose port (Railway uses PORT env variable)
EXPOSE 8080

# Start nginx + streamlit
CMD ["./start.sh"]
