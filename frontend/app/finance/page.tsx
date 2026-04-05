"use client";
import { useFinanceOverview, useSubscriptions, useInstallments } from "@/lib/hooks";
import MetricCard from "@/components/ui/MetricCard";
import DataTable from "@/components/ui/DataTable";
import type { Subscription, Installment } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinancePage() {
  const { data: overview, loading }     = useFinanceOverview();
  const { data: subs }                  = useSubscriptions();
  const { data: installments }          = useInstallments();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-50">Finanças Pessoais</h1>

      {/* Totais */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard label="Entradas"         value={overview ? fmt(overview.totais.entradas) : "—"}        loading={loading} />
        <MetricCard label="Saídas"           value={overview ? fmt(overview.totais.saidas) : "—"} />
        <MetricCard label="Cartões"          value={overview ? fmt(overview.totais.cartoes) : "—"} />
        <MetricCard label="Poupança Esperada" value={overview ? fmt(overview.totais.poupanca_esperada) : "—"} />
        <MetricCard
          label="Saldo"
          value={overview ? fmt(overview.totais.saldo) : "—"}
          delta={overview ? (overview.totais.saldo >= 0 ? 0.01 : -0.01) : undefined}
        />
      </div>

      {/* Detalhes por categoria */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: "Entradas",   color: "text-emerald-400", items: overview.entradas },
            { title: "Saídas",     color: "text-red-400",     items: overview.saidas },
            { title: "Cartões",    color: "text-amber-400",   items: overview.cartoes },
          ].map(({ title, color, items }) => (
            <div key={title} className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
              <h3 className={`text-sm font-semibold ${color} mb-3 uppercase tracking-wider`}>{title}</h3>
              {items.map((item) => (
                <div key={item.nome} className="flex justify-between py-1.5 border-b border-white/[0.04]">
                  <span className="text-slate-300 text-sm">{item.nome}</span>
                  <span className="font-medium text-sm">{fmt(item.valor)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 mt-1">
                <span className="text-slate-400 text-xs font-semibold">Total</span>
                <span className={`font-bold text-sm ${color}`}>
                  {fmt(items.reduce((s, i) => s + i.valor, 0))}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assinaturas */}
      {subs && subs.length > 0 && (
        <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Assinaturas Recorrentes</h2>
          <DataTable
            columns={[
              { key: "nome",  header: "Nome",    render: (r: Subscription) => <span className="text-slate-200">{r.nome}</span> },
              { key: "valor", header: "Valor",   align: "right", render: (r: Subscription) => fmt(r.valor) },
              { key: "dia",   header: "Dia",     align: "center" },
              { key: "ativa", header: "Status",  align: "center",
                render: (r: Subscription) => (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.ativa ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                    {r.ativa ? "Ativa" : "Inativa"}
                  </span>
                )},
            ]}
            data={subs as unknown as Record<string, unknown>[]}
          />
          <p className="text-xs text-slate-500 mt-2 text-right">
            Total ativo: {fmt(subs.filter(s => s.ativa).reduce((a, s) => a + s.valor, 0))}
          </p>
        </div>
      )}

      {/* Parcelamentos */}
      {installments && installments.length > 0 && (
        <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Parcelamentos</h2>
          <DataTable
            columns={[
              { key: "nome",        header: "Nome",       render: (r: Installment) => <span className="text-slate-200">{r.nome}</span> },
              { key: "valor_total", header: "Total",      align: "right", render: (r: Installment) => fmt(r.valor_total) },
              { key: "parcelas",    header: "Parcelas",   align: "center" },
              { key: "data_compra", header: "Data Compra" },
            ]}
            data={installments as unknown as Record<string, unknown>[]}
          />
        </div>
      )}
    </div>
  );
}
