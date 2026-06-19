#!/usr/bin/env python3
"""
Gera o PDF de documentação da página Radar (Scanner de Bolsas).
"""

from fpdf import FPDF

def sanitize(text):
    return (text
        .replace("—", "-")   # em dash
        .replace("–", "-")   # en dash
        .replace("‘", "'")   # left single quote
        .replace("’", "'")   # right single quote
        .replace("“", '"')   # left double quote
        .replace("”", '"')   # right double quote
        .replace("•", "-")   # bullet
        .replace("…", "...")  # ellipsis
        .replace("·", ".")   # middle dot
    )

class RadarDoc(FPDF):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.add_font("DejaVu", "", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", uni=True)
        self.add_font("DejaVu", "B", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", uni=True)
        self.add_font("DejaVuMono", "", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", uni=True)
        self.add_font("DejaVuMono", "B", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", uni=True)

    def header(self):
        self.set_font("DejaVu", "B", 9)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, "Meus Investimentos — Documentação da Página Radar", align="R")
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(140, 140, 140)
        self.cell(0, 10, f"Página {self.page_no()}/{{nb}}", align="C")

    def titulo(self, text, level=1):
        sizes = {1: 22, 2: 16, 3: 13}
        self.set_font("DejaVu", "B", sizes.get(level, 13))
        self.set_text_color(30, 30, 30)
        self.ln(4 if level > 1 else 6)
        self.multi_cell(0, 8, text)
        if level == 1:
            self.set_draw_color(59, 130, 246)
            self.set_line_width(0.8)
            self.line(self.l_margin, self.get_y() + 1, self.l_margin + 60, self.get_y() + 1)
            self.ln(5)
        elif level == 2:
            self.set_draw_color(180, 180, 180)
            self.set_line_width(0.3)
            self.line(self.l_margin, self.get_y() + 1, self.l_margin + 170, self.get_y() + 1)
            self.ln(3)
        else:
            self.ln(2)

    def corpo(self, text):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(50, 50, 50)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def bullet(self, text, indent=10):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(50, 50, 50)
        x0 = self.l_margin + indent
        self.set_x(x0)
        w_avail = self.w - self.r_margin - x0 - 5
        self.cell(5, 5.5, chr(8226), new_x="END")
        self.multi_cell(w_avail, 5.5, text)
        self.set_x(self.l_margin)

    def code_block(self, text):
        self.set_font("DejaVuMono", "", 9)
        self.set_fill_color(240, 240, 245)
        self.set_text_color(40, 40, 40)
        lines = text.split("\n")
        for line in lines:
            self.cell(0, 5, "  " + line, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def info_box(self, label, value):
        self.set_font("DejaVu", "B", 10)
        self.set_text_color(59, 130, 246)
        self.cell(35, 6, label + ":", new_x="END")
        self.set_font("DejaVu", "", 10)
        self.set_text_color(50, 50, 50)
        w = self.w - self.r_margin - self.get_x()
        self.multi_cell(w, 6, value)
        self.set_x(self.l_margin)

    def table_row(self, cols, widths, bold=False, header=False):
        style = "B" if bold or header else ""
        self.set_font("DejaVu", style, 9)
        if header:
            self.set_fill_color(59, 130, 246)
            self.set_text_color(255, 255, 255)
        else:
            self.set_fill_color(248, 248, 252)
            self.set_text_color(50, 50, 50)
        h = 7
        for i, col in enumerate(cols):
            w = widths[i]
            self.cell(w, h, str(col)[:int(w/1.8)], border=1, fill=header, align="L" if i == 0 else "L")
        self.ln(h)

    def check_page_break(self, h=30):
        if self.get_y() + h > self.h - 20:
            self.add_page()


def main():
    pdf = RadarDoc(orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # ═══════════════════════════════════════════════════════════════════════
    # CAPA
    # ═══════════════════════════════════════════════════════════════════════
    pdf.ln(30)
    pdf.set_font("DejaVu", "B", 32)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 15, "Radar / Scanner", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 14)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 10, "Documentação Técnica Completa", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.set_draw_color(59, 130, 246)
    pdf.set_line_width(1)
    pdf.line(60, pdf.get_y(), 150, pdf.get_y())
    pdf.ln(15)
    pdf.set_font("DejaVu", "", 11)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 7, "Meus Investimentos — Dashboard de Investimentos Pessoal", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, "Página: /bolsas (app/bolsas/page.tsx)", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, "~2.800 linhas de código | 10+ APIs integradas", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    pdf.cell(0, 7, "Versão: Junho 2026", align="C", new_x="LMARGIN", new_y="NEXT")

    # ═══════════════════════════════════════════════════════════════════════
    # ÍNDICE
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("Índice", 1)
    toc = [
        "1. Visão Geral",
        "2. Arquitetura e Stack Técnico",
        "3. Aba Bolsas — Mapa-Múndi Interativo (Choropleth)",
        "4. Aba Bolsas — Termômetro de Índice (IndexThermometer)",
        "5. Aba Bolsas — Gráfico de Velas (CandlestickChart)",
        "6. Aba Bolsas — Treemap de Setores (SectorTreemap)",
        "7. Aba Bolsas — Top Constituintes (TopConstituents)",
        "8. Aba Bolsas — Indicadores Econômicos do País",
        "9. Aba Bolsas — Performance por Região",
        "10. Aba Bolsas — Tabela de Índices",
        "11. Aba Moedas — Visão Geral",
        "12. Aba Moedas — Termômetro do Dólar (DXY)",
        "13. Aba Moedas — Mapa de Cotações",
        "14. Aba Moedas — Tabela e Rankings",
        "15. Aba Inteligência — Notícias e Preditivos",
        "16. APIs Backend — Endpoints e Fontes de Dados",
        "17. Bibliotecas Compartilhadas",
        "18. Cobertura Geográfica",
    ]
    for item in toc:
        pdf.set_font("DejaVu", "", 11)
        pdf.set_text_color(50, 50, 50)
        pdf.cell(0, 7, item, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    # ═══════════════════════════════════════════════════════════════════════
    # 1. VISÃO GERAL
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("1. Visão Geral", 1)
    pdf.corpo(
        "A página Radar (rota /bolsas) é o scanner global de mercados do dashboard Meus Investimentos. "
        "Ela consolida em tempo real dados de mais de 100 índices de bolsas em 6 continentes, "
        "50+ moedas, indicadores econômicos de 60+ países, e feeds de notícias e mercados preditivos. "
        "Tudo em uma interface interativa com mapa-múndi, gráficos de velas, treemaps setoriais e tabelas ordenáveis."
    )
    pdf.corpo(
        "A página é dividida em 3 abas principais:"
    )
    pdf.bullet("Bolsas — Índices globais, mapa choropleth, gráficos candlestick, setores, constituintes")
    pdf.bullet("Moedas — Cotações de câmbio, DXY, mapa de moedas, rankings regionais")
    pdf.bullet("Inteligência — Notícias financeiras, Reddit, mercados preditivos (Polymarket, Kalshi, Metaculus)")
    pdf.ln(3)
    pdf.corpo(
        "O componente principal é BolsasPage (~2.803 linhas), um componente React client-side "
        "que orquestra todas as chamadas de API e renderiza os sub-componentes conforme a aba selecionada. "
        "O estado é gerenciado localmente com useState/useMemo do React."
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 2. ARQUITETURA
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("2. Arquitetura e Stack Técnico", 1)

    pdf.titulo("Frontend", 2)
    pdf.bullet("Framework: Next.js 14 (App Router, componente 'use client')")
    pdf.bullet("Mapas: react-simple-maps (ComposableMap, Geographies, Marker, ZoomableGroup)")
    pdf.bullet("Gráficos de Velas: lightweight-charts (TradingView) via createChart()")
    pdf.bullet("Gráficos de Área: Recharts (AreaChart, ResponsiveContainer, Tooltip)")
    pdf.bullet("Ícones: lucide-react (~25 ícones importados)")
    pdf.bullet("Estilo: Tailwind CSS 3 (tema dark, glassmorphism com rgba)")
    pdf.bullet("Tipografia: GeistMono (monospace para dados numéricos)")
    pdf.bullet("Mapa geográfico: TopoJSON do world-atlas@2 (countries-110m)")
    pdf.ln(3)

    pdf.titulo("Backend (API Routes)", 2)
    pdf.corpo(
        "Todas as rotas são Next.js API Routes (App Router) com dynamic = 'force-dynamic'. "
        "Os dados são buscados em tempo real de fontes externas e servidos com cache headers."
    )
    pdf.bullet("GET /api/bolsas — Cotações de 100+ índices globais via Yahoo Finance")
    pdf.bullet("GET /api/bolsas/history — Histórico de preços + períodos (1S/1M/3M/6M/1A/YTD)")
    pdf.bullet("GET /api/bolsas/ohlc — Dados OHLC (velas) para qualquer ticker")
    pdf.bullet("GET /api/bolsas/sectors — Composição setorial por região/índice")
    pdf.bullet("GET /api/bolsas/constituents — Top 20 ações de cada índice")
    pdf.bullet("GET /api/bolsas/profile — Perfil do índice (IA via Google Generative AI)")
    pdf.bullet("GET /api/bolsas/country — Indicadores econômicos (World Bank API)")
    pdf.bullet("GET /api/bolsas/yields — Curva de juros US Treasury, DXY, Ouro")
    pdf.bullet("GET /api/bolsas/crypto — Top 12 criptomoedas (CoinGecko)")
    pdf.bullet("GET /api/moedas — 50+ moedas, DXY sintético, veredito de força do dólar")
    pdf.ln(3)

    pdf.titulo("Fontes de Dados Externas", 2)
    w = [55, 115]
    pdf.table_row(["Fonte", "Uso"], w, header=True)
    pdf.table_row(["Yahoo Finance", "Cotações, histórico, OHLC de índices e moedas"], w)
    pdf.table_row(["World Bank API", "PIB, inflação, desemprego, dívida/PIB de 60+ países"], w)
    pdf.table_row(["Google Generative AI", "Perfis descritivos de índices (Gemini)"], w)
    pdf.table_row(["CoinGecko API", "Top 12 criptomoedas por market cap"], w)
    pdf.table_row(["open.er-api.com", "Taxas de câmbio para conversão vs BRL"], w)
    pdf.table_row(["world-atlas@2 (CDN)", "TopoJSON para mapa-múndi (110m resolução)"], w)
    pdf.table_row(["Polymarket", "Mercados preditivos (via lib/polymarket)"], w)
    pdf.table_row(["Kalshi", "Mercados preditivos (via lib/kalshi)"], w)
    pdf.table_row(["Metaculus", "Previsões de especialistas (via lib/metaculus)"], w)
    pdf.table_row(["Reddit API", "Posts de subreddits financeiros"], w)

    # ═══════════════════════════════════════════════════════════════════════
    # 3. MAPA-MÚNDI
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("3. Aba Bolsas — Mapa-Múndi Interativo (Choropleth)", 1)
    pdf.corpo(
        "O mapa-múndi é o elemento visual central da aba Bolsas. Utiliza react-simple-maps com "
        "projeção geoMercator para renderizar um mapa coroplético (choropleth) interativo que mostra "
        "a variação diária dos índices de cada país."
    )

    pdf.titulo("Tecnologia", 3)
    pdf.bullet("Biblioteca: react-simple-maps (ComposableMap + ZoomableGroup)")
    pdf.bullet("Projeção: geoMercator, escala 130, centro [0, 30]")
    pdf.bullet("Dados geográficos: TopoJSON countries-110m do world-atlas@2")
    pdf.bullet("Resolução: 800x450px (responsivo)")
    pdf.bullet("Zoom: 1x a 8x (botões + scroll do mouse)")
    pdf.ln(2)

    pdf.titulo("Choropleth (Mapa de Calor)", 3)
    pdf.corpo(
        "Cada país é colorido com base na variação percentual do seu principal índice no dia. "
        "A função heatColor() (lib/world-map.ts) converte a variação em uma cor no espectro "
        "vermelho (queda) → amarelo (neutro) → verde (alta), com clamp em ±4%."
    )
    pdf.corpo(
        "A função buildCountryHeatMap() mapeia cada país (ISO numérico) ao índice com maior "
        "variação absoluta. Ao passar o mouse sobre um país, um tooltip mostra o nome do índice, "
        "bandeira e variação."
    )

    pdf.titulo("Marcadores (Markers)", 3)
    pdf.corpo(
        "Além do choropleth, cada índice tem um marcador circular posicionado nas coordenadas "
        "geográficas (lat, lng) da sua bolsa. Os marcadores são coloridos por região conforme "
        "REGION_COLORS:"
    )
    pdf.bullet("Americas: azul (#3b82f6)")
    pdf.bullet("Europe: roxo (#8b5cf6)")
    pdf.bullet("Asia: amarelo (#f59e0b)")
    pdf.bullet("Middle East: vermelho (#ef4444)")
    pdf.bullet("Africa: verde (#10b981)")
    pdf.bullet("Oceania: ciano (#06b6d4)")
    pdf.ln(2)
    pdf.corpo(
        "Um ponto interno verde/vermelho no centro indica se o índice está em alta ou queda. "
        "Ao clicar em um marcador, o índice é selecionado e o painel IndexThermometer se abre."
    )

    pdf.titulo("Controles do Mapa", 3)
    pdf.bullet("Zoom In / Zoom Out / Reset (botões flutuantes no canto superior direito)")
    pdf.bullet("Filtro por região (botões de tag: Americas, Europe, Asia, etc.)")
    pdf.bullet("Hover: destaca o país e mostra tooltip com flag + nome + variação")
    pdf.bullet("Click: seleciona o índice e abre o painel de detalhes (IndexThermometer)")

    # ═══════════════════════════════════════════════════════════════════════
    # 4. INDEX THERMOMETER
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("4. Aba Bolsas — Termômetro de Índice (IndexThermometer)", 1)
    pdf.corpo(
        "Quando um índice é selecionado (clicando no mapa ou na tabela), o componente "
        "IndexThermometer se abre com informações detalhadas. É o painel principal de análise."
    )

    pdf.titulo("Seções do Painel", 2)

    pdf.titulo("4.1 Cabeçalho", 3)
    pdf.bullet("Bandeira + nome do índice + país")
    pdf.bullet("Preço atual em tempo real + moeda local")
    pdf.bullet("Variação do dia (% e valor absoluto) com ícone direcional")
    pdf.bullet("Link externo para TradingView (tvSymbol)")
    pdf.bullet("Botão de pesquisa de ativo customizado (qualquer ticker)")
    pdf.ln(2)

    pdf.titulo("4.2 Retornos por Período", 3)
    pdf.corpo(
        "Grid de 6 cards mostrando retornos em diferentes horizontes temporais. "
        "Os dados vêm da API /api/bolsas/history que calcula percentuais a partir do "
        "histórico de preços do Yahoo Finance."
    )
    pdf.bullet("1 Semana (1S)")
    pdf.bullet("1 Mês (1M)")
    pdf.bullet("3 Meses (3M)")
    pdf.bullet("6 Meses (6M)")
    pdf.bullet("1 Ano (1A)")
    pdf.bullet("Ano corrente — Year-to-Date (YTD)")
    pdf.ln(2)

    pdf.titulo("4.3 Dados OHLC do Dia", 3)
    pdf.corpo(
        "4 métricas do dia atual: Open (Abertura), High (Máxima), Low (Mínima) e Close (Último). "
        "Os dados vêm dos OHLC carregados para o gráfico de velas."
    )

    pdf.titulo("4.4 Ranges (Faixas de Preço)", 3)
    pdf.bullet("Day Range: mínima e máxima do dia com barra visual de posição")
    pdf.bullet("52-Week Range: mínima e máxima de 52 semanas com barra visual de posição")
    pdf.ln(2)

    pdf.titulo("4.5 Gauge VIX (apenas para VIX)", 3)
    pdf.corpo(
        "Quando o VIX é selecionado, um gauge semicircular SVG mostra o nível de medo/ganância. "
        "Faixas: 0-15 Complacência, 15-20 Baixo, 20-30 Moderado, 30-40 Elevado, 40+ Pânico."
    )

    pdf.titulo("4.6 Market Breadth (Amplitude)", 3)
    pdf.corpo(
        "Barra visual mostrando quantos índices estão em alta vs. queda globalmente. "
        "Exemplo: '72/98 em alta'. Dados calculados na API /api/bolsas principal."
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 5. CANDLESTICK CHART
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("5. Aba Bolsas — Gráfico de Velas (CandlestickChart)", 1)
    pdf.corpo(
        "O gráfico de velas usa a biblioteca lightweight-charts (TradingView) para renderizar "
        "um gráfico candlestick interativo com indicadores técnicos. É carregado dentro do "
        "IndexThermometer quando um índice está selecionado."
    )

    pdf.titulo("Configuração do Gráfico", 2)
    pdf.bullet("Biblioteca: lightweight-charts (createChart, CandlestickSeries, LineSeries, HistogramSeries)")
    pdf.bullet("Tema: dark (background #0a0b10, texto #9ca3af, grid sutil)")
    pdf.bullet("Cores: alta = #22c55e (verde), queda = #ef4444 (vermelho)")
    pdf.bullet("Crosshair: modo MagnetPrice + label com formatação customizada")
    pdf.bullet("Time scale: UTC, sem segundos, tick fixo mínimo de 70px")
    pdf.ln(2)

    pdf.titulo("Períodos Disponíveis", 2)
    w = [30, 50, 40, 50]
    pdf.table_row(["Botão", "Range Yahoo", "Intervalo", "Descrição"], w, header=True)
    pdf.table_row(["1M", "1mo", "1d (diário)", "Último mês"], w)
    pdf.table_row(["3M", "3mo", "1d (diário)", "Últimos 3 meses"], w)
    pdf.table_row(["6M", "6mo", "1d (diário)", "Últimos 6 meses"], w)
    pdf.table_row(["1A", "1y", "1d (diário)", "Último ano"], w)
    pdf.table_row(["2A", "2y", "1wk (semanal)", "Últimos 2 anos"], w)
    pdf.table_row(["5A", "5y", "1wk (semanal)", "Últimos 5 anos"], w)
    pdf.ln(3)

    pdf.titulo("Indicadores Técnicos", 2)
    pdf.corpo("7 indicadores técnicos disponíveis via botões toggle:")
    pdf.ln(2)

    pdf.titulo("SMA (Simple Moving Average)", 3)
    pdf.bullet("SMA 20 períodos — linha amarela semitransparente")
    pdf.bullet("SMA 50 períodos — linha roxa semitransparente")
    pdf.bullet("Cálculo: média aritmética dos últimos N fechamentos")
    pdf.ln(2)

    pdf.titulo("EMA (Exponential Moving Average)", 3)
    pdf.bullet("EMA 20 períodos — linha ciano")
    pdf.bullet("Multiplicador: 2 / (período + 1)")
    pdf.bullet("Mais responsiva que SMA a mudanças recentes")
    pdf.ln(2)

    pdf.titulo("Bollinger Bands", 3)
    pdf.bullet("Banda superior e inferior baseadas em SMA(20) ± 2 desvios padrão")
    pdf.bullet("Cores: superior verde claro, inferior vermelho claro")
    pdf.bullet("Indica volatilidade — bandas largas = alta volatilidade")
    pdf.ln(2)

    pdf.titulo("MACD (Moving Average Convergence Divergence)", 3)
    pdf.bullet("Padrão: MACD(12, 26, 9)")
    pdf.bullet("Linha MACD: EMA(12) - EMA(26) — cor ciano")
    pdf.bullet("Linha de Sinal: EMA(9) do MACD — cor laranja")
    pdf.bullet("Histograma: MACD - Sinal — verde (positivo) / vermelho (negativo)")
    pdf.bullet("Renderizado em painel separado abaixo do gráfico principal")
    pdf.ln(2)

    pdf.titulo("RSI (Relative Strength Index)", 3)
    pdf.bullet("RSI(14) — linha magenta em painel separado")
    pdf.bullet("Linhas horizontais de referência em 30 (oversold) e 70 (overbought)")
    pdf.bullet("Escala: 0 a 100")
    pdf.ln(2)

    pdf.titulo("Volume", 3)
    pdf.bullet("Histograma de volume no painel inferior")
    pdf.bullet("Barras verdes (dia de alta) / vermelhas (dia de queda)")
    pdf.bullet("Opacidade 50% para não competir com o gráfico principal")

    # ═══════════════════════════════════════════════════════════════════════
    # 6. TREEMAP
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("6. Aba Bolsas — Treemap de Setores (SectorTreemap)", 1)
    pdf.corpo(
        "O Treemap mostra a composição setorial do índice selecionado. Cada retângulo representa "
        "um setor, com tamanho proporcional ao peso (%) e cor indicando a variação do dia."
    )

    pdf.titulo("Algoritmo", 2)
    pdf.bullet("Algoritmo: Squarified Treemap (implementação própria)")
    pdf.bullet("Layout: squarify() divide o espaço em retângulos com aspect ratio próximo de 1")
    pdf.bullet("Tamanho: proporcional ao peso do setor no índice")
    pdf.bullet("Cor: heatColor() — vermelho (queda) → amarelo → verde (alta)")
    pdf.bullet("Tooltip no hover: nome do setor, peso %, variação %")
    pdf.ln(2)

    pdf.titulo("Dados (API /api/bolsas/sectors)", 2)
    pdf.corpo(
        "A API mapeia cada índice a uma região e busca os ETFs setoriais correspondentes. "
        "Exemplo para o S&P 500: XLK (Tecnologia 31%), XLF (Financeiro 13%), XLV (Saúde 12%), etc. "
        "Para índices sem mapeamento, retorna um fallback com dados simulados."
    )
    pdf.corpo(
        "Regiões mapeadas: US, Brazil, Canada, Europe, Japan, China, Korea, Taiwan, India, "
        "ASEAN, Oceania, Middle East, Africa, Latin America."
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 7. TOP CONSTITUENTS
    # ═══════════════════════════════════════════════════════════════════════
    pdf.titulo("7. Aba Bolsas — Top Constituintes (TopConstituents)", 1)
    pdf.corpo(
        "Lista expansível das 20 maiores ações do índice selecionado. Cada entrada mostra: "
        "ranking, ticker, nome da empresa, preço, variação % e moeda."
    )

    pdf.titulo("Dados (API /api/bolsas/constituents)", 2)
    pdf.corpo(
        "A API mantém listas hardcoded das 20 principais ações por região. "
        "Exemplos:"
    )
    pdf.bullet("US: AAPL, MSFT, NVDA, AMZN, GOOGL, META, BRK-B, TSLA, UNH, LLY...")
    pdf.bullet("Brasil: PETR4, VALE3, ITUB4, BBDC4, BBAS3, B3SA3, ABEV3, WEGE3...")
    pdf.bullet("Argentina: GGAL, YPFD, PAMP, BMA, BBAR, CEPU, ALUA, TXAR...")
    pdf.bullet("26 regiões mapeadas no total")
    pdf.ln(2)
    pdf.corpo(
        "As cotações são buscadas em tempo real via fetchQuotes() do lib/cotacoes.ts "
        "(Yahoo Finance v8 API)."
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 8. COUNTRY INDICATORS
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("8. Aba Bolsas — Indicadores Econômicos do País", 1)
    pdf.corpo(
        "Quando um índice é selecionado, a API /api/bolsas/country busca dados macroeconômicos "
        "do país correspondente usando a World Bank API."
    )

    pdf.titulo("Indicadores", 2)
    w = [45, 45, 80]
    pdf.table_row(["Indicador", "Código WB", "Descrição"], w, header=True)
    pdf.table_row(["PIB (USD)", "NY.GDP.MKTP.CD", "PIB nominal em dólares americanos"], w)
    pdf.table_row(["Cresc. PIB", "NY.GDP.MKTP.KD.ZG", "Crescimento real do PIB (%)"], w)
    pdf.table_row(["Inflação", "FP.CPI.TOTL.ZG", "Variação anual do CPI (%)"], w)
    pdf.table_row(["Taxa de Juros", "FR.INR.DPST", "Taxa de juros de depósito (%)"], w)
    pdf.table_row(["Desemprego", "SL.UEM.TOTL.ZS", "Taxa de desemprego (%)"], w)
    pdf.table_row(["Dívida/PIB", "GC.DOD.TOTL.GD.ZS", "Dívida pública / PIB (%)"], w)
    pdf.table_row(["Conta Corr.", "BN.CAB.XOKA.GD.ZS", "Conta corrente / PIB (%)"], w)
    pdf.table_row(["População", "SP.POP.TOTL", "População total"], w)
    pdf.ln(3)

    pdf.titulo("Outros Dados do País", 2)
    pdf.bullet("Moeda local (COUNTRY_CURRENCY): mapeamento de 60+ países")
    pdf.bullet("Taxa de câmbio vs USD e vs BRL (open.er-api.com)")
    pdf.bullet("Link para Trading Economics (TE_SLUG): ex. trading-economics.com/brazil")
    pdf.bullet("Mapeamento ISO para 60+ países (COUNTRY_ISO)")
    pdf.corpo(
        "Os dados do World Bank são buscados para os últimos 5 anos e o valor mais recente "
        "disponível é retornado, junto com o ano de referência."
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 9. PERFORMANCE POR REGIÃO
    # ═══════════════════════════════════════════════════════════════════════
    pdf.titulo("9. Aba Bolsas — Performance por Região", 1)
    pdf.corpo(
        "Cards resumo mostrando a variação média dos índices por região geográfica. "
        "O componente ChangeBar renderiza barras horizontais proporcionais à variação de cada índice."
    )
    pdf.bullet("Cada região tem cor própria (REGION_COLORS)")
    pdf.bullet("Dentro de cada região, os índices são ordenados por variação")
    pdf.bullet("Barra proporcional: largura = |variação| / max variação na região")
    pdf.bullet("As duas seções: 'Maiores altas' (verde) e 'Maiores quedas' (vermelho)")

    # ═══════════════════════════════════════════════════════════════════════
    # 10. TABELA DE ÍNDICES
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("10. Aba Bolsas — Tabela de Índices (IndexTableSection)", 1)
    pdf.corpo(
        "Tabela completa e interativa com todos os índices disponíveis."
    )

    pdf.titulo("Funcionalidades", 2)
    pdf.bullet("Busca por texto: filtra por nome, símbolo ou país do índice")
    pdf.bullet("Ordenação por coluna: Nome, Região, Preço, Variação (asc/desc)")
    pdf.bullet("Filtro por região (via tags do mapa)")
    pdf.bullet("Hover: destaca o índice no mapa (hoveredIndex)")
    pdf.bullet("Click: seleciona/deseleciona o índice (abre IndexThermometer)")
    pdf.ln(2)

    pdf.titulo("Colunas", 2)
    pdf.bullet("Bandeira + Nome + País")
    pdf.bullet("Região (badge colorida)")
    pdf.bullet("Preço (formatado por magnitude: sem decimais >10k, 2 casas >100, 4 casas <100)")
    pdf.bullet("Variação % (verde/vermelho com ícone direcional)")
    pdf.ln(2)

    pdf.titulo("Responsive", 2)
    pdf.corpo(
        "Em mobile (< md), a coluna Região é ocultada e o layout passa para grid de 12 colunas "
        "redistribuído. A busca e os headers de ordenação são mantidos."
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 11. ABA MOEDAS
    # ═══════════════════════════════════════════════════════════════════════
    pdf.titulo("11. Aba Moedas — Visão Geral", 1)
    pdf.corpo(
        "A aba Moedas mostra cotações de 50+ moedas globais contra o USD, com análise "
        "de força do dólar via DXY e visualização geográfica."
    )

    pdf.titulo("Summary Cards (4 cards superiores)", 2)
    pdf.bullet("USD/BRL: cotação atual do dólar em reais")
    pdf.bullet("Mais forte vs USD: moeda com maior valorização no dia")
    pdf.bullet("Mais fraca vs USD: moeda com maior desvalorização no dia")
    pdf.bullet("Moedas monitoradas: total de moedas + total de regiões")
    pdf.ln(2)

    pdf.titulo("Moedas Monitoradas por Região", 2)
    pdf.bullet("Americas (13): USD, BRL, CAD, MXN, ARS, CLP, COP, PEN, UYU, BOB, PYG, DOP, CRC")
    pdf.bullet("Europe (14): EUR, GBP, CHF, NOK, SEK, DKK, PLN, CZK, HUF, RON, TRY, RUB, UAH, ISK")
    pdf.bullet("Asia (16): JPY, CNY, INR, KRW, SGD, HKD, TWD, THB, IDR, MYR, PHP, VND, PKR, BDT, KZT, LKR")
    pdf.bullet("Middle East (6): ILS, SAR, AED, QAR, KWD, BHD")
    pdf.bullet("Africa (6+): ZAR, EGP, NGN, KES, MAD, GHS...")
    pdf.bullet("Oceania (2): AUD, NZD")

    # ═══════════════════════════════════════════════════════════════════════
    # 12. DXY
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("12. Aba Moedas — Termômetro do Dólar (DXY)", 1)
    pdf.corpo(
        "O componente DollarThermometer é o painel principal da aba Moedas. Mostra a força "
        "do dólar americano medida pelo índice DXY."
    )

    pdf.titulo("Índice DXY", 2)
    pdf.corpo(
        "O DXY (U.S. Dollar Index) mede o valor do dólar contra uma cesta de 6 moedas: "
        "EUR (57.6%), JPY (13.6%), GBP (11.9%), CAD (9.1%), SEK (4.2%), CHF (3.6%)."
    )
    pdf.corpo(
        "A API /api/moedas tenta buscar o DXY real do Yahoo Finance (DX-Y.NYB). Se indisponível, "
        "calcula um DXY sintético usando as taxas das 6 moedas da cesta com os pesos oficiais."
    )

    pdf.titulo("Gauge SVG (Velocímetro)", 2)
    pdf.corpo(
        "Um arco SVG semicircular com gradiente vermelho → amarelo → verde mostra o 'score' "
        "de força do dólar (-100 a +100). Um ponteiro rotaciona conforme o score."
    )
    pdf.bullet("Score < -30: 'Dólar fraco' (vermelho)")
    pdf.bullet("-30 < Score < 30: 'Neutro' (amarelo)")
    pdf.bullet("Score > 30: 'Dólar forte' (verde)")
    pdf.ln(2)

    pdf.titulo("Veredito (Verdict)", 2)
    pdf.corpo(
        "A API calcula um veredito automático com: label, tone (forte/neutro/fraco), score numérico "
        "e uma razão textual explicando o diagnóstico. A lógica considera: variação do DXY, "
        "breadth (quantas moedas o USD ganhou/perdeu), e momentum de curto prazo."
    )

    pdf.titulo("Gráfico Histórico", 2)
    pdf.corpo(
        "AreaChart (Recharts) mostrando o histórico do DXY com 4 períodos selecionáveis: "
        "1M, 3M, 6M, 1A. Cor do gráfico: verde (alta no período) ou vermelho (queda)."
    )

    pdf.titulo("Retornos por Período", 2)
    pdf.corpo("Grid de 6 cards: 1S, 1M, 3M, 6M, 1A, YTD — com valores percentuais.")

    # ═══════════════════════════════════════════════════════════════════════
    # 13. MAPA DE MOEDAS
    # ═══════════════════════════════════════════════════════════════════════
    pdf.titulo("13. Aba Moedas — Mapa de Cotações", 1)
    pdf.corpo(
        "Similar ao mapa de bolsas, mas mostrando moedas. O componente CurrencyWorldMap "
        "(React.memo) renderiza marcadores para cada moeda nas coordenadas da sua capital."
    )

    pdf.titulo("Diferenças vs Mapa de Bolsas", 2)
    pdf.bullet("Marcadores coloridos por região (mesma paleta REGION_COLORS)")
    pdf.bullet("Ponto central: verde (moeda valorizou vs USD) ou vermelho (desvalorizou)")
    pdf.bullet("Hover tooltip: nome, cotação (1 USD = X) e variação %")
    pdf.bullet("Click: seleciona moeda e abre painel de detalhe")
    pdf.bullet("Filtro por região: tags superiores (Americas, Europe, Asia...)")
    pdf.bullet("Animação de pulso SVG no marcador ativo")
    pdf.ln(2)

    pdf.titulo("Painel de Moeda Selecionada", 2)
    pdf.corpo(
        "Ao clicar em uma moeda, exibe: bandeira grande, nome, código, região, cotação, "
        "variação do dia (% e absoluta), e conversão para BRL."
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 14. TABELA DE MOEDAS
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("14. Aba Moedas — Tabela e Rankings", 1)

    pdf.titulo("Tabela de Moedas", 2)
    pdf.corpo(
        "Tabela completa com todas as moedas monitoradas. Similar à tabela de índices."
    )
    pdf.bullet("Colunas: Bandeira + Código + Nome, Região, Cotação (1 USD), Variação %, Vs BRL")
    pdf.bullet("Busca por texto, ordenação por coluna (código, região, cotação, variação)")
    pdf.bullet("Hover/click sincronizados com o mapa")
    pdf.bullet("Conversão Vs BRL calculada: USD/BRL dividido pela cotação da moeda")
    pdf.ln(2)

    pdf.titulo("Performance por Região", 2)
    pdf.corpo(
        "Grid de cards (2-6 colunas responsivo) mostrando a variação média de cada região. "
        "Clicável para filtrar moedas daquela região."
    )

    pdf.titulo("Rankings: Mais Fortes e Mais Fracas", 2)
    pdf.corpo(
        "Dois painéis lado a lado com barras horizontais (CurrencyChangeBar):"
    )
    pdf.bullet("Mais Fortes vs USD: top 8 moedas que mais se valorizaram (verde)")
    pdf.bullet("Mais Fracas vs USD: top 8 moedas que mais se desvalorizaram (vermelho)")

    # ═══════════════════════════════════════════════════════════════════════
    # 15. ABA INTELIGÊNCIA
    # ═══════════════════════════════════════════════════════════════════════
    pdf.titulo("15. Aba Inteligência — Notícias e Preditivos", 1)
    pdf.corpo(
        "A aba Inteligência é carregada via dynamic import (next/dynamic) do componente "
        "InteligenciaContent. Ela agrega múltiplas fontes de informação financeira."
    )

    pdf.titulo("Componentes", 2)
    pdf.bullet("Ticker Tape: banner horizontal scrollável com cotações em tempo real dos ativos do portfólio")
    pdf.bullet("Notícias: cards de notícias financeiras categorizadas (mercado, portfólio, economia, macro, setor)")
    pdf.bullet("Reddit: posts de subreddits financeiros brasileiros e internacionais")
    pdf.bullet("Mercados Preditivos: integração com Polymarket, Kalshi e Metaculus")
    pdf.ln(2)

    pdf.titulo("Dados das Notícias", 2)
    pdf.bullet("API: /api/noticias — notícias filtradas por relevância ao portfólio")
    pdf.bullet("Classificação por impacto: alto (Zap icon, vermelho), médio (AlertTriangle, amarelo), baixo")
    pdf.bullet("Tags de tickers mencionados (excluindo genéricos como 'Mercado', 'Economia')")
    pdf.bullet("Timestamp relativo: '2h atrás', '1d atrás'")
    pdf.ln(2)

    pdf.titulo("Mercados Preditivos", 2)
    pdf.bullet("Polymarket: buscado via lib/polymarket.ts (fetchPolymarket + polyToUnified)")
    pdf.bullet("Kalshi: buscado via lib/kalshi.ts (fetchKalshi)")
    pdf.bullet("Metaculus: buscado via lib/metaculus.ts (fetchMetaculus)")
    pdf.bullet("Formato unificado: UnifiedPrediction com título, probabilidade, fonte, URL")

    # ═══════════════════════════════════════════════════════════════════════
    # 16. APIS BACKEND
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("16. APIs Backend — Endpoints e Fontes de Dados", 1)
    pdf.corpo(
        "Todos os endpoints são Next.js API Routes com dynamic = 'force-dynamic' e "
        "maxDuration de 15-25 segundos. Nenhum dado é servido de cache estático."
    )

    apis = [
        {
            "rota": "GET /api/bolsas",
            "arquivo": "app/api/bolsas/route.ts",
            "fonte": "Yahoo Finance (fetchQuotes)",
            "cache": "s-maxage=900, stale-while-revalidate=300",
            "desc": (
                "Retorna cotações de 100+ índices globais. Para cada índice: preço, variação, "
                "variação %, moeda. Também retorna: histórico S&P 500 (1 ano), retornos por período, "
                "breadth (quantos em alta/queda), melhor e pior do dia. "
                "86 índices hardcoded: 20 Americas, 35 Europe, 24 Asia, 10 Middle East, 13 Africa, 3 Oceania."
            ),
        },
        {
            "rota": "GET /api/bolsas/history?symbol=X",
            "arquivo": "app/api/bolsas/history/handler.ts",
            "fonte": "Yahoo Finance (fetchHistory, 1y, 1d)",
            "cache": "900s",
            "desc": (
                "Calcula retornos percentuais para 6 períodos: 1S, 1M, 3M, 6M, 1A, YTD. "
                "Busca closeNDaysAgo() e closeYtd() do histórico de preços."
            ),
        },
        {
            "rota": "GET /api/bolsas/ohlc?symbol=X&range=R&interval=I",
            "arquivo": "app/api/bolsas/ohlc/handler.ts",
            "fonte": "Yahoo Finance v8 chart API",
            "cache": "300s",
            "desc": (
                "Retorna dados OHLC (Open, High, Low, Close, Volume) para qualquer ticker. "
                "Faz failover entre query1/query2 do Yahoo. Filtra pontos com dados inválidos."
            ),
        },
        {
            "rota": "GET /api/bolsas/sectors?symbol=X",
            "arquivo": "app/api/bolsas/sectors/handler.ts",
            "fonte": "Yahoo Finance (ETFs setoriais)",
            "cache": "900s",
            "desc": (
                "Mapeia o índice a uma região e retorna composição setorial. "
                "Para US: XLK, XLF, XLV, XLY, etc. Para Brasil: ETFs setoriais brasileiros. "
                "Fallback com dados estimados quando não há ETF."
            ),
        },
        {
            "rota": "GET /api/bolsas/constituents?symbol=X",
            "arquivo": "app/api/bolsas/constituents/handler.ts",
            "fonte": "Yahoo Finance (cotações individuais)",
            "cache": "900s",
            "desc": (
                "Retorna as 20 maiores ações do índice com preço e variação em tempo real. "
                "26 regiões mapeadas com listas hardcoded."
            ),
        },
    ]

    for api in apis:
        pdf.check_page_break(40)
        pdf.titulo(api["rota"], 3)
        pdf.info_box("Arquivo", api["arquivo"])
        pdf.info_box("Fonte", api["fonte"])
        pdf.info_box("Cache", api["cache"])
        pdf.corpo(api["desc"])
        pdf.ln(1)

    apis2 = [
        {
            "rota": "GET /api/bolsas/profile?symbol=X",
            "arquivo": "app/api/bolsas/profile/handler.ts",
            "fonte": "Google Generative AI (Gemini) + Yahoo",
            "cache": "3600s",
            "desc": (
                "Retorna perfil descritivo do índice. Primeiro tenta descrição hardcoded "
                "(INDEX_DESCRIPTIONS para ~35 índices). Se indisponível, busca via Yahoo quoteSummary, "
                "e como último recurso, gera via Gemini AI."
            ),
        },
        {
            "rota": "GET /api/bolsas/country?country=X",
            "arquivo": "app/api/bolsas/country/handler.ts",
            "fonte": "World Bank API + open.er-api.com",
            "cache": "86400s (WB) + 3600s (FX)",
            "desc": (
                "Retorna 8 indicadores macroeconômicos do World Bank (PIB, inflação, desemprego...), "
                "taxa de câmbio vs USD/BRL, e link para Trading Economics. "
                "60+ países mapeados."
            ),
        },
        {
            "rota": "GET /api/bolsas/yields",
            "arquivo": "app/api/bolsas/yields/handler.ts",
            "fonte": "Yahoo Finance (^IRX, ^FVX, ^TNX, ^TYX, DX-Y.NYB, GC=F)",
            "cache": "—",
            "desc": (
                "Curva de juros do Tesouro US (3M, 2Y, 5Y, 10Y, 30Y), spread 10Y-2Y, "
                "DXY (índice dólar) e ouro (gold futures)."
            ),
        },
        {
            "rota": "GET /api/bolsas/crypto",
            "arquivo": "app/api/bolsas/crypto/handler.ts",
            "fonte": "CoinGecko API",
            "cache": "revalidate=120s",
            "desc": (
                "Top 12 criptomoedas por market cap. Para cada: preço, variação 1h/24h/7d, "
                "volume, sparkline 7 dias, ATH e variação vs ATH."
            ),
        },
        {
            "rota": "GET /api/moedas",
            "arquivo": "app/api/moedas/handler.ts",
            "fonte": "Yahoo Finance (pares FX)",
            "cache": "900s",
            "desc": (
                "50+ moedas com cotação, variação, coordenadas geográficas. "
                "DXY real ou sintético (cesta de 6 moedas). USD/BRL. "
                "Veredito automático de força do dólar com score -100 a +100. "
                "Breadth: quantas moedas o USD ganhou/perdeu no dia."
            ),
        },
    ]

    pdf.add_page()
    for api in apis2:
        pdf.check_page_break(40)
        pdf.titulo(api["rota"], 3)
        pdf.info_box("Arquivo", api["arquivo"])
        pdf.info_box("Fonte", api["fonte"])
        pdf.info_box("Cache", api["cache"])
        pdf.corpo(api["desc"])
        pdf.ln(1)

    # ═══════════════════════════════════════════════════════════════════════
    # 17. BIBLIOTECAS
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("17. Bibliotecas Compartilhadas", 1)

    pdf.titulo("lib/world-map.ts", 2)
    pdf.corpo("Constantes e funções compartilhadas para os mapas-múndi.")
    pdf.bullet("GEO_URL: URL do TopoJSON (cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json)")
    pdf.bullet("IndexData: interface TypeScript do índice (symbol, tvSymbol, name, country, flag, region, lat, lng, price, change, changePct, currency)")
    pdf.bullet("REGION_COLORS: mapeamento região → cor hex")
    pdf.bullet("COUNTRY_TO_ISO_NUM: mapeamento país (PT-BR) → código ISO numérico (52 países)")
    pdf.bullet("heatColor(pct): converte variação % em cor RGB (vermelho → amarelo → verde, clamp ±4%)")
    pdf.bullet("buildCountryHeatMap(indices): mapa ISO → melhor índice do país")
    pdf.ln(3)

    pdf.titulo("lib/cotacoes.ts", 2)
    pdf.corpo(
        "Motor de cotações do dashboard. Funções principais usadas pelo Radar:"
    )
    pdf.bullet("fetchQuotes(symbols): busca cotações em lote do Yahoo Finance v8")
    pdf.bullet("fetchHistory(symbol, range, interval): busca histórico de preços")
    pdf.bullet("fxToBRL(quotes): converte cotações para BRL usando par FX")
    pdf.ln(3)

    pdf.titulo("lib/chart-theme.ts", 2)
    pdf.corpo("Estilos compartilhados para tooltips do Recharts:")
    pdf.bullet("TOOLTIP_ITEM_STYLE: estilo do item no tooltip")
    pdf.bullet("TOOLTIP_LABEL_STYLE: estilo do rótulo no tooltip")
    pdf.ln(3)

    pdf.titulo("components/InteligenciaContent.tsx", 2)
    pdf.corpo(
        "Componente da aba Inteligência, carregado via dynamic import. "
        "Integra: notícias (/api/noticias), Reddit, Polymarket, Kalshi, Metaculus. "
        "Inclui TickerTape (banner scrollável com cotações do portfólio)."
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 18. COBERTURA GEOGRÁFICA
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.titulo("18. Cobertura Geográfica", 1)
    pdf.corpo(
        "A página Radar monitora índices e moedas de praticamente todos os mercados "
        "acionários do mundo. Abaixo, o resumo por região."
    )

    regions_data = [
        ("Americas (20 índices)", [
            "S&P 500, Dow Jones, NASDAQ Composite, NASDAQ 100 (EUA)",
            "Russell 2000, NYSE Composite, VIX, PHLX Semiconductor, Dow Transportes (EUA)",
            "Ibovespa (Brasil), S&P/TSX (Canadá), IPC México",
            "MERVAL (Argentina), IPSA (Chile), COLCAP (Colômbia)",
            "S&P/BVL Peru, BVP Caracas, CR20 Costa Rica, BVL Rep. Dominicana, BVP Panamá",
        ]),
        ("Europe (35 índices)", [
            "Euro Stoxx 50, STOXX 600, FTSE 100/250, DAX, CAC 40 (core)",
            "IBEX 35, FTSE MIB, SMI, AEX, OMX Stockholm/Copenhagen/Helsinki (ocidental)",
            "Oslo, ATX, BEL 20, PSI 20, WIG 20 (ocidental)",
            "BIST 100, MOEX, BUX, PX Praga, BET Bucareste (oriental)",
            "Athens, ICEX, OMX Vilnius/Riga/Tallinn (bálticos/nórdicos)",
            "CROBEX, SBI TOP, BELEX 15, SOFIX, BIRS, LuxX, MSE Malta, PFTS (diversos)",
        ]),
        ("Asia (24 índices)", [
            "Nikkei 225, TOPIX (Japão)",
            "Hang Seng, Hang Seng Tech, Shanghai Composite, Shenzhen, CSI 300 (China/HK)",
            "KOSPI, KOSDAQ (Coreia), TAIEX (Taiwan)",
            "BSE Sensex, Nifty 50 (Índia)",
            "STI (Singapura), Jakarta (Indonésia), KLCI (Malásia), SET (Tailândia)",
            "VN-Index (Vietnã), PSEi (Filipinas), KSE 100 (Paquistão)",
            "CSE (Sri Lanka), DSEX (Bangladesh), NEPSE (Nepal), MSE Top 20 (Mongólia), KASE (Cazaquistão)",
        ]),
        ("Middle East (10 índices)", [
            "TA-125 (Israel), Tadawul (Arábia Saudita), DFM/ADI (Emirados)",
            "Qatar General, Kuwait All Share, Bahrain, MSM 30 (Omã), Amman SE (Jordânia), BLOM (Líbano)",
        ]),
        ("Africa (13 índices)", [
            "JSE All Share (África do Sul), EGX 30 (Egito), MASI (Marrocos)",
            "NGX (Nigéria), NSE 20 (Quênia), TUNINDEX (Tunísia), SEMDEX (Maurício)",
            "DCI (Botsuana), GSE (Gana), DSE (Tanzânia), USE (Uganda), BRVM (Costa do Marfim), RSE (Ruanda)",
        ]),
        ("Oceania (3 índices)", [
            "ASX 200, ASX All Ordinaries (Austrália), NZX 50 (Nova Zelândia)",
        ]),
    ]

    for region, items in regions_data:
        pdf.check_page_break(30)
        pdf.titulo(region, 3)
        for item in items:
            pdf.bullet(item)
        pdf.ln(2)

    # ═══════════════════════════════════════════════════════════════════════
    # FINAL
    # ═══════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.ln(20)
    pdf.set_font("DejaVu", "B", 16)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 10, "Resumo Técnico", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    pdf.set_draw_color(59, 130, 246)
    pdf.set_line_width(0.8)
    pdf.line(60, pdf.get_y(), 150, pdf.get_y())
    pdf.ln(10)

    stats = [
        ("Linhas de código", "~2.803 (page.tsx) + ~1.200 (API routes)"),
        ("Índices monitorados", "105+ em 6 continentes"),
        ("Moedas monitoradas", "50+ em 6 regiões"),
        ("Países mapeados", "60+ com indicadores econômicos"),
        ("APIs externas", "Yahoo Finance, World Bank, CoinGecko, Google AI, ExchangeRate"),
        ("Indicadores técnicos", "7 (SMA, EMA, Bollinger, MACD, RSI, Volume, OHLC)"),
        ("Bibliotecas de gráficos", "lightweight-charts + Recharts + react-simple-maps"),
        ("Mercados preditivos", "Polymarket, Kalshi, Metaculus"),
        ("Fontes de notícias", "API própria + Reddit"),
    ]

    for label, value in stats:
        pdf.check_page_break(10)
        pdf.info_box(label, value)
        pdf.ln(1)

    pdf.ln(10)
    pdf.set_font("DejaVu", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 7, "Documento gerado automaticamente — Junho 2026", align="C")

    output_path = "/home/user/Meus-investimentos-dev/docs/radar-documentacao.pdf"
    pdf.output(output_path)
    print(f"PDF gerado: {output_path}")

if __name__ == "__main__":
    main()
