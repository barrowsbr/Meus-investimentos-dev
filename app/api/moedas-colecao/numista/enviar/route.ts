// Envia um LOTE de moedas CASADAS para a coleção do dono no Numista.
// Regra das repetidas (decisão do dono, 18/07): 1 exemplar GUARDADO +
// (qtd−1) marcados PARA TROCA (itens separados). Cada item criado é
// registrado na aba `numista_envio` — é o mapa que permite desfazer em lote.
// Só o card de Configurações chama, e só após o dry-run.

import { NextRequest, NextResponse } from "next/server";
import { tokenColecao, adicionarItem, numistaAtivo } from "@/lib/numista";
import { ensureTab, appendRowsTyped } from "@/lib/gsheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TAB = "numista_envio";
const HEADERS = ["data", "idx", "denominacao", "ano", "pais", "type_id", "item_id", "papel", "qtd"];

interface ItemEnvio {
  idx: number;
  denominacao: string;
  pais: string;
  ano: string;
  krause: string;
  graduacao: string;
  qtd: number;
  typeId: number;
  issueId: number | null;
}

export async function POST(req: NextRequest) {
  if (!numistaAtivo()) return NextResponse.json({ error: "NUMISTA_API_KEY não configurada" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { itens?: ItemEnvio[] } | null;
  const itens = (body?.itens ?? []).filter((i) => Number.isFinite(i.typeId) && i.qtd > 0).slice(0, 8);
  if (itens.length === 0) return NextResponse.json({ error: "nenhum item válido" }, { status: 400 });

  const auth = await tokenColecao();
  if ("erro" in auth) return NextResponse.json({ error: auth.erro }, { status: 502 });

  await ensureTab(TAB, HEADERS);
  const agora = new Date().toISOString().slice(0, 16).replace("T", " ");
  const linhas: (string | number)[][] = [];
  const erros: string[] = [];
  let criados = 0;

  for (const it of itens) {
    const comentarioBase = `Meus Investimentos · ${it.krause || "sem KM#"} · ${it.graduacao || "s/ grad."}`;
    // 1 exemplar guardado…
    const guarda = await adicionarItem(auth.token, auth.userId, {
      typeId: it.typeId, issueId: it.issueId, quantidade: 1,
      graduacao: it.graduacao, paraTroca: false, comentario: comentarioBase,
    });
    if ("erro" in guarda) { erros.push(`${it.denominacao} ${it.ano}: ${guarda.erro}`); continue; }
    criados++;
    linhas.push([agora, it.idx, it.denominacao, it.ano, it.pais, it.typeId, guarda.itemId, "guarda", 1]);

    // …e as repetidas marcadas PARA TROCA.
    if (it.qtd > 1) {
      const troca = await adicionarItem(auth.token, auth.userId, {
        typeId: it.typeId, issueId: it.issueId, quantidade: it.qtd - 1,
        graduacao: it.graduacao, paraTroca: true, comentario: `${comentarioBase} · disponível para troca`,
      });
      if ("erro" in troca) erros.push(`${it.denominacao} ${it.ano} (troca): ${troca.erro}`);
      else { criados++; linhas.push([agora, it.idx, it.denominacao, it.ano, it.pais, it.typeId, troca.itemId, "troca", it.qtd - 1]); }
    }
  }

  if (linhas.length > 0) await appendRowsTyped(TAB, linhas);

  return NextResponse.json({ criados, registrados: linhas.length, erros });
}
