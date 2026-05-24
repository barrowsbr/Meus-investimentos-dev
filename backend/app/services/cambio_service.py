"""Câmbio metrics, PTAX, and lb_historic — port of lib/cambio.ts."""
from __future__ import annotations

import unicodedata
from typing import Any, Optional

from app.core.format import to_number
from app.models.schemas import CambioMetrics, CambioOp, FxRates, LbHistoricoEntry, PtaxRates

Row = dict[str, Any]


def _fuzzy_get(row: Row, *patterns: str) -> Any:
    """Try keys in order, then normalized match, then substring."""
    keys = list(row.keys())

    for p in patterns:
        v = row.get(p)
        if v is not None and v != "":
            return v

    def _norm(s: str) -> str:
        nfc = unicodedata.normalize("NFD", s)
        stripped = "".join(c for c in nfc if not unicodedata.combining(c))
        return stripped.lower().replace("_", "").replace(" ", "")

    for p in patterns:
        pn = _norm(p)
        for k in keys:
            if _norm(k) == pn:
                v = row[k]
                if v is not None and v != "":
                    return v

    for p in patterns:
        for k in keys:
            if p.lower() in k.lower():
                v = row[k]
                if v is not None and v != "":
                    return v

    return None


def calcular_cambio_metrics(cambio_rows: list[Row], fx_atual: FxRates) -> CambioMetrics:
    total_brl_para_usd = 0.0
    total_usd_recebido = 0.0
    total_brl_para_eur = 0.0
    total_eur_recebido = 0.0
    total_brl_para_cad = 0.0
    total_cad_recebido = 0.0
    total_brl_para_gbp = 0.0
    total_gbp_recebido = 0.0
    total_enviado_brl = 0.0
    rows_parsed = 0

    historico: list[CambioOp] = []

    for row in cambio_rows:
        moeda_orig = str(_fuzzy_get(row, "moeda_origem", "moeda origem", "de", "origem") or "BRL").upper().strip()
        moeda_dest = str(_fuzzy_get(row, "moeda_destino", "moeda destino", "para", "destino") or "USD").upper().strip()
        valor_orig = abs(to_number(_fuzzy_get(row, "valor_origem", "valor entrada", "valor_entrada", "valor enviado", "enviado", "brl")) or 0)
        valor_dest = abs(to_number(_fuzzy_get(row, "valor_destino", "valor saída", "valor_saida", "valor saida", "valor recebido", "recebido", "usd")) or 0)
        taxa_raw = to_number(_fuzzy_get(row, "taxa", "vet", "câmbio", "cambio", "cotação", "cotacao", "rate"))
        taxa = taxa_raw if taxa_raw is not None else (valor_orig / valor_dest if valor_orig > 0 and valor_dest > 0 else 0)
        data = str(_fuzzy_get(row, "data", "date") or "")
        corretora = str(_fuzzy_get(row, "corretora", "corretora destino", "instituição", "instituicao", "banco") or "")

        if valor_orig == 0 and valor_dest == 0 and taxa == 0:
            continue
        rows_parsed += 1

        historico.append(CambioOp(
            data=data,
            moeda_origem=moeda_orig,
            moeda_destino=moeda_dest,
            valor_origem=valor_orig,
            valor_destino=valor_dest,
            taxa=taxa,
            corretora=corretora,
        ))

        if moeda_orig in ("BRL", ""):
            total_enviado_brl += valor_orig
            if moeda_dest in ("USD", ""):
                total_brl_para_usd += valor_orig
                total_usd_recebido += valor_dest
            elif moeda_dest == "EUR":
                total_brl_para_eur += valor_orig
                total_eur_recebido += valor_dest
            elif moeda_dest == "CAD":
                total_brl_para_cad += valor_orig
                total_cad_recebido += valor_dest
            elif moeda_dest == "GBP":
                total_brl_para_gbp += valor_orig
                total_gbp_recebido += valor_dest

    if total_brl_para_usd == 0 and total_usd_recebido > 0:
        usd_ops = [h for h in historico if h.moeda_destino == "USD" and h.taxa > 0]
        weighted = sum(h.taxa * h.valor_destino for h in usd_ops)
        if weighted > 0:
            total_brl_para_usd = total_usd_recebido * (weighted / total_usd_recebido)

    pm_dolar = total_brl_para_usd / total_usd_recebido if total_usd_recebido > 0 else fx_atual.USDBRL
    pm_euro = total_brl_para_eur / total_eur_recebido if total_eur_recebido > 0 else fx_atual.EURBRL
    pm_cad = total_brl_para_cad / total_cad_recebido if total_cad_recebido > 0 else fx_atual.CADBRL
    pm_gbp = total_brl_para_gbp / total_gbp_recebido if total_gbp_recebido > 0 else fx_atual.GBPBRL

    ganho_cambial_usd_brl = total_usd_recebido * (fx_atual.USDBRL - pm_dolar) if total_usd_recebido > 0 else 0

    return CambioMetrics(
        pm_dolar=pm_dolar,
        pm_euro=pm_euro,
        pm_cad=pm_cad,
        pm_gbp=pm_gbp,
        total_enviado_brl=total_enviado_brl,
        total_recebido_usd=total_usd_recebido,
        total_recebido_eur=total_eur_recebido,
        ganho_cambial_usd_brl=ganho_cambial_usd_brl,
        operacoes=len(historico),
        historico=historico,
    )


def build_pm_fx_rates(cambio: CambioMetrics) -> FxRates:
    return FxRates(
        USDBRL=cambio.pm_dolar,
        EURBRL=cambio.pm_euro,
        GBPBRL=cambio.pm_gbp,
        CADBRL=cambio.pm_cad,
    )


def parse_ptax(ptax_rows: list[Row]) -> Optional[PtaxRates]:
    if not ptax_rows:
        return None

    latest_date = ""
    latest_usd = 0.0
    latest_eur = 0.0

    for row in ptax_rows:
        data = str(_fuzzy_get(row, "data", "date", "data cotação", "data cotacao") or "")
        moeda = str(_fuzzy_get(row, "moeda", "currency", "par") or "USD").upper()
        venda = to_number(_fuzzy_get(row, "venda", "ptax_venda", "cotacao", "cotação", "valor", "ptax")) or 0

        if not data or venda == 0:
            continue

        if data >= latest_date:
            latest_date = data
            if "USD" in moeda or "EUR" not in moeda:
                latest_usd = venda
            if "EUR" in moeda:
                latest_eur = venda

    if latest_usd == 0:
        return None
    return PtaxRates(
        USDBRL=latest_usd,
        EURBRL=latest_eur or latest_usd * 1.08,
        data=latest_date,
    )


def parse_lb_historic(rows: list[Row]) -> list[LbHistoricoEntry]:
    result: list[LbHistoricoEntry] = []

    for row in rows:
        data = str(_fuzzy_get(row, "data", "date", "mes", "mês") or "")
        if not data:
            continue
        patrimonio = to_number(_fuzzy_get(row, "patrimonio", "patrimônio", "total", "patrimonio_total")) or 0
        rv = to_number(_fuzzy_get(row, "rv", "renda_variavel", "renda variável", "renda variavel")) or 0
        rf = to_number(_fuzzy_get(row, "rf", "renda_fixa", "renda fixa")) or 0

        if patrimonio == 0 and rv == 0 and rf == 0:
            continue
        result.append(LbHistoricoEntry(
            data=data,
            patrimonio=patrimonio or (rv + rf),
            rv=rv,
            rf=rf,
        ))

    result.sort(key=lambda e: e.data)
    return result
