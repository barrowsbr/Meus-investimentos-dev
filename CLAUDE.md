# Meus Investimentos — Guia de Design e UX

Projeto Streamlit com tema dark + glassmorphism e acentos quentes (bege/creme).
Todas as páginas ficam em `dash/Dash/` (Home.py) e `dash/Dash/pages/`.

---

## Linguagem Visual

**Filosofia central:**
- Dark slate como base, acentos em tons bege/creme quentes
- Glassmorphism como linguagem visual principal (backdrop-filter em tudo)
- Cores sempre em `rgba()` — nunca hex sólido em backgrounds
- Micro-interações: hover eleva, escurece fundo, revela seta
- Verde `#34d399` = positivo, Vermelho `#f87171` = negativo, Ciano `#06b6d4` = ao vivo/ativo, Índigo `#6366f1` = foco/destaque

---

## Paleta de Cores

### Backgrounds
```
Dark slate principal:  rgba(15, 23, 42, 0.6)    → cards base
Dark slate hover:      rgba(15, 23, 42, 0.75)   → cards hover
Dark slate forte:      rgba(15, 23, 42, 0.8)    → metrics card
Dark slate máximo:     rgba(15, 23, 42, 0.95)   → metrics hover
Radar:                 rgba(8, 13, 26, 0.82)
Expander Streamlit:    rgba(10, 18, 35, 0.4)
```

### Acentos Quentes (por card/seção)
```
Patrimônio:   rgba(245, 222, 179, ...)   → bege dourado (#f5deb3)
Finanças:     rgba(222, 184, 135, ...)   → tan dourado (#deb887)
Performance:  rgba(250, 240, 230, ...)   → creme claro (#faf0e6)
Legado:       rgba(255, 228, 196, ...)   → bisque (#ffe4c4)
Editor:       rgba(240, 230, 220, ...)   → bege acinzentado (#f0e6dc)
Notícias:     rgba(6, 182, 212, ...)     → ciano (#06b6d4)
```

### Texto
```
Principal:    #ffffff / #f1f5f9
Secundário:   #94a3b8
Terciário:    #64748b / #475569
```

### Semânticas
```
Positivo:  #34d399
Negativo:  #f87171
Ciano:     #06b6d4, #22d3ee
Índigo:    #6366f1, #818cf8
Roxo:      #a78bfa
Laranja:   #fb923c
```

---

## Glassmorphism

Sempre incluir `-webkit-backdrop-filter` junto com `backdrop-filter`.

```css
/* Padrão de card */
background: rgba(15, 23, 42, 0.6);
backdrop-filter: blur(16px);
-webkit-backdrop-filter: blur(16px);
border: 1px solid transparent;  /* borda via ::before */
border-radius: 20px;
```

**Níveis de blur por componente:**
- `blur(12px)` — metrics card, elementos menores
- `blur(16px)` — nav-card, expandable-card, ticker, radar-card
- `blur(18px)` — expanders Streamlit nas páginas internas

---

## Tipografia

**Fonte:** `'Outfit', sans-serif` (Google Fonts)

| Elemento         | Tamanho  | Peso | Letter-spacing |
|------------------|----------|------|----------------|
| Hero title       | 7.2rem   | 800  | 6px            |
| Hero subtitle    | 1.5rem   | 500  | 3px            |
| Card title       | 1.5rem   | 600  | 2px            |
| Card desc        | 0.85rem  | 400  | 1px            |
| Badge/label      | 0.75rem  | 600  | 1px            |
| Micro dado       | 0.57rem  | 800  | 2px            |

**Mobile (`max-width: 768px`):**
- Hero title: 2.8rem, letter-spacing: 2px
- Card title: 1.2rem
- Card desc: 0.75rem

> Compensar letter-spacing com `margin-right: -Xpx` quando centralizado (evita desvio visual).

---

## Espaçamentos e Layout

**Border-radius:**
- `20px` — cards principais (nav-card, expandable-card, metrics, radar)
- `16px` — ticker, expanders Streamlit
- `12px` — sub-items, badges médios
- `8px` — icon boxes
- `5px` — pills/badges pequenos
- `50%` — avatares, dots

**Padding de cards:**
- Grande: `25px 40px` (metrics-card)
- Padrão: `18px 30px` (nav-card, expandable-card)
- Médio: `20px 30px`, `16px`
- Compacto: `12px 20px`

**Gaps:**
- Seção: `40px`
- Cards: `14px` (coluna home)
- Sub-items: `10px`
- Ícone+texto: `8px`

---

## Sombras

```css
/* Card base */
box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);

/* Hover com acento temático — exemplo Editor */
box-shadow: 0 20px 50px -10px rgba(240, 230, 220, 0.2);

/* Metrics hover com índigo */
box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25), inset 0 0 30px rgba(255,255,255,0.05);

/* Radar */
box-shadow: 0 14px 48px -10px rgba(0, 0, 0, 0.55);
```

**Sombras de hover por seção:**
```
Patrimônio:  0 20px 50px -10px rgba(245, 222, 179, 0.2)
Finanças:    0 20px 50px -10px rgba(222, 184, 135, 0.2)
Performance: 0 20px 50px -10px rgba(250, 240, 230, 0.2)
Legado:      0 20px 50px -10px rgba(255, 228, 196, 0.2)
Editor:      0 20px 50px -10px rgba(240, 230, 220, 0.2)
Notícias:    0 20px 50px -10px rgba(6, 182, 212, 0.2)
```

---

## Gradientes

**Borda de card via `::before` (padrão base):**
```css
background: linear-gradient(135deg,
    rgba(255,255,255,0.1) 0%,
    rgba(255,255,255,0.05) 50%,
    rgba(255,255,255,0.1) 100%
);
-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
mask-composite: exclude;
```

**Hover no `::before` por seção:**
```
Editor:  linear-gradient(135deg, rgba(240,230,220,0.4) 0%, rgba(200,190,180,0.2) 100%)
Notícias: linear-gradient(135deg, rgba(6,182,212,0.4) 0%, rgba(8,145,178,0.2) 100%)
```

**Borda esquerda de sub-item (hover):**
```css
background: linear-gradient(to bottom,
    rgba(245, 222, 179, 0.6),
    rgba(210, 180, 140, 0.3)
);
```

---

## Animações e Transições

**Easing padrão:** `cubic-bezier(0.4, 0, 0.2, 1)`

**Durações:**
- `0.4s` — transforms principais (card hover, max-height)
- `0.3s` — interações padrão (opacity, cor)
- `0.25s` — sub-items, ícones
- `0.55s` — preenchimento de barras

**Keyframes relevantes:**
```css
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
}

@keyframes skeletonPulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0.8; }
}

@keyframes pulseDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.35; transform: scale(0.65); }
}
```

---

## Tipos de Card

### nav-card — Navegação Direta
Usado quando clicar deve navegar para uma página sem expandir.
```html
<a href="NomePagina" target="_self" class="nav-card card-[tema]">
    <div class="card-title"><i class="card-icon">[símbolo]</i> Título</div>
    <div class="card-desc">Descrição curta</div>
    <span class="card-arrow">→</span>
</a>
```
- `card-arrow` aparece deslizando da esquerda no hover (opacity 0→1, translateX -10px→0)
- **Preferência UX:** usar `nav-card` por padrão. Só usar `expandable-card` quando houver múltiplos destinos realmente distintos que justifiquem.

### expandable-card — Expansão com Sub-itens
Usado apenas quando há múltiplos destinos distintos (ex: abas diferentes).
```html
<div class="expandable-wrapper">
    <input type="checkbox" id="[id]-toggle" class="expand-toggle [id]-toggle">
    <div class="expandable-card card-[tema]-exp">
        <label for="[id]-toggle" class="expandable-header">
            <div class="card-title"><i class="card-icon">[símbolo]</i> Título</div>
            <div class="card-desc">Descrição</div>
            <span class="expand-icon">▼</span>
        </label>
        <div class="expandable-content">
            <div class="divider-line"></div>
            <div class="sub-items">
                <a href="Pagina?tab=0" target="_self" class="sub-item">
                    <span class="sub-item-icon">[emoji/svg]</span>
                    <span class="sub-item-text">Nome</span>
                    <span class="sub-item-arrow">→</span>
                </a>
            </div>
        </div>
    </div>
</div>
```

---

## Símbolos/Ícones por Seção

| Seção       | Símbolo |
|-------------|---------|
| Composição  | `◈`     |
| Finanças    | `◆`     |
| Editor      | `▣`     |
| Notícias    | `◉`     |
| Seta (card) | `→`     |
| Expandir    | `▼`     |

---

## Padrões Streamlit (Overrides CSS)

```css
/* Input fields */
border-radius: 10px !important;
background: rgba(15, 23, 42, 0.5) !important;
border: 1px solid rgba(255,255,255,0.08) !important;

/* Focus */
border-color: rgba(99,102,241,0.4) !important;
box-shadow: 0 0 0 2px rgba(99,102,241,0.1) !important;

/* Expanders */
background: rgba(10, 18, 35, 0.4) !important;
backdrop-filter: blur(18px) !important;
border: 1px solid rgba(99, 102, 241, 0.08) !important;
border-radius: 16px !important;
```

---

## Decisões UX Registradas

- **Cards de navegação única** devem ser `nav-card` com link direto — sem expandir.
- **Expandable** apenas quando há 2+ destinos funcionalmente distintos (ex: abas diferentes da mesma página).
- Hover em cards sempre combina: elevação (`translateY`), escurecimento de fundo, sombra colorida temática e revelação da seta.
- Sub-items usam `translateX(4px)` + borda esquerda gradiente no hover.
- Ticker tape tem duração dinâmica: `max(18, len(items) * 4)` segundos.
- Cores semânticas (verde/vermelho) nunca usadas como acento decorativo — apenas para dados financeiros.
