// ─────────────────────────────────────────────────────────────────────────────
// Tema canônico para tooltips de gráficos (Recharts).
//
// O Recharts, por padrão, pinta o label do tooltip em cinza-escuro e os itens
// com a cor da série (ou PRETO quando a série usa <Cell>). Em tema dark isso
// fica ilegível. Todo <Tooltip> com contentStyle escuro DEVE receber também:
//   itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
// ─────────────────────────────────────────────────────────────────────────────

export const TOOLTIP_ITEM_STYLE = { color: "#e4e4e7" } as const;

export const TOOLTIP_LABEL_STYLE = { color: "#a1a1aa", fontWeight: 600 } as const;
