// Layout do sunburst do Mapa da Carteira — módulo PURO (client-safe, testável).
// A diferença para a versão antiga: os anéis eram 3 donuts INDEPENDENTES (cada
// nível fechava 360° sozinho); aqui a hierarquia é real — o arco do setor vive
// DENTRO do intervalo angular da classe, e o do ativo dentro do setor. O drill
// vira zoom angular: a classe/setor selecionado expande para 360° e os irmãos
// colapsam para span zero (âncora no ponto original — a animação "abre" dali).

export interface NoSunburst {
  name: string;
  value: number;
  pct: number;          // % do portfólio total (vem pronto da página)
  color: string;
  parentName?: string;
}

export interface ArcoAlvo {
  key: string;          // estável entre layouts (p/ animação)
  name: string;
  level: 1 | 2 | 3;
  value: number;
  pct: number;          // % do total
  pctPai: number;       // % dentro do pai
  color: string;
  parentName?: string;
  a1: number;           // ângulo inicial (graus)
  a2: number;           // ângulo final
  agregado?: string[];  // nomes originais quando é um "outros (N)"
}

// Fatia menor que isso (em graus) é ilegível → agrega em "outros" por setor.
const SPAN_MINIMO = 1.4;

interface Intervalo { a1: number; a2: number }

/** Distribui filhos proporcionalmente dentro do intervalo do pai. */
function distribuir(
  filhos: Array<{ value: number }>, intervalo: Intervalo, gapDeg: number,
): Intervalo[] {
  const total = filhos.reduce((s, f) => s + f.value, 0);
  const span = intervalo.a2 - intervalo.a1;
  if (total <= 0 || span <= 0) return filhos.map(() => ({ a1: intervalo.a1, a2: intervalo.a1 }));
  // Gap só quando há espaço — senão as frações somem no vão.
  const gap = filhos.length > 1 && span > gapDeg * filhos.length * 3 ? gapDeg : 0;
  const util = span - gap * filhos.length;
  const out: Intervalo[] = [];
  let a = intervalo.a1 + gap / 2;
  for (const f of filhos) {
    const s = (f.value / total) * util;
    out.push({ a1: a, a2: a + s });
    a += s + gap;
  }
  return out;
}

const meio = (i: Intervalo): Intervalo => {
  const m = (i.a1 + i.a2) / 2;
  return { a1: m, a2: m };
};

/**
 * Layout completo dos 3 anéis para a seleção atual.
 * selClass/selSector controlam o zoom (selecionado → 360°, irmãos → span 0).
 */
export function layoutHierarquico(
  level1: NoSunburst[], level2: NoSunburst[], level3: NoSunburst[],
  selClass: string | null, selSector: string | null,
): ArcoAlvo[] {
  const arcos: ArcoAlvo[] = [];
  const totalGeral = level1.reduce((s, n) => s + n.value, 0);

  // ── Anel 1: classes ──
  const baseL1 = distribuir(level1, { a1: 0, a2: 360 }, 2);
  const intClasse = new Map<string, Intervalo>();
  level1.forEach((c, i) => {
    const alvo = selClass ? (c.name === selClass ? { a1: 0, a2: 360 } : meio(baseL1[i])) : baseL1[i];
    intClasse.set(c.name, alvo);
    arcos.push({
      key: `1:${c.name}`, name: c.name, level: 1, value: c.value, pct: c.pct,
      pctPai: totalGeral > 0 ? (c.value / totalGeral) * 100 : 0,
      color: c.color, a1: alvo.a1, a2: alvo.a2,
    });
  });

  // ── Anel 2: setores DENTRO da classe ──
  const intSetor = new Map<string, Intervalo>();
  const valorClasse = new Map(level1.map(c => [c.name, c.value]));
  for (const [classe, intervalo] of intClasse) {
    const setores = level2.filter(s => s.parentName === classe);
    const zonas = distribuir(setores, intervalo, 0.8);
    setores.forEach((s, i) => {
      let alvo = zonas[i];
      if (selSector) alvo = s.name === selSector ? { a1: 0, a2: 360 } : meio(zonas[i]);
      intSetor.set(s.name, alvo);
      arcos.push({
        key: `2:${s.name}`, name: s.name, level: 2, value: s.value, pct: s.pct,
        pctPai: (valorClasse.get(classe) ?? 0) > 0 ? (s.value / valorClasse.get(classe)!) * 100 : 0,
        color: s.color, parentName: classe, a1: alvo.a1, a2: alvo.a2,
      });
    });
  }

  // ── Anel 3: ativos DENTRO do setor (migalhas viram "outros") ──
  for (const [setor, intervalo] of intSetor) {
    const ativos = level3.filter(a => a.parentName === setor);
    if (ativos.length === 0) continue;
    const totalSetor = ativos.reduce((s, a) => s + a.value, 0);
    const span = intervalo.a2 - intervalo.a1;

    const grandes: NoSunburst[] = [];
    const migalhas: NoSunburst[] = [];
    for (const a of ativos) {
      const spanAtivo = totalSetor > 0 ? (a.value / totalSetor) * span : 0;
      (spanAtivo >= SPAN_MINIMO ? grandes : migalhas).push(a);
    }
    // "outros" só quando agrupa 2+ — 1 migalha sozinha fica com o próprio nome.
    const nos: Array<NoSunburst & { agregado?: string[] }> = [...grandes];
    if (migalhas.length === 1) nos.push(migalhas[0]);
    else if (migalhas.length > 1) {
      const v = migalhas.reduce((s, a) => s + a.value, 0);
      nos.push({
        name: `outros (${migalhas.length})`, value: v,
        pct: migalhas.reduce((s, a) => s + a.pct, 0),
        color: "hsl(220, 8%, 42%)", parentName: setor,
        agregado: migalhas.map(a => a.name),
      });
    }
    nos.sort((x, y) => y.value - x.value);

    const zonas = distribuir(nos, intervalo, 0.4);
    nos.forEach((a, i) => {
      arcos.push({
        key: `3:${setor}:${a.name}`, name: a.name, level: 3, value: a.value, pct: a.pct,
        pctPai: totalSetor > 0 ? (a.value / totalSetor) * 100 : 0,
        color: a.color, parentName: setor, a1: zonas[i].a1, a2: zonas[i].a2,
        agregado: a.agregado,
      });
    });
  }

  return arcos;
}
