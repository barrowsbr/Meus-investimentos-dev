from typing import Optional
from pydantic import BaseModel


class Quote(BaseModel):
    price: float
    change: float
    change_percent: float
    currency: str
    name: str


class FxRates(BaseModel):
    USDBRL: float = 5.7
    EURBRL: float = 6.4
    GBPBRL: float = 7.6
    CADBRL: float = 4.1


class Position(BaseModel):
    ticker: str
    setor: str
    quantidade: float
    moeda: str
    corretora: str
    custo_medio: float
    custo_total: float
    lucro_realizado: float
    lucro_realizado_brl: float = 0.0
    preco_atual: Optional[float]
    quote_currency: Optional[str]
    valor_atual: Optional[float]
    valor_atual_brl: float
    custo_total_brl: float
    lucro_brl: Optional[float]
    lucro_pct: Optional[float]
    ganho_ativo_brl: Optional[float]
    ganho_cambio_brl: Optional[float]
    day_change: Optional[float]
    day_change_pct: Optional[float]
    day_change_brl: Optional[float]
    fator_brl: float
    fator_custo: float


class PortfolioSnapshot(BaseModel):
    positions: list[Position]
    rv_patrimonio_brl: float
    rf_patrimonio_brl: float
    total_patrimonio_brl: float
    total_proventos_brl: float
    proventos_mensais: dict[str, float]
    proventos_por_ticker: dict[str, float] = {}
    lucro_brl: float
    lucro_pct: float
    ganho_ativo_total_brl: float
    ganho_cambio_total_brl: float
    usdbrl: float
    eurbrl: float
    cadbrl: float
    exposicao_cambial: dict[str, float]
    setor_alocacao: dict[str, float]


class CambioOp(BaseModel):
    data: str
    moeda_origem: str
    moeda_destino: str
    valor_origem: float
    valor_destino: float
    taxa: float
    corretora: str


class CambioMetrics(BaseModel):
    pm_dolar: float
    pm_euro: float
    pm_cad: float
    pm_gbp: float
    total_enviado_brl: float
    total_recebido_usd: float
    total_recebido_eur: float
    ganho_cambial_usd_brl: float
    operacoes: int
    historico: list[CambioOp]


class PtaxRates(BaseModel):
    USDBRL: float
    EURBRL: float
    data: str


class LbHistoricoEntry(BaseModel):
    data: str
    patrimonio: float
    rv: float
    rf: float


class PortfolioResponse(BaseModel):
    positions: list[Position]
    rv_patrimonio_brl: float
    rf_patrimonio_brl: float
    total_patrimonio_brl: float
    total_proventos_brl: float
    proventos_mensais: dict[str, float]
    proventos_por_ticker: dict[str, float] = {}
    lucro_brl: float
    lucro_pct: float
    ganho_ativo_total_brl: float
    ganho_cambio_total_brl: float
    usdbrl: float
    eurbrl: float
    cadbrl: float
    exposicao_cambial: dict[str, float]
    setor_alocacao: dict[str, float]
    fx: FxRates
    fx_source: str
    fx_custo: FxRates
    cambio: CambioMetrics
    ptax: Optional[PtaxRates]
    lb_historic: list[LbHistoricoEntry]
    timestamp: str
    quotes_found: int
    quotes_total: int
    quotes_errors: list[str]
    ticker_map: dict[str, str]


class ChatMessage(BaseModel):
    role: str
    parts: list[dict]


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
