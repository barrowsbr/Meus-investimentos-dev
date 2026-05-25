import sys
import os

# Adiciona o diretório raiz e o diretório do backend ao sys.path.
# Isso garante que todas as importações (como "from app.config import settings")
# funcionem corretamente no ambiente do Vercel Serverless.
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, root_dir)
sys.path.insert(0, os.path.join(root_dir, "backend"))

from app.main import app
