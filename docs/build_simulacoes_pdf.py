#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera um dossiê PDF explicativo da página "Simulações" do Meus Investimentos.
Estética synthwave/terminal (rosa · ciano · roxo sobre fundo escuro), alinhada
à identidade LBF. Render via WeasyPrint (HTML/CSS -> PDF).
"""

from weasyprint import HTML
from datetime import date

OUT = "/home/user/Meus-investimentos-dev/docs/Simulacoes-Dossie.pdf"
HOJE = date.today().strftime("%d/%m/%Y")

# ── Paleta synthwave ──────────────────────────────────────────────────────────
PINK = "#ff5fd2"
CYAN = "#46e0e0"
PURPLE = "#a06bff"
AMBER = "#E8A33D"
GREEN = "#4ade80"
RED = "#f87171"
BG = "#0b0d16"
CARD = "#12141f"
LINE = "rgba(255,255,255,0.10)"
TXT = "#e7e7ee"
MUT = "#9aa0b4"
FAINT = "#5d6377"

CSS = f"""
@page {{
  size: A4;
  margin: 18mm 16mm 16mm 16mm;
  background: {BG};
  @bottom-center {{
    content: "Meus Investimentos · Dossiê Simulações";
    font-family: 'Helvetica', sans-serif; font-size: 7pt; color: {FAINT};
  }}
  @bottom-right {{
    content: counter(page) " / " counter(pages);
    font-family: 'Helvetica', sans-serif; font-size: 7pt; color: {FAINT};
  }}
}}
@page cover {{ margin: 0; background: {BG}; @bottom-center {{ content: none; }} @bottom-right {{ content: none; }} }}

* {{ box-sizing: border-box; }}
html {{ background: {BG}; }}
body {{
  font-family: 'Helvetica', 'Arial', sans-serif;
  color: {TXT}; font-size: 9.6pt; line-height: 1.5; margin: 0;
  background: {BG};
}}

h1 {{ font-size: 20pt; margin: 0 0 4pt 0; color: #fff; letter-spacing: -.3pt; }}
h2 {{
  font-size: 13pt; margin: 20pt 0 7pt 0; color: #fff;
  padding-bottom: 4pt; border-bottom: 1px solid {LINE};
}}
h2 .num {{
  font-family: monospace; font-size: 10pt; color: {PINK};
  margin-right: 8pt; font-weight: 700;
}}
h3 {{ font-size: 10.5pt; margin: 13pt 0 4pt 0; color: {CYAN}; letter-spacing: .2pt; }}
p {{ margin: 0 0 7pt 0; }}
strong {{ color: #fff; }}
code {{
  font-family: monospace; font-size: 8.6pt; color: {PINK};
  background: rgba(255,95,210,0.08); padding: 1px 4px; border-radius: 3px;
}}
.muted {{ color: {MUT}; }}
.small {{ font-size: 8.2pt; }}

.card {{
  background: {CARD}; border: 1px solid {LINE}; border-radius: 10px;
  padding: 11pt 13pt; margin: 9pt 0;
}}
.grad-rule {{ height: 3px; border-radius: 3px; border: none; margin: 0 0 14pt 0;
  background: linear-gradient(90deg, {PINK} 0%, {PURPLE} 50%, {CYAN} 100%); }}

ul {{ margin: 3pt 0 8pt 0; padding-left: 16pt; }}
li {{ margin: 0 0 3.5pt 0; }}
li::marker {{ color: {PINK}; }}

table {{ width: 100%; border-collapse: collapse; margin: 6pt 0 10pt 0; font-size: 8.6pt; }}
th {{
  text-align: left; color: {FAINT}; font-size: 7.4pt; text-transform: uppercase;
  letter-spacing: .6pt; padding: 4pt 6pt; border-bottom: 1px solid {LINE};
}}
td {{ padding: 4pt 6pt; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }}
td.k {{ color: {CYAN}; font-family: monospace; font-size: 8pt; white-space: nowrap; }}

.tag {{
  display: inline-block; font-family: monospace; font-size: 7.4pt; font-weight: 700;
  padding: 1.5pt 6pt; border-radius: 20px; margin-right: 4pt;
}}
.t-pink {{ background: rgba(255,95,210,0.14); color: {PINK}; border: 1px solid rgba(255,95,210,0.3); }}
.t-cyan {{ background: rgba(70,224,224,0.12); color: {CYAN}; border: 1px solid rgba(70,224,224,0.3); }}
.t-amber{{ background: rgba(232,163,61,0.12); color: {AMBER}; border: 1px solid rgba(232,163,61,0.3); }}
.t-green{{ background: rgba(74,222,128,0.12); color: {GREEN}; border: 1px solid rgba(74,222,128,0.3); }}

.flow td {{ border: none; padding: 3pt 4pt; vertical-align: middle; }}
td.box, .box {{
  background: rgba(255,255,255,0.03); border: 1px solid {LINE}; border-radius: 8px;
  padding: 7pt 9pt; font-size: 8.4pt; text-align: center;
}}
.box b {{ color: #fff; display:block; font-size: 9pt; }}
.arrow {{ color: {PINK}; font-size: 13pt; text-align: center; font-weight: 700; }}

.callout {{
  border-left: 3px solid {AMBER}; background: rgba(232,163,61,0.06);
  padding: 8pt 12pt; border-radius: 0 8px 8px 0; margin: 9pt 0; font-size: 9pt;
}}
.callout.canon {{ border-left-color: {PURPLE}; background: rgba(160,107,255,0.07); }}

/* dimension chips grid */
.dims td {{ border: none; padding: 4pt; width: 33.3%; }}
.dim {{
  background: {CARD}; border: 1px solid {LINE}; border-radius: 9px; padding: 8pt 9pt;
  height: 100%;
}}
.dim .dt {{ font-weight: 700; color: #fff; font-size: 9pt; }}
.dim .dd {{ color: {MUT}; font-size: 7.9pt; margin-top: 2pt; }}

/* mini donut legend rows */
.legrow {{ font-size: 8.3pt; }}
.dot {{ display:inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5pt; }}
"""

# ── COVER ─────────────────────────────────────────────────────────────────────
cover = f"""
<div style="page: cover; height: 297mm; position: relative; overflow: hidden;
     background:
       radial-gradient(120% 80% at 50% -10%, rgba(160,107,255,0.30) 0%, rgba(11,13,22,0) 55%),
       radial-gradient(90% 60% at 15% 110%, rgba(70,224,224,0.18) 0%, rgba(11,13,22,0) 50%),
       {BG};">

  <!-- synthwave horizon grid -->
  <div style="position:absolute; left:0; right:0; bottom:0; height:120mm;
       background:
         repeating-linear-gradient(90deg, rgba(255,95,210,0.16) 0 1px, transparent 1px 26px),
         repeating-linear-gradient(0deg, rgba(70,224,224,0.14) 0 1px, transparent 1px 22px);
       transform: perspective(40mm) rotateX(58deg); transform-origin: bottom; opacity:.5;"></div>
  <div style="position:absolute; left:50%; top:62mm; width:78mm; height:78mm; margin-left:-39mm;
       border-radius:50%; background: radial-gradient(circle, {PINK} 0%, #ff2e9a 45%, rgba(255,46,154,0) 72%);
       opacity:.22;"></div>

  <div style="position:absolute; top:42mm; left:0; right:0; text-align:center;">
    <div style="font-family:monospace; letter-spacing:10pt; font-size:11pt; color:{CYAN};
         text-shadow:0 0 14px rgba(70,224,224,.7);">L B F</div>
    <div style="font-family:monospace; font-size:7.5pt; letter-spacing:4pt; color:{MUT}; margin-top:4pt;">
      MEUS&nbsp;INVESTIMENTOS&nbsp;·&nbsp;TERMINAL</div>
  </div>

  <div style="position:absolute; top:104mm; left:18mm; right:18mm; text-align:center;">
    <div style="font-size:34pt; font-weight:800; color:#fff; letter-spacing:-.5pt;
         text-shadow:0 0 26px rgba(160,107,255,.55);">Simulações</div>
    <div style="font-size:13pt; color:{PINK}; font-weight:600; margin-top:2pt;">
      Dossiê de Reconstrução &amp; Documentação Técnica</div>
    <div style="width:60mm; height:3px; margin:13pt auto; border-radius:3px;
         background:linear-gradient(90deg,{PINK},{PURPLE},{CYAN});"></div>
    <div style="font-size:9.5pt; color:{MUT}; max-width:120mm; margin:0 auto; line-height:1.6;">
      Como funciona o laboratório de cenários do portfólio: o que ele faz,
      como calcula o impacto de compras e vendas na alocação e como se conecta
      ao motor canônico do sistema.</div>
  </div>

  <div style="position:absolute; bottom:20mm; left:0; right:0; text-align:center;
       font-family:monospace; font-size:8pt; color:{FAINT};">
    Gerado em {HOJE} &nbsp;·&nbsp; app/simulacoes/page.tsx &nbsp;·&nbsp; app/api/simulacoes/handler.ts
  </div>
</div>
"""

# ── SECTION 1 — VISÃO GERAL ───────────────────────────────────────────────────
s1 = f"""
<h1>1 · O que é a página de Simulações</h1>
<hr class="grad-rule"/>
<p>A página <strong>Simulações</strong> é um <strong>laboratório de cenários "e se…?"</strong> sobre o
portfólio real. Você monta uma lista de operações hipotéticas — compras e vendas — e a página
mostra, <strong>lado a lado</strong>, como sua alocação ficaria <em>antes</em> e <em>depois</em>
daquele cenário, em sete dimensões diferentes (setor, moeda, classe, tipo, custódia, etc.).</p>

<p>Nada do que se faz aqui toca a carteira real: é puramente exploratório. O único dado persistido
é o próprio <em>cenário</em> (a lista de operações), para você reabrir depois.</p>

<div class="card">
  <span class="tag t-pink">Entrada</span> lista de operações (compra/venda · ticker · qtd · preço · moeda)<br/><br/>
  <span class="tag t-cyan">Base</span> sua carteira atual (motor canônico) + posições de renda fixa<br/><br/>
  <span class="tag t-amber">Saída</span> comparação <b>Atual&nbsp;×&nbsp;Simulado</b> em 7 lentes + cards de caixa/patrimônio + look-through de ETFs
</div>

<h3>Para que serve na prática</h3>
<ul>
  <li><strong>Rebalanceamento:</strong> "se eu vender X e comprar Y, minha exposição a tecnologia sobe quanto?"</li>
  <li><strong>Controle de caixa/margem:</strong> o cenário consome o caixa em USD/BRL e avisa se você entraria em <em>margin</em> na IBKR.</li>
  <li><strong>Diversificação:</strong> mede a concentração nos 3 maiores setores antes e depois.</li>
  <li><strong>Visão real de exposição:</strong> via <em>look-through</em> de ETFs, mostra o que você de fato carrega por dentro dos fundos.</li>
</ul>

<div class="callout">
  <strong>Exemplo do cenário "Toxinas compras"</strong> (das telas anexadas): comprar
  <code>ZURN.SW</code>, <code>VOW.DE</code>, <code>SIVR</code>, <code>IAU</code>,
  <code>FLJP</code> e <code>TM</code> levaria o patrimônio de <strong>R$ 241,9k</strong> para
  <strong>R$ 197,9k</strong> em ativos investidos, consumindo o caixa em USD/CHF/EUR e elevando
  a fatia de <em>Renda Variável</em> de 66,1% para 87,3%.
</div>
"""

# ── SECTION 2 — ARQUITETURA / FLUXO ───────────────────────────────────────────
s2 = f"""
<h2><span class="num">02</span>Arquitetura &amp; fluxo de dados</h2>
<p>A página é um componente React client-side (<code>app/simulacoes/page.tsx</code>) que combina
três fontes vivas com uma lista de operações em memória. Tudo é recalculado de forma reativa
via <code>useMemo</code> a cada mudança.</p>

<table class="flow">
  <tr>
    <td class="box"><b>Carteira atual</b><span class="muted">usePortfolio()<br/>→ /api/cotacoes</span></td>
    <td class="arrow">→</td>
    <td class="box" rowspan="1"><b>currentPositions</b><span class="muted">posições + RF<br/>(fixa_aberta)</span></td>
    <td class="arrow">→</td>
    <td class="box"><b>buildAllocation()</b><span class="muted">7 dimensões<br/>"Atual"</span></td>
  </tr>
</table>
<table class="flow">
  <tr>
    <td class="box"><b>Operações sim.</b><span class="muted">compra/venda<br/>em memória</span></td>
    <td class="arrow">+</td>
    <td class="box"><b>Cotações ao vivo</b><span class="muted">/api/market/ohlc<br/>(60s)</span></td>
    <td class="arrow">+</td>
    <td class="box"><b>Câmbio ao vivo</b><span class="muted">open.er-api.com<br/>(5 min)</span></td>
    <td class="arrow">→</td>
    <td class="box"><b>simAlloc</b><span class="muted">"Simulado"</span></td>
  </tr>
</table>

<h3>As três fontes vivas</h3>
<table>
  <tr><th>Fonte</th><th>Origem</th><th>Atualização</th></tr>
  <tr><td class="k">Carteira</td><td><code>usePortfolio()</code> → <code>/api/cotacoes</code> (motor canônico <code>calcularSnapshot</code>)</td><td>no load</td></tr>
  <tr><td class="k">Renda Fixa</td><td><code>/api/renda-fixa/posicoes</code> (abertas + caixa de <code>fixa_aberta</code>)</td><td>no load</td></tr>
  <tr><td class="k">Cotações</td><td><code>/api/market/ohlc</code> — último fechamento + variação 5d</td><td>blur do ticker + 60s</td></tr>
  <tr><td class="k">Câmbio</td><td><code>open.er-api.com</code> (USD base) → todas as moedas em BRL</td><td>load + 5 min</td></tr>
</table>

<div class="callout canon">
  <strong>Princípio canônico.</strong> A coluna "Atual" <em>não</em> recalcula a carteira: ela reusa
  o <code>valorAtualBRL</code> que vem do motor único (<code>lib/portfolio.ts</code>). A página só
  acrescenta as operações hipotéticas por cima — assim Simulações nunca diverge do Resumo.
</div>
"""

# ── SECTION 3 — EDITOR DE OPERAÇÕES ───────────────────────────────────────────
s3 = f"""
<h2><span class="num">03</span>Coluna esquerda — editor de operações</h2>
<p>A coluna estreita à esquerda é onde se monta o cenário. Cada linha é uma operação com tipo,
ticker, quantidade, preço e moeda. A página faz o trabalho pesado de preencher dados sozinha.</p>

<h3>Automação ao digitar o ticker (onBlur)</h3>
<ul>
  <li><strong>Detecção de setor e moeda:</strong> pelo sufixo da bolsa (<code>.SA</code>→BRL,
     <code>.DE</code>→EUR, <code>.SW</code>→CHF, <code>.TO</code>→CAD…) ou heurística por classe.</li>
  <li><strong>Preço automático:</strong> se o ativo já está na carteira, usa o preço atual;
     senão busca em <code>/api/market/ohlc</code>. Renda fixa puxa o saldo de <code>fixa_aberta</code>.</li>
  <li><strong>Resolução de símbolo:</strong> se a API resolve um símbolo diferente, a moeda é
     corrigida automaticamente (ex.: a bolsa real do papel).</li>
  <li><strong>Cartão de cotação:</strong> mostra preço, variação do dia, nome longo, setor econômico
     e indústria — feedback imediato de que o ticker foi reconhecido.</li>
</ul>

<h3>Gestão de cenários</h3>
<table>
  <tr><th>Ação</th><th>O que faz</th></tr>
  <tr><td class="k">Salvar</td><td>Grava o cenário (nome + operações) na aba <code>simulacoes</code> do Sheets</td></tr>
  <tr><td class="k">Carregar</td><td>Lista os cenários salvos; recarrega operações e reavalia com cotações atuais</td></tr>
  <tr><td class="k">Novo</td><td>Limpa a lista para começar um cenário do zero</td></tr>
  <tr><td class="k">Adicionar</td><td>Insere uma nova linha de operação em branco</td></tr>
</table>

<div class="callout">
  As cotações e o câmbio são <strong>ao vivo</strong>: ao reabrir um cenário salvo há semanas, os
  preços e taxas são re-buscados — o impacto é sempre avaliado com o mercado de hoje, não com o
  do dia em que a operação foi criada.
</div>
"""

# ── SECTION 4 — CARDS DE RESUMO ───────────────────────────────────────────────
s4 = f"""
<h2><span class="num">04</span>Cards de resumo — caixa, moeda e patrimônio</h2>
<p>No topo da coluna direita, quatro cards traduzem o cenário em números de caixa e patrimônio.</p>

<table>
  <tr><th>Card</th><th>O que mede</th><th>Detalhe</th></tr>
  <tr><td class="k">Patrimônio Atual</td><td>Total da carteira hoje</td><td>soma de todas as posições (motor canônico)</td></tr>
  <tr><td class="k">Caixa USD · IBKR</td><td>Caixa em dólar após o cenário</td><td>vira <span style="color:{RED}">Margin Necessária</span> se ficar negativo</td></tr>
  <tr><td class="k">Operações por Moeda</td><td>Somatório líquido (compras − vendas) por moeda nativa</td><td>+ total convertido em BRL e USD</td></tr>
  <tr><td class="k">Novo Patrimônio</td><td>Patrimônio investido após o cenário</td><td>desconta caixa consumido; mostra caixa BR restante</td></tr>
</table>

<h3>Como o caixa é consumido</h3>
<p>Cada compra reduz o caixa da moeda correspondente; cada venda devolve. O card de IBKR parte do
caixa em USD de <code>fixa_aberta</code> (entradas marcadas como caixa em USD) e subtrai as compras
em dólar. Se o resultado for negativo, a página assume <strong>uso de margem</strong> e pinta o
valor de vermelho — um aviso de que o cenário exige alavancagem.</p>

<div class="callout">
  <strong>Leitura do exemplo:</strong> "Caixa USD $1.269", "Operações por Moeda: US$ 2.871 ·
  CHF 1.152 · € 491" e "Novo Patrimônio R$ 197,9k · Caixa BR R$ 55,6k" — o cenário gasta caixa em
  três moedas e ainda deixa folga em reais.
</div>
"""

# ── SECTION 5 — MOTOR DE ALOCAÇÃO ─────────────────────────────────────────────
def dim(t, d):
    return f'<div class="dim"><div class="dt">{t}</div><div class="dd">{d}</div></div>'

s5 = f"""
<h2><span class="num">05</span>O motor de alocação — <code>buildAllocation()</code></h2>
<p>O coração da página. Recebe uma lista de posições (com valor em BRL) e as classifica
simultaneamente em <strong>sete dimensões</strong>. A coluna "Atual" roda sobre a carteira real;
a "Simulada" roda sobre a carteira + operações. Comparar as duas é o produto da página.</p>

<table class="dims">
  <tr>
    <td>{dim("1 · Tipo de Ativo", "Ações BR/Intl, ETF, FIIs, Cripto, BDRs, Commodities, RF, Caixa")}</td>
    <td>{dim("2 · Setor Econômico", "GICS — Tecnologia, Financeiro, Energia… (usa setor da API quando há)")}</td>
    <td>{dim("3 · Moeda / Câmbio", "Exposição cambial real: BRL, USD, EUR, CAD…")}</td>
  </tr>
  <tr>
    <td>{dim("4 · Classe", "Renda Variável · Renda Fixa · Cripto · Commodities")}</td>
    <td>{dim("5 · RF × RV", "Visão binária: tudo que não é RF conta como RV")}</td>
    <td>{dim("6 · Tipo", "Agrupamento operacional: Ações, ETFs, FIIs, BDRs…")}</td>
  </tr>
  <tr>
    <td>{dim("7 · Custódia", "Brasil · Exterior · Cripto (onde o ativo está custodiado)")}</td>
    <td>{dim("+ Posições", "Lista ordenada de todas as posições e seu peso %")}</td>
    <td>{dim("+ Total", "Patrimônio somado, base de todos os percentuais")}</td>
  </tr>
</table>

<h3>Como cada operação entra no cálculo simulado</h3>
<ul>
  <li><strong>Valor em BRL:</strong> <code>quantidade × preço × câmbio_ao_vivo</code> da moeda da operação.</li>
  <li><strong>Compra:</strong> soma o valor à posição existente, ou cria uma posição nova.</li>
  <li><strong>Venda:</strong> subtrai o valor; se zera a posição, ela é removida do mapa.</li>
  <li>Só entram operações válidas (ticker preenchido, quantidade &gt; 0 e preço &gt; 0).</li>
</ul>

<div class="callout canon">
  As funções de classificação (<code>identificarSetor</code>, <code>getMoedaExposicao</code>,
  <code>getSetorEconomico</code>) são as <strong>mesmas</strong> usadas no Resumo e na Composição —
  fonte única de taxonomia (<code>lib/sectors.ts</code>, <code>lib/gics-sectors.ts</code>).
</div>
"""

# ── SECTION 6 — PAINÉIS COMPARATIVOS ──────────────────────────────────────────
s6 = f"""
<h2><span class="num">06</span>Painéis comparativos — Atual × Simulado</h2>
<p>Abaixo dos cards vêm os painéis que visualizam o impacto. Todos seguem o mesmo padrão:
rosca da esquerda = <strong>Atual</strong>, rosca da direita = <strong>Simulado</strong>, e uma
tabela de deltas em pontos percentuais (pp).</p>

<h3>Impacto Setorial do Cenário</h3>
<p>Um gráfico de barras divergente (verde para a direita = aumento, vermelho para a esquerda =
redução) ordenado pelo tamanho da variação. No topo, mede a <strong>concentração top-3</strong>:
quanto os três maiores setores somam antes e depois — termômetro de diversificação.</p>

<h3>Sete painéis de rosca (DonutChart)</h3>
<table>
  <tr><th>Painel</th><th>Dimensão</th></tr>
  <tr><td class="k">Renda Fixa × Renda Variável</td><td>split binário de risco</td></tr>
  <tr><td class="k">Setor Econômico</td><td>GICS — onde está o risco setorial</td></tr>
  <tr><td class="k">Tipo de Ativo</td><td>Ações, ETF, FIIs, Cripto, Commodities…</td></tr>
  <tr><td class="k">Moeda / Exposição Cambial</td><td>quanto em cada moeda</td></tr>
  <tr><td class="k">Classe</td><td>RV · RF · Cripto · Commodities</td></tr>
  <tr><td class="k">Tipo / Custódia</td><td>agrupamento operacional e localização</td></tr>
</table>

<h3>Tabela de comparação (CompareBar)</h3>
<p>Sob cada rosca, cada categoria aparece como:
<code>antes% &rarr; depois% &nbsp; ±delta pp</code> — verde se subiu, vermelho se caiu, "—" se
praticamente igual. É a leitura precisa do que a tela mostra de forma visual.</p>

<div class="card small">
  <span class="legrow"><span class="dot" style="background:{CYAN}"></span><strong>Moeda (exemplo)</strong>
  USD 54,0% → 67,8% <span style="color:{GREEN}">+13,7pp</span> &nbsp;·&nbsp;
  BRL 35,5% → 14,5% <span style="color:{RED}">−21,0pp</span> &nbsp;·&nbsp;
  CHF 0% → 3,5% <span style="color:{GREEN}">+3,5pp</span></span>
</div>
"""

# ── SECTION 7 — LOOK-THROUGH ──────────────────────────────────────────────────
s7 = f"""
<h2><span class="num">07</span>Composição de ETFs — Look-Through</h2>
<p>Painel expansível que "abre" os ETFs e mostra os ativos que você carrega <em>por dentro</em>
deles. Sem isso, um ETF parece uma única posição; com look-through, vê-se a exposição real
(ex.: quanto de Apple você tem somando todas as fontes).</p>

<table>
  <tr><th>Aba</th><th>O que mostra</th></tr>
  <tr><td class="k">Por ETF</td><td>Cada ETF e seus componentes (peso × valor BRL)</td></tr>
  <tr><td class="k">Combinada</td><td>Componentes somados entre todos os ETFs, ranqueados</td></tr>
  <tr><td class="k">RV Completa</td><td>Posições diretas + ETFs expandidos, fundidos por ativo</td></tr>
  <tr><td class="k">Portfólio Completo</td><td>Tudo ranqueado: RV expandida + renda fixa + caixa</td></tr>
</table>

<p>As composições vêm de <code>/api/composicao/resumo</code> (fonte canônica) com fallback ao vivo
em <code>/api/composicao/holdings</code>. O botão <strong>Atualizar</strong> busca holdings novos e
avisa se os dados estão desatualizados ou de origem embutida.</p>

<div class="callout canon">
  No modo simulado, o look-through roda sobre a carteira <em>já com o cenário aplicado</em> — então
  você vê a exposição real <strong>depois</strong> das compras/vendas, inclusive dentro dos ETFs.
</div>
"""

# ── SECTION 8 — PERSISTÊNCIA ──────────────────────────────────────────────────
s8 = f"""
<h2><span class="num">08</span>Persistência — API &amp; Google Sheets</h2>
<p>Os cenários vivem na aba <code>simulacoes</code> do Google Sheets, gravados via service account.
A rota <code>/api/simulacoes</code> expõe três métodos.</p>

<table>
  <tr><th>Método</th><th>Função</th><th>Comportamento</th></tr>
  <tr><td class="k">GET</td><td>Ler cenários</td><td>Agrupa as linhas por <code>cenario</code> e devolve <code>{{ cenarios }}</code></td></tr>
  <tr><td class="k">POST</td><td>Salvar cenário</td><td>Remove linhas antigas do mesmo nome e regrava (upsert por cenário)</td></tr>
  <tr><td class="k">DELETE</td><td>Apagar cenário</td><td>Filtra fora todas as linhas daquele <code>cenario</code></td></tr>
</table>

<h3>Esquema da aba <code>simulacoes</code></h3>
<table>
  <tr><th>Coluna</th><th>Conteúdo</th></tr>
  <tr><td class="k">cenario</td><td>Nome do cenário (agrupador)</td></tr>
  <tr><td class="k">tipo</td><td>compra / venda</td></tr>
  <tr><td class="k">ticker</td><td>Símbolo do ativo</td></tr>
  <tr><td class="k">quantidade</td><td>Quantidade</td></tr>
  <tr><td class="k">preco</td><td>Preço unitário no momento</td></tr>
  <tr><td class="k">moeda</td><td>BRL / USD / EUR / CHF…</td></tr>
  <tr><td class="k">notas</td><td>Observações livres</td></tr>
</table>

<p class="small muted">A aba é criada automaticamente com o cabeçalho na primeira gravação
(<code>ensureTab</code>). A escrita exige <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> com a planilha
compartilhada como Editor.</p>
"""

# ── SECTION 9 — RELAÇÕES & PRINCÍPIOS ─────────────────────────────────────────
s9 = f"""
<h2><span class="num">09</span>Relações com o resto do sistema</h2>
<p>Simulações é uma página de <em>leitura + projeção</em>: consome muitos motores, mas não os
duplica. Tudo que ela mostra como "Atual" é exatamente o que outras páginas mostram.</p>

<table>
  <tr><th>Depende de</th><th>Para quê</th></tr>
  <tr><td class="k">lib/portfolio.ts</td><td>Posições e valor atual da carteira (motor canônico)</td></tr>
  <tr><td class="k">/api/renda-fixa/posicoes</td><td>Renda fixa e caixa (abertas + caixa)</td></tr>
  <tr><td class="k">/api/market/ohlc</td><td>Cotações ao vivo dos tickers simulados</td></tr>
  <tr><td class="k">/api/composicao/resumo</td><td>Look-through dos ETFs</td></tr>
  <tr><td class="k">lib/sectors · gics-sectors</td><td>Taxonomia de setor, moeda e classe (fonte única)</td></tr>
  <tr><td class="k">open.er-api.com</td><td>Câmbio ao vivo multi-moeda</td></tr>
</table>

<div class="callout canon">
  <strong>Regra dura (CANONICO.md).</strong> A página <em>nunca</em> recalcula patrimônio/investido
  por conta própria — reusa o snapshot canônico e apenas projeta o delta das operações por cima.
  É isso que garante que Simulações e Resumo nunca contem histórias diferentes.
</div>

<h3>Resumo em uma frase</h3>
<p style="font-size:10.5pt; color:#fff; border-left:3px solid {PINK}; padding-left:12pt;">
  Simulações pega sua carteira real, deixa você empilhar compras e vendas hipotéticas com cotação
  e câmbio ao vivo, e revela — em sete lentes e com look-through de ETFs — exatamente como sua
  alocação, seu caixa e sua exposição mudariam <em>antes de você apertar qualquer botão de verdade</em>.
</p>
"""

html = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body>{cover}
<div>{s1}{s2}{s3}{s4}{s5}{s6}{s7}{s8}{s9}</div>
</body></html>"""

HTML(string=html).write_pdf(OUT)
print("PDF gerado:", OUT)
