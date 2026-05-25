import sys
import os

# Adiciona o diretório 'backend' ao sys.path para que as importações
# como 'from app.config import settings' resolvam para backend/app/.
# A pasta 'backend' fica FORA de 'api/' para que a Vercel não trate
# os arquivos Python internos como funções serverless separadas.
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, backend_dir)

from app.main import app
