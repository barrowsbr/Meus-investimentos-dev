#!/usr/bin/env python3
# Realce das fotos da coleção de moedas — o MESMO pipeline aplicado em massa às
# 416 fotos originais (18/07): doma reflexos especulares e realça o relevo,
# mantendo 512x512, fundo preto e o nome do arquivo (JPEG, extensão .webp do
# CoinSnap). Uso:
#   python3 scripts/realce-moedas.py --dir public/colecao-moedas          # tudo
#   python3 scripts/realce-moedas.py --files-list novas.txt               # só as listadas
# Requer: pip install opencv-python-headless numpy
import argparse
import glob
import os

import cv2
import numpy as np


def realcar(bgr: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    L, A, B = cv2.split(lab)
    L = L.astype(np.float32)

    # 1) Domar reflexos: compressao suave dos brilhos (soft knee acima de ~210)
    knee = 210.0
    alto = L > knee
    L[alto] = knee + (L[alto] - knee) * 0.6

    # 2) Suprimir brilho especular localizado (muito acima da mediana do entorno)
    med = cv2.medianBlur(L.astype(np.uint8), 21).astype(np.float32)
    excesso = np.clip(L - med - 35.0, 0, None)
    L = L - excesso * 0.3

    L8 = np.clip(L, 0, 255).astype(np.uint8)

    # 3) CLAHE no canal L — realca o relevo sem estourar cor
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    Lc = clahe.apply(L8)

    # 3b) Preserva o brilho medio da MOEDA (pecas claras nao escurecem)
    moeda = L8 > 32
    if moeda.any():
        alvo = float(np.mean(cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)[:, :, 0][moeda]))
        atual = float(np.mean(Lc[moeda]))
        ganho = np.clip(alvo / max(atual, 1.0), 0.95, 1.2)
        Lc = np.clip(Lc.astype(np.float32) * ganho, 0, 255).astype(np.uint8)

    lab2 = cv2.merge([Lc, A, B])
    out = cv2.cvtColor(lab2, cv2.COLOR_LAB2BGR)

    # 4) Unsharp leve para nitidez do relevo
    borrada = cv2.GaussianBlur(out, (0, 0), 2.0)
    out = cv2.addWeighted(out, 1.35, borrada, -0.35, 0)

    # 5) Fundo continua PRETO (rampa por luminancia — nao levanta ruido)
    L_orig = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32)
    peso = np.clip((L_orig - 14.0) / 18.0, 0.0, 1.0)
    peso = cv2.GaussianBlur(peso, (0, 0), 1.5)[..., None]
    out = out.astype(np.float32) * peso + bgr.astype(np.float32) * (1 - peso)
    return np.clip(out, 0, 255).astype(np.uint8)


def processar(caminho: str) -> bool:
    dados = np.fromfile(caminho, dtype=np.uint8)
    img = cv2.imdecode(dados, cv2.IMREAD_COLOR)
    if img is None:
        print(f"PULADO (nao decodificou): {caminho}")
        return False
    ok, buf = cv2.imencode(".jpg", realcar(img), [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        return False
    buf.tofile(caminho)  # sobrescreve no lugar, mesmo nome
    return True


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dir", help="processa todos os .webp do diretório")
    g.add_argument("--files-list", help="arquivo texto com um caminho por linha")
    args = ap.parse_args()

    if args.dir:
        arquivos = sorted(glob.glob(os.path.join(args.dir, "*.webp")))
    else:
        with open(args.files_list) as f:
            arquivos = [l.strip() for l in f if l.strip()]

    ok = sum(1 for a in arquivos if processar(a))
    print(f"{ok}/{len(arquivos)} fotos realçadas")
