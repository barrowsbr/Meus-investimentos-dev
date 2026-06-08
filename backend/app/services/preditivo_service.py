"""Predictive models — applied econometrics on portfolio returns."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def _to_float(val: Any) -> float | None:
    if val is None or val == "":
        return None
    try:
        f = float(val)
        return f if np.isfinite(f) and f > 0 else None
    except (ValueError, TypeError):
        return None


def _build_price_df(rows: list[dict], tickers: list[str] | None = None) -> pd.DataFrame:
    """Build a price DataFrame from db_cotacoes rows.

    Returns DataFrame indexed by date, columns = tickers (uppercase), values = prices.
    Keeps NaN for missing data — does NOT dropna across rows.
    """
    if not rows:
        return pd.DataFrame()

    headers = list(rows[0].keys())
    date_col = headers[0]

    # Exclude known non-asset columns (FX, indices)
    skip = {"brl=x", "usd=x", "eur=x", "^bvsp", "^gspc", "^ixic", "^dji"}
    if tickers is not None:
        ticker_set = {t.upper() for t in tickers}
        ticker_cols = [h for h in headers[1:] if h.upper() in ticker_set]
    else:
        ticker_cols = [h for h in headers[1:] if h.lower() not in skip]

    if not ticker_cols:
        return pd.DataFrame()

    records = []
    for row in rows:
        date = row.get(date_col)
        if not date:
            continue
        record: dict[str, Any] = {"date": str(date)[:10]}
        for col in ticker_cols:
            f = _to_float(row.get(col))
            if f is not None:
                record[col.upper()] = f
        records.append(record)

    if not records:
        return pd.DataFrame()

    df = pd.DataFrame(records).set_index("date").sort_index()
    return df


def _build_returns_df(rows: list[dict], tickers: list[str] | None = None) -> pd.DataFrame:
    """Build a log-returns DataFrame. NaN-tolerant — keeps rows with partial data."""
    df = _build_price_df(rows, tickers)
    if df.empty or len(df) < 2:
        return pd.DataFrame()

    # Drop columns with too little data (< 20 observations)
    min_obs = min(20, len(df) // 2)
    good_cols = [c for c in df.columns if df[c].count() >= min_obs]
    if not good_cols:
        return pd.DataFrame()
    df = df[good_cols]

    returns = np.log(df / df.shift(1))
    # Drop the first row (NaN from shift) and rows where ALL are NaN
    returns = returns.iloc[1:].dropna(how="all")
    return returns


def _portfolio_returns(rows: list[dict], tickers: list[str] | None = None) -> pd.Series:
    """Equal-weighted portfolio log-returns. Handles NaN per-column via skipna."""
    df = _build_returns_df(rows, tickers)
    if df.empty:
        return pd.Series(dtype=float)
    # mean with skipna=True handles sparse data gracefully
    series = df.mean(axis=1)
    return series.dropna()


# ── Monte Carlo ──────────────────────────────────────────────────────────────

def monte_carlo(
    rows: list[dict],
    tickers: list[str] | None = None,
    n_simulations: int = 1000,
    horizon: int = 252,
    initial_value: float = 100.0,
) -> dict:
    """GBM Monte Carlo simulation."""
    returns = _portfolio_returns(rows, tickers)
    if len(returns) < 20:
        return {"error": "Dados insuficientes (mínimo 20 observações)"}

    mu = float(returns.mean())
    sigma = float(returns.std())
    dt = 1.0

    paths = np.zeros((n_simulations, horizon + 1))
    paths[:, 0] = initial_value

    rng = np.random.default_rng(42)
    for t in range(1, horizon + 1):
        z = rng.standard_normal(n_simulations)
        paths[:, t] = paths[:, t - 1] * np.exp((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z)

    p5 = np.percentile(paths, 5, axis=0).tolist()
    p25 = np.percentile(paths, 25, axis=0).tolist()
    p50 = np.percentile(paths, 50, axis=0).tolist()
    p75 = np.percentile(paths, 75, axis=0).tolist()
    p95 = np.percentile(paths, 95, axis=0).tolist()

    sample_paths = paths[rng.choice(n_simulations, size=min(30, n_simulations), replace=False)].tolist()

    terminal = paths[:, -1]
    prob_loss = float(np.mean(terminal < initial_value))
    median_terminal = float(p50[-1])
    gain_pct = (median_terminal / initial_value - 1) * 100
    mu_annual = mu * 252
    sigma_annual = sigma * np.sqrt(252)

    direction = "alta" if gain_pct > 1 else ("queda" if gain_pct < -1 else "estabilidade")
    interpretation = (
        f"A simulação de Monte Carlo gerou {n_simulations:,} caminhos estocásticos em um horizonte de {horizon} dias úteis. "
        f"O valor mediano projetado é {median_terminal:.2f} ({"+" if gain_pct >= 0 else ""}{gain_pct:.1f}% sobre o valor inicial de {initial_value:.2f}), "
        f"indicando tendência de {direction}. "
        f"O intervalo P5–P95 vai de {p5[-1]:.2f} a {p95[-1]:.2f}, refletindo a dispersão dos cenários. "
        f"A probabilidade de perda (valor terminal abaixo do inicial) é de {prob_loss*100:.1f}%. "
        f"O drift anualizado (μ) é {mu_annual*100:.1f}% e a volatilidade anualizada (σ) é {sigma_annual*100:.1f}%. "
        f"{"A alta volatilidade indica incerteza significativa nas projeções." if sigma_annual > 0.30 else "A volatilidade moderada sugere razoável previsibilidade."}"
    )

    return {
        "percentiles": {"p5": p5, "p25": p25, "p50": p50, "p75": p75, "p95": p95},
        "sample_paths": sample_paths,
        "params": {"mu_daily": mu, "sigma_daily": sigma, "mu_annual": mu_annual, "sigma_annual": sigma_annual},
        "horizon": horizon,
        "n_simulations": n_simulations,
        "observations_used": len(returns),
        "interpretation": interpretation,
    }


# ── ARIMA ────────────────────────────────────────────────────────────────────

def arima_forecast(
    rows: list[dict],
    tickers: list[str] | None = None,
    horizon: int = 60,
) -> dict:
    """ARIMA forecast with confidence intervals (fan chart)."""
    try:
        from statsmodels.tsa.arima.model import ARIMA
        from statsmodels.tsa.stattools import adfuller
    except ImportError:
        return {"error": "statsmodels não instalado"}

    returns = _portfolio_returns(rows, tickers)
    if len(returns) < 50:
        return {"error": f"Dados insuficientes ({len(returns)} obs, mínimo 50)"}

    cum = returns.cumsum()
    prices = np.exp(cum) * 100
    # Use plain numpy array (no date index) to avoid statsmodels date parsing
    series = np.asarray(prices, dtype=float)

    try:
        adf_stat, adf_pvalue, *_ = adfuller(series, maxlag=min(20, len(series) // 3))
    except Exception:
        adf_pvalue = 0.5

    d = 0 if adf_pvalue < 0.05 else 1

    best_aic = np.inf
    best_order = (1, d, 0)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for p in range(0, 4):
            for q in range(0, 4):
                if p == 0 and q == 0:
                    continue
                try:
                    model = ARIMA(series, order=(p, d, q))
                    fit = model.fit()
                    if fit.aic < best_aic:
                        best_aic = float(fit.aic)
                        best_order = (p, d, q)
                except Exception:
                    continue

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = ARIMA(series, order=best_order)
            fit = model.fit()
            forecast_result = fit.get_forecast(steps=horizon)
            mean_forecast = np.asarray(forecast_result.predicted_mean).tolist()
            ci_80 = np.asarray(forecast_result.conf_int(alpha=0.20))
            ci_95 = np.asarray(forecast_result.conf_int(alpha=0.05))
    except Exception as e:
        return {"error": f"ARIMA fit falhou: {e}"}

    historical = series[-min(120, len(series)):].tolist()

    last_hist = float(series[-1])
    last_forecast = float(mean_forecast[-1])
    fc_change_pct = (last_forecast / last_hist - 1) * 100
    ci_width = float(ci_95[:, 1][-1] - ci_95[:, 0][-1])
    ci_width_pct = ci_width / last_hist * 100

    direction = "alta" if fc_change_pct > 1 else ("queda" if fc_change_pct < -1 else "estabilidade")
    stationarity_msg = (
        f"O teste ADF indica que a série é estacionária (p={adf_pvalue:.4f}), dispensando diferenciação."
        if adf_pvalue < 0.05 else
        f"O teste ADF (p={adf_pvalue:.4f}) indica não-estacionariedade — aplicada diferenciação (d={d})."
    )
    interpretation = (
        f"O modelo ARIMA{list(best_order)} foi selecionado via minimização do AIC ({best_aic:.1f}). "
        f"{stationarity_msg} "
        f"A previsão para {horizon} dias aponta {direction}, com valor projetado de {last_forecast:.2f} "
        f"({"+" if fc_change_pct >= 0 else ""}{fc_change_pct:.1f}% em relação ao último valor observado). "
        f"O intervalo de confiança de 95% ao final do horizonte tem amplitude de {ci_width:.2f} ({ci_width_pct:.1f}% do valor atual), "
        f"{"indicando alta incerteza nas projeções de longo prazo." if ci_width_pct > 30 else "sugerindo razoável precisão na previsão."}"
    )

    return {
        "historical": historical,
        "forecast": mean_forecast,
        "ci_80_lower": ci_80[:, 0].tolist(),
        "ci_80_upper": ci_80[:, 1].tolist(),
        "ci_95_lower": ci_95[:, 0].tolist(),
        "ci_95_upper": ci_95[:, 1].tolist(),
        "order": list(best_order),
        "aic": best_aic,
        "adf_pvalue": float(adf_pvalue),
        "stationary": bool(adf_pvalue < 0.05),
        "horizon": horizon,
        "observations_used": len(returns),
        "interpretation": interpretation,
    }


# ── Prophet-like (Additive Decomposition) ───────────────────────────────────

def prophet_forecast(
    rows: list[dict],
    tickers: list[str] | None = None,
    horizon: int = 60,
) -> dict:
    """Additive decomposition forecast (trend + seasonality) using statsmodels."""
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
    except ImportError:
        return {"error": "statsmodels não instalado"}

    returns = _portfolio_returns(rows, tickers)
    if len(returns) < 60:
        return {"error": "Dados insuficientes (mínimo 60 observações)"}

    prices = np.exp(returns.cumsum()) * 100
    series = np.asarray(prices, dtype=float)

    try:
        period = min(21, len(series) // 4)
        model = ExponentialSmoothing(
            series,
            trend="add",
            seasonal="add",
            seasonal_periods=period,
            initialization_method="estimated",
        )
        fit = model.fit(optimized=True)
        forecast = fit.forecast(horizon)

        residuals = fit.resid
        std_resid = float(np.std(residuals))

        steps = np.arange(1, horizon + 1)
        expanding_std = std_resid * np.sqrt(steps)

        forecast_list = forecast.tolist()
        upper_80 = (forecast + 1.28 * expanding_std).tolist()
        lower_80 = (forecast - 1.28 * expanding_std).tolist()
        upper_95 = (forecast + 1.96 * expanding_std).tolist()
        lower_95 = (forecast - 1.96 * expanding_std).tolist()

        trend = fit.trend[-min(120, len(series)):].tolist() if hasattr(fit, "trend") and fit.trend is not None else []
        seasonal = fit.season[-min(120, len(series)):].tolist() if hasattr(fit, "season") and fit.season is not None else []

        model_used = "Holt-Winters (aditivo)"
        has_seasonal = len(seasonal) > 0

    except Exception as e:
        logger.warning(f"Prophet-like model failed, falling back to linear: {e}")
        x = np.arange(len(series))
        coeffs = np.polyfit(x, series, 1)
        trend_line = np.polyval(coeffs, np.arange(len(series) + horizon))
        forecast_list = trend_line[len(series):].tolist()
        std_resid = float(np.std(series - np.polyval(coeffs, x)))
        steps = np.arange(1, horizon + 1)
        expanding_std = std_resid * np.sqrt(steps)
        upper_80 = (np.array(forecast_list) + 1.28 * expanding_std).tolist()
        lower_80 = (np.array(forecast_list) - 1.28 * expanding_std).tolist()
        upper_95 = (np.array(forecast_list) + 1.96 * expanding_std).tolist()
        lower_95 = (np.array(forecast_list) - 1.96 * expanding_std).tolist()
        trend = trend_line[:len(series)][-120:].tolist()
        seasonal = []
        model_used = "Regressão linear (fallback)"
        has_seasonal = False

    historical = series[-min(120, len(series)):].tolist()

    last_hist = float(series[-1])
    last_fc = float(forecast_list[-1])
    fc_change = (last_fc / last_hist - 1) * 100
    direction = "alta" if fc_change > 1 else ("queda" if fc_change < -1 else "lateralização")
    band_width = float(upper_95[-1]) - float(lower_95[-1])
    band_pct = band_width / last_hist * 100

    interpretation = (
        f"Modelo utilizado: {model_used}. "
        f"A decomposição separa a série em tendência{" e sazonalidade" if has_seasonal else ""}, "
        f"projetando {direction} para os próximos {horizon} dias úteis. "
        f"O valor previsto ao final é {last_fc:.2f} ({"+" if fc_change >= 0 else ""}{fc_change:.1f}%). "
        f"A banda de confiança 95% no horizonte final tem amplitude de {band_width:.2f} ({band_pct:.1f}% do valor atual). "
        f"{"O alargamento progressivo das bandas reflete a incerteza crescente em horizontes mais distantes." if band_pct > 25 else "As bandas relativamente estreitas sugerem boa aderência do modelo."}"
        f"{" Sazonalidade detectada — o modelo captura padrões cíclicos recorrentes na série." if has_seasonal else ""}"
    )

    return {
        "historical": historical,
        "forecast": forecast_list,
        "upper_80": upper_80,
        "lower_80": lower_80,
        "upper_95": upper_95,
        "lower_95": lower_95,
        "trend": trend,
        "seasonal": seasonal,
        "horizon": horizon,
        "observations_used": len(returns),
        "interpretation": interpretation,
    }


# ── GARCH(1,1) ──────────────────────────────────────────────────────────────

def garch_forecast(
    rows: list[dict],
    tickers: list[str] | None = None,
    horizon: int = 60,
) -> dict:
    """GARCH(1,1) volatility forecast."""
    try:
        from arch import arch_model
    except ImportError:
        return _garch_fallback(rows, tickers, horizon)

    returns = _portfolio_returns(rows, tickers)
    if len(returns) < 100:
        return {"error": "Dados insuficientes (mínimo 100 observações)"}

    scaled = returns * 100

    model = arch_model(scaled, vol="Garch", p=1, q=1, mean="Constant", dist="Normal")
    fit = model.fit(disp="off")

    forecasts = fit.forecast(horizon=horizon)
    variance_forecast = forecasts.variance.iloc[-1].values
    vol_forecast = np.sqrt(variance_forecast) / 100 * np.sqrt(252)

    conditional_vol = fit.conditional_volatility.values / 100 * np.sqrt(252)
    conditional_vol_daily = fit.conditional_volatility.values / 100
    historical_vol = conditional_vol[-min(252, len(conditional_vol)):].tolist()

    realized_vol = returns.rolling(21).std() * np.sqrt(252)
    realized_hist = realized_vol.dropna().values[-min(252, len(realized_vol)):].tolist()

    # VaR using GARCH conditional volatility (not unconditional std)
    current_cond_vol_daily = float(conditional_vol_daily[-1]) if len(conditional_vol_daily) > 0 else float(returns.std())
    var_95 = float(returns.mean() - 1.645 * current_cond_vol_daily) * np.sqrt(252)

    alpha_val = float(fit.params.get("alpha[1]", 0))
    beta_val = float(fit.params.get("beta[1]", 0))
    persistence = alpha_val + beta_val
    current_vol_ann = float(conditional_vol[-1]) if len(conditional_vol) > 0 else 0
    avg_vol = float(np.mean(conditional_vol[-60:])) if len(conditional_vol) >= 60 else float(np.mean(conditional_vol))
    vol_regime = "elevada" if current_vol_ann > avg_vol * 1.2 else ("baixa" if current_vol_ann < avg_vol * 0.8 else "normal")
    fc_vol_end = float(vol_forecast[-1]) if len(vol_forecast) > 0 else current_vol_ann

    interpretation = (
        f"O GARCH(1,1) modela a volatilidade condicional — isto é, como a volatilidade varia ao longo do tempo. "
        f"A volatilidade atual é {current_vol_ann*100:.1f}% a.a., em regime {vol_regime} "
        f"(média recente: {avg_vol*100:.1f}% a.a.). "
        f"A persistência (α+β={persistence:.4f}) {"é próxima de 1, indicando que choques de volatilidade demoram a dissipar" if persistence > 0.95 else "indica dissipação razoável de choques"}. "
        f"A projeção de volatilidade converge para {fc_vol_end*100:.1f}% a.a. no horizonte de {horizon} dias. "
        f"O VaR paramétrico a 95% (baseado na vol condicional atual) é {abs(var_95)*100:.2f}% a.a. — "
        f"em um dia típico, a perda máxima esperada com 95% de confiança é de {abs(current_cond_vol_daily)*1.645*100:.2f}%."
    )

    return {
        "conditional_vol": historical_vol,
        "realized_vol": realized_hist,
        "vol_forecast": vol_forecast.tolist(),
        "params": {
            "omega": float(fit.params.get("omega", 0)),
            "alpha": alpha_val,
            "beta": beta_val,
            "persistence": persistence,
        },
        "var_95_annual": float(var_95),
        "current_vol_annual": current_vol_ann,
        "horizon": horizon,
        "observations_used": len(returns),
        "interpretation": interpretation,
    }


def _garch_fallback(
    rows: list[dict],
    tickers: list[str] | None = None,
    horizon: int = 60,
) -> dict:
    """Simple EWMA volatility when arch package is unavailable."""
    returns = _portfolio_returns(rows, tickers)
    if len(returns) < 100:
        return {"error": "Dados insuficientes (mínimo 100 observações)"}

    lam = 0.94
    var_t = float(returns.var())
    ewma_var = []
    for r in returns.values:
        var_t = lam * var_t + (1 - lam) * r**2
        ewma_var.append(var_t)

    conditional_vol = (np.sqrt(np.array(ewma_var)) * np.sqrt(252)).tolist()
    historical_vol = conditional_vol[-min(252, len(conditional_vol)):]

    last_var = ewma_var[-1]
    long_run_var = float(returns.var())
    vol_forecast = []
    for h in range(horizon):
        fwd_var = long_run_var + (lam ** (h + 1)) * (last_var - long_run_var)
        vol_forecast.append(float(np.sqrt(fwd_var) * np.sqrt(252)))

    realized_vol = returns.rolling(21).std() * np.sqrt(252)
    realized_hist = realized_vol.dropna().values[-min(252, len(realized_vol)):].tolist()

    # VaR using current EWMA conditional vol (not unconditional std)
    current_cond_vol_daily = float(np.sqrt(last_var))
    var_95 = float(returns.mean() - 1.645 * current_cond_vol_daily) * np.sqrt(252)

    alpha_est = 1 - lam
    beta_est = lam
    current_vol_ann = float(historical_vol[-1]) if historical_vol else 0
    avg_vol = float(np.mean(historical_vol[-60:])) if len(historical_vol) >= 60 else float(np.mean(historical_vol)) if historical_vol else 0
    vol_regime = "elevada" if current_vol_ann > avg_vol * 1.2 else ("baixa" if current_vol_ann < avg_vol * 0.8 else "normal")
    fc_vol_end = vol_forecast[-1] if vol_forecast else current_vol_ann

    interpretation = (
        f"Modelo EWMA (λ=0.94, método RiskMetrics) utilizado como fallback. "
        f"A volatilidade atual é {current_vol_ann*100:.1f}% a.a., regime {vol_regime}. "
        f"A projeção converge para {fc_vol_end*100:.1f}% a.a. em {horizon} dias. "
        f"VaR 95% condicional: {abs(var_95)*100:.2f}% a.a. "
        f"Perda máxima diária (95%): {abs(current_cond_vol_daily)*1.645*100:.2f}%."
    )

    return {
        "conditional_vol": historical_vol,
        "realized_vol": realized_hist,
        "vol_forecast": vol_forecast,
        "params": {
            "omega": float(returns.var() * (1 - lam)),
            "alpha": alpha_est,
            "beta": beta_est,
            "persistence": lam,
        },
        "var_95_annual": float(var_95),
        "current_vol_annual": current_vol_ann,
        "horizon": horizon,
        "observations_used": len(returns),
        "method": "EWMA (arch indisponível)",
        "interpretation": interpretation,
    }


# ── VAR (Vector Autoregressive) ──────────────────────────────────────────────

def var_forecast(
    rows: list[dict],
    tickers: list[str] | None = None,
    horizon: int = 30,
    max_vars: int = 4,
) -> dict:
    """VAR model for multivariate forecasting with impulse response."""
    try:
        from statsmodels.tsa.api import VAR as VARModel
    except ImportError:
        return {"error": "statsmodels não instalado"}

    df = _build_returns_df(rows, tickers)
    if df.empty or len(df) < 60:
        return {"error": "Dados insuficientes (mínimo 60 observações)"}

    if df.shape[1] > max_vars:
        vol = df.std().sort_values(ascending=False)
        selected = vol.index[:max_vars].tolist()
        df = df[selected]
    elif df.shape[1] < 2:
        return {"error": "VAR requer pelo menos 2 variáveis"}

    df = df.dropna()
    if len(df) < 60:
        return {"error": "Dados insuficientes após limpeza"}

    # Reset index to avoid date parsing issues in statsmodels
    df = df.reset_index(drop=True)
    model = VARModel(df)

    try:
        lag_order = model.select_order(maxlags=min(10, len(df) // 5))
        optimal_lag = lag_order.aic
        if optimal_lag == 0:
            optimal_lag = 1
    except Exception:
        optimal_lag = 2

    fit = model.fit(optimal_lag)

    forecast = fit.forecast(df.values[-optimal_lag:], steps=horizon)
    forecast_df = pd.DataFrame(forecast, columns=df.columns)

    try:
        irf = fit.irf(periods=20)
        irf_data = {}
        for i, col_from in enumerate(df.columns):
            irf_data[col_from] = {}
            for j, col_to in enumerate(df.columns):
                irf_data[col_from][col_to] = irf.irfs[:, j, i].tolist()
    except Exception:
        irf_data = {}

    try:
        fevd = fit.fevd(periods=10)
        fevd_data = {}
        for i, col in enumerate(df.columns):
            fevd_data[col] = fevd.decomp[:, i, :].tolist()
    except Exception:
        fevd_data = {}

    vars_list = df.columns.tolist()
    fc_summary_parts = []
    for col in vars_list:
        fc_vals = forecast_df[col].values
        hist_mean = float(df[col].mean())
        fc_mean = float(fc_vals.mean())
        direction = "positivos" if fc_mean > hist_mean * 0.1 else ("negativos" if fc_mean < hist_mean * -0.1 else "próximos de zero")
        fc_summary_parts.append(f"{col} ({direction})")

    irf_insight = ""
    if irf_data and len(vars_list) >= 2:
        shock_var = vars_list[0]
        resp_var = vars_list[1]
        if shock_var in irf_data and resp_var in irf_data[shock_var]:
            peak = max(irf_data[shock_var][resp_var], key=abs)
            irf_insight = (
                f" Um choque em {shock_var} tem impacto {"positivo" if peak > 0 else "negativo"} "
                f"de até {abs(peak)*10000:.1f} bps sobre {resp_var}."
            )

    interpretation = (
        f"O modelo VAR({optimal_lag}) captura interdependências entre {len(vars_list)} ativos: {', '.join(vars_list)}. "
        f"O número de lags ({optimal_lag}) foi selecionado via AIC — indica quantos dias passados são relevantes para prever o próximo. "
        f"Retornos previstos para {horizon} dias: {'; '.join(fc_summary_parts)}."
        f"{irf_insight}"
        f" A análise de impulso-resposta mostra como um choque unitário em um ativo se propaga pelos demais ao longo de 20 períodos."
    )

    return {
        "variables": vars_list,
        "forecast": {col: forecast_df[col].tolist() for col in df.columns},
        "historical": {col: df[col].values[-60:].tolist() for col in df.columns},
        "irf": irf_data,
        "fevd": fevd_data,
        "lag_order": optimal_lag,
        "horizon": horizon,
        "observations_used": len(df),
        "interpretation": interpretation,
    }
