// ─────────────────────────────────────────────────────────────────────────────
// Backfill do histórico FIPE — RODAR NO CONSOLE DO NAVEGADOR, no site oficial.
//
// Por quê: o site da FIPE libera qualquer tabela de referência de graça, mas
// bloqueia IP de datacenter — só navegador residencial passa. Este script roda
// na MESMA ORIGEM do site (sem CORS), varre os meses desde que cada carro
// entrou na tabela e envia tudo para o app de uma vez.
//
// COMO USAR (uma vez só, ~2 min):
//   1. No DESKTOP, abra https://veiculos.fipe.org.br e espere carregar.
//   2. F12 → aba Console.
//   3. Cole este arquivo inteiro e dê Enter.
//   4. Acompanhe o progresso; ao final aparece "FIM" com o resumo por carro.
//   (Se o Chrome bloquear colagem, digite "allow pasting" antes.)
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  const APP = "https://meus-investimentos-dev.vercel.app/api/bens/fipe/importar";
  const CARROS = [
    { nome: "Onix Joy",  codigo: "004473-3", ano: 2020 },
    { nome: "T-Cross",   codigo: "005508-5", ano: 2025 },
  ];
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const fipe = (path, body) =>
    fetch(`https://veiculos.fipe.org.br/api/veiculos/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  const MESN = { janeiro: "01", fevereiro: "02", "março": "03", abril: "04", maio: "05", junho: "06",
                 julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };
  const chaveMes = (m) => {
    const [nome, ano] = String(m).trim().split("/");
    return `${ano}-${MESN[nome.trim().toLowerCase()]}`;
  };
  const parseValor = (s) => Number(String(s).replace(/[^\d,]/g, "").replace(",", "."));

  const refs = await fipe("ConsultarTabelaDeReferencia", {});
  console.log(`${refs.length} tabelas de referência (${refs[refs.length - 1].Mes.trim()} → ${refs[0].Mes.trim()})`);

  for (const carro of CARROS) {
    console.log(`\n═══ ${carro.nome} (${carro.codigo}, ano-modelo ${carro.ano}) ═══`);
    let comb = null;      // descoberto no 1º acerto (1=gasolina/flex, 2=álcool, 3=diesel)
    let faltasSeguidas = 0;
    const pontos = [];
    for (const ref of refs) {   // mais recente → mais antiga
      const combustiveis = comb ? [comb] : [1, 2, 3];
      let achou = false;
      for (const c of combustiveis) {
        const r = await fipe("ConsultarValorComTodosParametros", {
          codigoTabelaReferencia: ref.Codigo, codigoTipoVeiculo: 1,
          anoModelo: carro.ano, codigoTipoCombustivel: c,
          tipoConsulta: "codigo", modeloCodigoExterno: carro.codigo,
        });
        if (r && r.Valor) {
          comb = c; achou = true;
          pontos.push({ mes: chaveMes(r.MesReferencia ?? ref.Mes), mesRef: (r.MesReferencia ?? ref.Mes).trim(), valor: parseValor(r.Valor) });
          console.log(`  ${ref.Mes.trim()}: ${r.Valor}`);
          break;
        }
        await pausa(350);
      }
      // O ano-modelo entra na tabela num mês e fica — 4 meses seguidos sem
      // dado marcam o começo da vida do carro na FIPE; dali para trás é vazio.
      if (achou) faltasSeguidas = 0;
      else if (++faltasSeguidas >= 4) { console.log("  (início da série alcançado)"); break; }
      await pausa(450);
    }

    const res = await fetch(APP, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: carro.codigo, pontos }),
    }).then((r) => r.json());
    console.log(`→ enviado ao app:`, res);
  }
  console.log("\nFIM — recarregue a página Bens do app para ver o histórico completo.");
})();
