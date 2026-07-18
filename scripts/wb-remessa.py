#!/usr/bin/env python3
# Balanço de branco de UMA remessa de fotos da coleção — refaz a foto a partir
# do ORIGINAL do CDN (CoinSnap) corrigindo o tom da luz da sessão fotográfica.
#
# Análise da remessa de 18/07 (luz amarela/tungstênio), medida no canal b* do
# LAB sobre a mediana dos pixels da moeda, comparando com o acervo antigo:
#   • prateadas (aço/níquel/cupro/alumínio): b* +18 na remessa vs +7 no acervo
#     → correção POR FOTO rumo ao baseline (a*=-1, b*=+7), limitada;
#   • bimetálicas: +21 vs +16 → ajuste leve FIXO (Δa*=-1, Δb*=-5);
#   • quentes (bronze/latão/cobre): +25 vs +26,5 — JÁ batem com o acervo,
#     ficam INTACTAS (remover amarelo delas apagaria a cor do metal).
# O fundo preto não é tocado (rampa por luminância). Depois deste passo, o
# realce padrão (scripts/realce-moedas.py) roda em cima — 1 geração de JPEG só.
#
# Uso: python3 scripts/wb-remessa.py scripts/.remessa-wb.json
#   json: [{"arquivo": "public/colecao-moedas/x.webp", "url": "https://...",
#           "classe": "prateada"|"bimetal"|"quente"}, ...]
import json
import sys
import urllib.request

import cv2
import numpy as np

ALVO_A, ALVO_B = -1.0, 7.0     # baseline do acervo (prateadas)
BIMETAL_DA, BIMETAL_DB = -1.0, -5.0

def corrigir(img: np.ndarray, classe: str) -> np.ndarray:
    if classe == "quente":
        return img
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = lab[:, :, 0], lab[:, :, 1], lab[:, :, 2]
    if classe == "prateada":
        m = L > 40
        if m.sum() < 500:
            return img
        # só REMOVE amarelo/vermelho (nunca adiciona), com teto de segurança
        da = float(np.clip(ALVO_A - (np.median(A[m]) - 128), -16, 0))
        db = float(np.clip(ALVO_B - (np.median(B[m]) - 128), -18, 0))
    else:  # bimetal
        da, db = BIMETAL_DA, BIMETAL_DB
    peso = np.clip((L - 14.0) / 18.0, 0, 1)  # fundo preto intocado
    lab[:, :, 1] = np.clip(A + da * peso, 0, 255)
    lab[:, :, 2] = np.clip(B + db * peso, 0, 255)
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

if __name__ == "__main__":
    itens = json.load(open(sys.argv[1]))
    ok = 0
    for it in itens:
        try:
            req = urllib.request.Request(it["url"], headers={"User-Agent": "Mozilla/5.0"})
            dados = urllib.request.urlopen(req, timeout=30).read()
            img = cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                print(f"PULADO (nao decodificou): {it['arquivo']}")
                continue
            out = corrigir(img, it["classe"])
            # intermediário em alta qualidade — o realce reencoda em q85 depois
            okenc, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 96])
            if okenc:
                open(it["arquivo"], "wb").write(buf.tobytes())
                ok += 1
        except Exception as e:  # uma foto com erro não derruba a remessa
            print(f"FALHOU {it['arquivo']}: {e}")
    print(f"{ok}/{len(itens)} fotos rebalanceadas (originais + WB)")
