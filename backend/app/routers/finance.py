"""
routers/finance.py
==================
Endpoints de finanças pessoais.
Replica os dados exibidos em 2_Finanças.py.

Endpoints:
  GET /api/finance/overview?month=YYYY-MM  — entradas, saídas, cartões do mês
  GET /api/finance/subscriptions           — assinaturas ativas
  GET /api/finance/installments            — parcelamentos em aberto
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.cache import ttl_cache

logger = logging.getLogger("uvicorn")
router = APIRouter()

SPREADSHEET_NAME = "gdados"
TAB_FINANCAS     = "financas_pessoal"
TAB_ASSINATURAS  = "financas_assinaturas"
TAB_PARCELAMENTOS = "financas_parcelamentos"


# ---------------------------------------------------------------------------
# Helpers com cache
# ---------------------------------------------------------------------------

@ttl_cache(ttl=300)
def _load_financas_raw() -> list[dict]:
    from core.data.gsheets import get_worksheet
    ws = get_worksheet(SPREADSHEET_NAME, TAB_FINANCAS)
    if not ws:
        return []
    rows = ws.get_all_records()
    return rows


@ttl_cache(ttl=300)
def _load_assinaturas_raw() -> list[dict]:
    from core.data.gsheets import get_worksheet
    ws = get_worksheet(SPREADSHEET_NAME, TAB_ASSINATURAS)
    if not ws:
        return []
    return ws.get_all_records()


@ttl_cache(ttl=300)
def _load_parcelamentos_raw() -> list[dict]:
    from core.data.gsheets import get_worksheet
    ws = get_worksheet(SPREADSHEET_NAME, TAB_PARCELAMENTOS)
    if not ws:
        return []
    return ws.get_all_records()


def _parse_valor(v) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(str(v).replace(".", "").replace(",", "."))
    except (ValueError, TypeError):
        return 0.0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/overview")
def get_overview(month: Optional[str] = Query(None, description="Mês no formato YYYY-MM")) -> dict:
    """
    Retorna entradas, saídas, cartões e poupança do mês selecionado.
    Se month não for informado, usa o mês atual do dado no sheet
    (a aba armazena um período por vez).
    """
    try:
        rows = _load_financas_raw()

        entradas, saidas, cartoes, poupanca = [], [], [], []

        for row in rows:
            categoria = str(row.get("Categoria", "")).lower().strip()
            nome      = row.get("Nome", "")
            valor     = _parse_valor(row.get("Valor", 0))

            item = {"nome": nome, "valor": valor}

            if categoria == "entrada":
                entradas.append(item)
            elif categoria == "saida":
                saidas.append(item)
            elif categoria == "cartao":
                cartoes.append(item)
            elif categoria == "poupanca":
                poupanca.append(item)

        total_entradas = sum(i["valor"] for i in entradas)
        total_saidas   = sum(i["valor"] for i in saidas)
        total_cartoes  = sum(i["valor"] for i in cartoes)
        poupanca_esperada = sum(i["valor"] for i in poupanca)
        saldo = total_entradas - total_saidas - total_cartoes

        return {
            "month": month,
            "entradas": entradas,
            "saidas": saidas,
            "cartoes": cartoes,
            "poupanca": poupanca,
            "totais": {
                "entradas": round(total_entradas, 2),
                "saidas": round(total_saidas, 2),
                "cartoes": round(total_cartoes, 2),
                "poupanca_esperada": round(poupanca_esperada, 2),
                "saldo": round(saldo, 2),
            },
        }
    except Exception as exc:
        logger.exception("Erro em /finance/overview")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/subscriptions")
def get_subscriptions() -> list[dict]:
    """Lista de assinaturas recorrentes com nome, valor, dia de cobrança e status."""
    try:
        rows = _load_assinaturas_raw()
        result = []
        for row in rows:
            ativa = str(row.get("Ativa", "sim")).lower().strip()
            result.append({
                "nome":  row.get("Nome", ""),
                "valor": _parse_valor(row.get("Valor", 0)),
                "dia":   row.get("Dia", ""),
                "ativa": ativa not in ("não", "nao", "no", "false", "0"),
            })
        return result
    except Exception as exc:
        logger.exception("Erro em /finance/subscriptions")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/installments")
def get_installments() -> list[dict]:
    """Parcelamentos em aberto com valor total, nº de parcelas e data da compra."""
    try:
        rows = _load_parcelamentos_raw()
        result = []
        for row in rows:
            result.append({
                "nome":        row.get("Nome", ""),
                "valor_total": _parse_valor(row.get("Valor_Total", 0)),
                "parcelas":    row.get("Parcelas", ""),
                "data_compra": row.get("Data_Compra", ""),
            })
        return result
    except Exception as exc:
        logger.exception("Erro em /finance/installments")
        raise HTTPException(status_code=500, detail=str(exc))
