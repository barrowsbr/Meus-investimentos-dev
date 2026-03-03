"""
Script de teste Alpha Vantage API
Execute: python testar_alpha_vantage.py
"""
import requests
import json
import time

API_KEY = "X2Y0YYAZUEKMS1FF"
BASE = "https://www.alphavantage.co/query"

VERDE = "\033[92m"
VERMELHO = "\033[91m"
AMARELO = "\033[93m"
RESET = "\033[0m"
AZUL = "\033[94m"

def ok(msg): print(f"  {VERDE}✓{RESET} {msg}")
def erro(msg): print(f"  {VERMELHO}✗{RESET} {msg}")
def aviso(msg): print(f"  {AMARELO}!{RESET} {msg}")
def titulo(msg): print(f"\n{AZUL}{'='*50}\n  {msg}\n{'='*50}{RESET}")

def chamar(params: dict, descricao: str) -> dict | None:
    """Faz chamada à API e retorna o JSON ou None em caso de erro."""
    params["apikey"] = API_KEY
    try:
        r = requests.get(BASE, params=params, timeout=10)
        data = r.json()

        # Detectar mensagens de erro da API
        if "Note" in data:
            aviso(f"Rate limit atingido: {data['Note'][:80]}...")
            return None
        if "Information" in data:
            aviso(f"Info API: {data['Information'][:80]}...")
            return None
        if "Error Message" in data:
            erro(f"{descricao}: {data['Error Message']}")
            return None

        ok(f"{descricao} — {len(str(data))} bytes recebidos")
        return data

    except Exception as e:
        erro(f"{descricao}: {e}")
        return None

def teste_1_cotacao_acao():
    titulo("1. COTAÇÃO EM TEMPO REAL — Ações US")
    tickers = ["AAPL", "MSFT", "NVDA"]
    for ticker in tickers:
        data = chamar({"function": "GLOBAL_QUOTE", "symbol": ticker}, f"Quote {ticker}")
        if data and "Global Quote" in data:
            q = data["Global Quote"]
            preco = q.get("05. price", "N/A")
            variacao = q.get("10. change percent", "N/A")
            print(f"     {ticker}: ${preco}  ({variacao})")
        time.sleep(12)  # 5 req/min no free tier

def teste_2_historico():
    titulo("2. HISTÓRICO DIÁRIO — AAPL (últimos 5 dias)")
    data = chamar(
        {"function": "TIME_SERIES_DAILY", "symbol": "AAPL", "outputsize": "compact"},
        "TIME_SERIES_DAILY AAPL"
    )
    if data and "Time Series (Daily)" in data:
        ts = data["Time Series (Daily)"]
        dias = sorted(ts.keys(), reverse=True)[:5]
        for dia in dias:
            fechamento = ts[dia]["4. close"]
            print(f"     {dia}: ${fechamento}")
    time.sleep(12)

def teste_3_forex():
    titulo("3. CÂMBIO — Pares relevantes para o projeto")
    pares = [
        ("USD", "BRL", "Dólar → Real"),
        ("EUR", "BRL", "Euro → Real"),
        ("EUR", "USD", "Euro → Dólar"),
    ]
    for from_cur, to_cur, desc in pares:
        data = chamar(
            {"function": "CURRENCY_EXCHANGE_RATE", "from_currency": from_cur, "to_currency": to_cur},
            f"FX {desc}"
        )
        if data and "Realtime Currency Exchange Rate" in data:
            rate = data["Realtime Currency Exchange Rate"].get("5. Exchange Rate", "N/A")
            print(f"     {from_cur}/{to_cur}: {rate}")
        time.sleep(12)

def teste_4_fundamentals():
    titulo("4. FUNDAMENTALS — Dados de empresa")
    data = chamar({"function": "OVERVIEW", "symbol": "AAPL"}, "OVERVIEW AAPL")
    if data:
        campos = {
            "MarketCapitalization": "Market Cap",
            "PERatio": "P/E",
            "DividendYield": "Div Yield",
            "EPS": "EPS",
            "52WeekHigh": "Máx 52s",
            "52WeekLow": "Mín 52s",
            "AnalystTargetPrice": "Alvo analistas",
        }
        for campo, label in campos.items():
            val = data.get(campo, "N/A")
            print(f"     {label}: {val}")
    time.sleep(12)

def teste_5_indicadores_economicos():
    titulo("5. INDICADORES ECONÔMICOS US")
    indicadores = [
        ("REAL_GDP", "PIB Real US (anual)"),
        ("INFLATION", "Inflação US (CPI)"),
        ("FEDERAL_FUNDS_RATE", "Fed Funds Rate"),
        ("UNEMPLOYMENT", "Desemprego US"),
    ]
    for func, desc in indicadores:
        data = chamar({"function": func, "interval": "annual"}, desc)
        if data and "data" in data:
            ultimos = data["data"][:3]
            vals = [f"{d['date'][:4]}: {d['value']}" for d in ultimos]
            print(f"     {' | '.join(vals)}")
        time.sleep(12)

def teste_6_b3():
    titulo("6. AÇÕES BRASILEIRAS (B3) — Sufixo .SAO")
    tickers_b3 = ["PETR4.SAO", "VALE3.SAO", "ITUB4.SAO"]
    for ticker in tickers_b3:
        data = chamar({"function": "GLOBAL_QUOTE", "symbol": ticker}, f"B3 {ticker}")
        if data and "Global Quote" in data:
            q = data["Global Quote"]
            preco = q.get("05. price", "N/A")
            print(f"     {ticker}: R${preco}")
        time.sleep(12)

def teste_7_limite():
    titulo("7. DIAGNÓSTICO DO PLANO — Verificar limite da chave")
    print("  Fazendo 2 chamadas rápidas para detectar rate limit...")
    resultados = []
    for _ in range(2):
        data = chamar({"function": "GLOBAL_QUOTE", "symbol": "SPY"}, "SPY quote")
        resultados.append(data is not None)
        time.sleep(2)

    sucessos = sum(resultados)
    if sucessos == 2:
        ok("Chave ativa, pelo menos 2 req/min funcionando")
        print(f"\n  {AMARELO}Limites do plano FREE:{RESET}")
        print("  • 25 requisições por dia")
        print("  • 5 requisições por minuto")
        print("  • Dados com 15-20min de delay")
        print(f"\n  {AZUL}Para uso em produção, considere plano Premium ($50/mês){RESET}")
    else:
        aviso("Possível limite atingido ou chave inválida")

def main():
    print(f"\n{AZUL}Alpha Vantage API Tester — Chave: {API_KEY[:8]}...{RESET}")
    print("Nota: O free tier permite 5 req/min. Pausas automáticas entre testes.\n")

    # Rodar todos os testes em sequência
    # ATENÇÃO: cada grupo de testes consome requests do limite diário (25/dia)
    teste_1_cotacao_acao()       # 3 requests
    teste_2_historico()          # 1 request
    teste_3_forex()              # 3 requests
    teste_4_fundamentals()       # 1 request
    # Os abaixo consomem mais 8 requests (total ~16)
    # Comente se quiser economizar o limite diário:
    teste_5_indicadores_economicos()  # 4 requests
    teste_6_b3()                      # 3 requests
    teste_7_limite()                  # 2 requests

    print(f"\n{VERDE}Testes concluídos!{RESET}")
    print("\nResumo do que Alpha Vantage oferece vs yfinance:")
    print("  ✓ Cotações real-time (delay 15min no free, real-time no premium)")
    print("  ✓ Câmbio BRL=X, EURUSD=X etc.")
    print("  ✓ Histórico ajustado por dividendos/splits")
    print("  ✓ Fundamentos (P/E, Market Cap, EPS)")
    print("  ✓ Indicadores macroeconômicos US (GDP, CPI, Fed Rate)")
    print("  ✓ Ações B3 via sufixo .SAO")
    print("  ✗ Sem dados de FIIs brasileiros")
    print("  ✗ Limite de 25 req/dia no free — insuficiente para prod")

if __name__ == "__main__":
    main()
