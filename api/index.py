import sys
import os

# Adiciona o diretório 'api' no início do sys.path com prioridade absoluta.
# Isso evita que o interpretador Python confunda o pacote 'app' do backend (api/app)
# com a pasta 'app' do Next.js (frontend) localizada na raiz do projeto.
api_dir = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, api_dir)

from app.main import app

