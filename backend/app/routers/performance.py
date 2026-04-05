"""
routers/performance.py
======================
Endpoints de performance e histórico patrimonial.
Replica os dados de 3_Performance.py, 6_Historico_Patrimonial.py e
10_Performance_Advanced.py.

Endpoints:
  GET /api/performance/twr          — retorno TWR canônico por período
  GET /api/performance/nav-series   — série histórica de NAV
  GET /api/performance/advanced     — MWR, atribuição, decomposição
  GET /api/performance/history      — histórico patrimonial (lb_historic)
"""
from __future__ import annotations

import logging
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.cache import ttl_cache

logger = logging.getLogger("uvicorn")
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers com cache
# ---------------------------------------------------------------------------

@ttl_cache(ttl=600)
def _load_all_data():
    """Carrega todos os dados necessários para cálculo de performance."""
    from core.data.loader import load_assets, load_proventos, load_fixed_income, load_cambio
    df_assets   = load_assets()
    df_prov     = load_proventos()
    df_rf       = load_fixed_income()
    df_cambio   = load_cambio()
    return df_assets, df_prov, df_rf, df_cambio


@ttl_cache(ttl=900)  # 15 min — yfinance
def _load_historical_prices(tickers_key: str, tickers: tuple):
    from core.data.market import fetch_historical_data
    return fetch_historical_data(list(tickers))


@ttl_cache(ttl=600)
def _reconstruct_history():
    from core.engine import reconstruct_history_multicurrency
    df_assets, df_prov, df_rf, df_cambio = _load_all_data()
    if df_assets.empty:
        return None
    tickers = df_assets["ticker"].dropna().unique().tolist()
    prices_df = _load_historical_prices("|".join(sorted(tickers)), tuple(sorted(tickers)))
    result = reconstruct_history_multicurrency(
        df_assets=df_assets,
        df_proventos=df_prov,
        df_rf=df_rf,
        df_cambio=df_cambio,
        prices_df=prices_df,
    )
    return result


@ttl_cache(ttl=600)
def _calculate_twr():
    from core.performance.calculator import calculate_canonical_twr, DEFAULT_PREMISES
    history = _reconstruct_history()
    if history is None:
        return None
    nav_series  = history.get("nav_series") or history.get("nav")
    flows       = history.get("flows") or history.get("external_flows")
    proventos   = history.get("proventos_series")
    if nav_series is None:
        return None
    result = calculate_canonical_twr(
        nav_series=nav_series,
        external_flows=flows,
        income_series=proventos,
        premises=DEFAULT_PREMISES,
    )
    return result


def _df_to_records(df: pd.DataFrame) -> list[dict]:
    """Converte DataFrame para lista de dicts JSON-serializável."""
    if df is None or df.empty:
        return []
    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d")
    return df.fillna("").to_dict(orient="records")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/twr")
def get_twr(period: Optional[str] = Query("all", description="1m|3m|6m|ytd|1y|all")) -> dict:
    """
    Retorna o TWR canônico calculado para o período solicitado.
    Inclui retorno acumulado, drawdown máximo e volatilidade.
    """
    try:
        twr_result = _calculate_twr()
        if twr_result is None:
            return {"error": "Dados insuficientes para calcular TWR"}

        # CanonicalTWRResult é um dataclass — convertemos para dict
        result_dict = {}
        if hasattr(twr_result, "__dict__"):
            result_dict = {
                k: (v.strftime("%Y-%m-%d") if hasattr(v, "strftime") else
                    v.tolist() if hasattr(v, "tolist") else v)
                for k, v in twr_result.__dict__.items()
                if not isinstance(v, pd.DataFrame)
            }
            # Série diária de retornos
            daily = getattr(twr_result, "daily_returns", None)
            if isinstance(daily, pd.Series):
                result_dict["daily_returns"] = [
                    {"date": str(d.date()), "return": round(float(v), 6)}
                    for d, v in daily.items()
                ]
            elif isinstance(daily, pd.DataFrame):
                result_dict["daily_returns"] = _df_to_records(daily)
        else:
            result_dict = {"twr": twr_result}

        result_dict["period"] = period
        return result_dict

    except Exception as exc:
        logger.exception("Erro em /performance/twr")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/nav-series")
def get_nav_series() -> list[dict]:
    """
    Série histórica de NAV diário em BRL.
    Cada item: { date, nav, invested, cash }
    """
    try:
        history = _reconstruct_history()
        if history is None:
            return []

        nav_series = history.get("nav_series") or history.get("nav")
        if nav_series is None:
            return []

        if isinstance(nav_series, pd.Series):
            return [
                {"date": str(d.date()), "nav": round(float(v), 2)}
                for d, v in nav_series.items()
            ]
        elif isinstance(nav_series, pd.DataFrame):
            return _df_to_records(nav_series)
        return []

    except Exception as exc:
        logger.exception("Erro em /performance/nav-series")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/advanced")
def get_advanced() -> dict:
    """
    Análise avançada: MWR, atribuição por ativo e decomposição por moeda.
    """
    try:
        from core.performance.mwr import calculate_mwr
        from core.performance.attribution import calculate_attribution

        df_assets, df_prov, df_rf, df_cambio = _load_all_data()
        history = _reconstruct_history()

        result: dict = {}

        # MWR
        try:
            flows = history.get("flows") or history.get("external_flows") if history else None
            nav   = history.get("nav_series") or history.get("nav") if history else None
            if flows is not None and nav is not None:
                mwr = calculate_mwr(nav_series=nav, external_flows=flows)
                result["mwr"] = float(mwr) if mwr is not None else None
        except Exception as e:
            result["mwr_error"] = str(e)

        # Attribution
        try:
            attr = calculate_attribution(
                df_assets=df_assets,
                df_proventos=df_prov,
                history=history,
            )
            if isinstance(attr, pd.DataFrame):
                result["attribution"] = _df_to_records(attr)
            else:
                result["attribution"] = attr
        except Exception as e:
            result["attribution_error"] = str(e)

        return result

    except Exception as exc:
        logger.exception("Erro em /performance/advanced")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/history")
def get_patrimony_history() -> list[dict]:
    """
    Histórico patrimonial da aba lb_historic (6_Historico_Patrimonial).
    Cada item: { data, patrimonio, ... }
    """
    try:
        from core.data.provider import DataProvider
        df = DataProvider.get_history_lb()
        return _df_to_records(df)
    except Exception as exc:
        logger.exception("Erro em /performance/history")
        raise HTTPException(status_code=500, detail=str(exc))
