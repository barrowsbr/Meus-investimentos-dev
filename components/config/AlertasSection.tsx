"use client";

// Extraído de app/configuracoes/page.tsx — seção "Alertas (Telegram)"
// (DARF, DIRPF, alavancagem e resumo do dia em imagem).

import { useState, useEffect } from "react";
import {
  AlertCircle, CheckCircle2, XCircle, Shield, Check,
  Eye, EyeOff, Loader2, Bell,
} from "lucide-react";
import { API_URL, ToggleRow } from "@/components/config/shared";

// ── Alertas (Telegram) ───────────────────────────────────────────────────────

interface AlertasConfigResp {
  chatId: string;
  limiteAlavancagemPct: number;
  ativo: boolean;
  darfAtivo: boolean;
  dirpfAtivo: boolean;
  alavancagemAtivo: boolean;
  resumoAtivo: boolean;
  resumoHorarios: number[];
  tokenConfigured: boolean;
  tokenSource: "env" | "config" | "none";
}

export default function AlertasSection() {
  const [loading, setLoading] = useState(true);
  const [chatId, setChatId] = useState("");
  const [limite, setLimite] = useState(30);
  const [ativo, setAtivo] = useState(true);
  const [darfAtivo, setDarfAtivo] = useState(true);
  const [dirpfAtivo, setDirpfAtivo] = useState(true);
  const [alavancagemAtivo, setAlavancagemAtivo] = useState(true);
  const [resumoAtivo, setResumoAtivo] = useState(true);
  const [resumoHorarios, setResumoHorarios] = useState<number[]>([18]);
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [tokenSource, setTokenSource] = useState<"env" | "config" | "none">("none");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestMsg, setDigestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/alertas/config`)
      .then(r => r.json())
      .then((d: AlertasConfigResp) => {
        setChatId(d.chatId ?? "");
        setLimite(d.limiteAlavancagemPct ?? 30);
        setAtivo(d.ativo ?? true);
        setDarfAtivo(d.darfAtivo ?? true);
        setDirpfAtivo(d.dirpfAtivo ?? true);
        setAlavancagemAtivo(d.alavancagemAtivo ?? true);
        setResumoAtivo(d.resumoAtivo ?? true);
        setResumoHorarios(Array.isArray(d.resumoHorarios) && d.resumoHorarios.length > 0 ? d.resumoHorarios : [18]);
        setTokenConfigured(d.tokenConfigured ?? false);
        setTokenSource(d.tokenSource ?? "none");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/alertas/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, botToken, limiteAlavancagemPct: limite, ativo, darfAtivo, dirpfAtivo, alavancagemAtivo, resumoAtivo, resumoHorarios }),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg({ ok: true, text: "Configuração salva" });
        if (botToken.trim()) { setTokenConfigured(true); setTokenSource(s => s === "env" ? "env" : "config"); setBotToken(""); }
      } else setMsg({ ok: false, text: data.error || "Erro ao salvar" });
    } catch {
      setMsg({ ok: false, text: "Erro de conexão" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/alertas/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) setTestMsg({ ok: true, text: "Mensagem de teste enviada — confira o Telegram" });
      else setTestMsg({ ok: false, text: data.error || "Erro ao enviar" });
    } catch {
      setTestMsg({ ok: false, text: "Erro de conexão" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSendDigest() {
    setSendingDigest(true);
    setDigestMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/digest/send`, { method: "POST" });
      const data = await res.json();
      if (data.ok) setDigestMsg({ ok: true, text: "Resumo enviado — confira o Telegram" });
      else setDigestMsg({ ok: false, text: data.error || "Erro ao enviar" });
    } catch {
      setDigestMsg({ ok: false, text: "Erro de conexão" });
    } finally {
      setSendingDigest(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
        <Loader2 size={14} className="animate-spin" /> Carregando configuração…
      </div>
    );
  }

  const inputCls = "w-full px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)] bg-zinc-800/50 border border-zinc-700 text-zinc-200 font-mono";

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Alertas <strong className="text-zinc-400">determinísticos</strong> via Telegram — sem monitorar preço em tempo real:
        DARF a vencer/vencido, prazo da DIRPF e alavancagem acima do limite. Roda 1x/dia via cron.
      </p>

      {!tokenConfigured && (
        <div className="rounded-lg p-3 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Token do bot ainda não configurado — cole o token abaixo e salve, <strong>ou</strong> defina a env var{" "}
            <code className="bg-zinc-800 px-1 rounded">TELEGRAM_BOT_TOKEN</code> na Vercel. Sem token, o bot não envia nada.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">Chat ID do Telegram</label>
          <input
            type="text" value={chatId} onChange={e => setChatId(e.target.value)}
            placeholder="ex: 1737564761" className={inputCls}
          />
          <p className="text-[10px] text-zinc-600 mt-1">
            É o SEU id de usuário (não o do bot). Pegue em <code className="bg-zinc-800 px-1 rounded">/getUpdates</code> depois de mandar uma mensagem pro bot.
          </p>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
            Token do bot {tokenSource === "env" ? <span className="text-emerald-400/70 normal-case">· via env var</span> : tokenConfigured ? <span className="text-emerald-400/70 normal-case">· salvo</span> : null}
          </label>
          <div className="relative flex items-center">
            <input
              type={showToken ? "text" : "password"}
              value={botToken} onChange={e => setBotToken(e.target.value)}
              placeholder={tokenConfigured ? "•••••••• (deixe em branco p/ manter)" : "123456:AA..."}
              className={inputCls}
              disabled={tokenSource === "env"}
            />
            <button type="button" onClick={() => setShowToken(s => !s)} className="absolute right-2 text-zinc-500 hover:text-zinc-300">
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">
            {tokenSource === "env"
              ? "Definido na env var da Vercel (tem prioridade sobre o salvo aqui)."
              : "Salvo na planilha e nunca reenviado pro navegador. A planilha é compartilhada como leitor — trate como sensível."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">Limite de alavancagem (%)</label>
          <input
            type="number" value={limite} onChange={e => setLimite(Number(e.target.value))}
            min={0} max={100} step={1} className={inputCls}
          />
        </div>
      </div>

      <ToggleRow
        title="Alertas ativos (chave geral)"
        desc="Desligado: o cron avalia, mas não envia mensagem nenhuma — desativa todos os avisos abaixo."
        on={ativo}
        onToggle={() => setAtivo(a => !a)}
      />

      {/* O que enviar — liga/desliga cada tipo de aviso individualmente */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/20 p-3 space-y-2.5">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Bell size={12} /> O que enviar
        </p>
        <ToggleRow
          title="DARF (imposto sobre vendas)"
          desc="Aviso de DARF a vencer (≤3 dias) e de DARF vencido enquanto não regularizado."
          on={darfAtivo}
          onToggle={() => setDarfAtivo(v => !v)}
          disabled={!ativo}
        />
        <ToggleRow
          title="DIRPF (declaração anual)"
          desc="Lembrete do prazo (31/05): semanal a partir de abril, diário na última semana e aviso de atraso em junho."
          on={dirpfAtivo}
          onToggle={() => setDirpfAtivo(v => !v)}
          disabled={!ativo}
        />
        <ToggleRow
          title="Alavancagem acima do limite"
          desc={`Aviso quando a alavancagem passar de ${limite}% (limite configurável acima).`}
          on={alavancagemAtivo}
          onToggle={() => setAlavancagemAtivo(v => !v)}
          disabled={!ativo}
        />
      </div>

      {/* Resumo do dia — sub-card próprio: toggle + horários de envio + ações */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/20 p-3 space-y-2.5">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Bell size={12} /> Resumo do dia (imagem)
        </p>
        <ToggleRow
          title="Enviar resumo do dia"
          desc="Card com patrimônio, resultado, mercados, melhores/piores, exposição e proventos — nos horários abaixo."
          on={resumoAtivo}
          onToggle={() => setResumoAtivo(v => !v)}
          disabled={!ativo}
        />

        {/* Horários de envio (fuso de Brasília) — o cron roda de hora em hora e
            envia só nas horas marcadas; salvar aqui já vale, sem deploy. */}
        <div className={`rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 transition-opacity ${(!ativo || !resumoAtivo) ? "opacity-40 pointer-events-none" : ""}`}>
          <p className="text-xs font-semibold text-zinc-200 mb-0.5">Horários de envio</p>
          <p className="text-[10px] text-zinc-600 mb-2">
            Horário de Brasília · {resumoHorarios.length} envio{resumoHorarios.length === 1 ? "" : "s"}/dia
            {resumoHorarios.length > 0 ? ` (${[...resumoHorarios].sort((a, b) => a - b).map(h => `${h}h`).join(", ")})` : ""}
          </p>
          <div className="grid grid-cols-8 sm:grid-cols-12 gap-1">
            {Array.from({ length: 24 }, (_, h) => {
              const on = resumoHorarios.includes(h);
              return (
                <button
                  key={h}
                  onClick={() => setResumoHorarios(prev => on ? prev.filter(x => x !== h) : [...prev, h].sort((a, b) => a - b))}
                  className={`py-1.5 text-[11px] font-mono font-semibold rounded-md border transition-colors ${
                    on
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-zinc-800 bg-zinc-800/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  {h}h
                </button>
              );
            })}
          </div>
          {resumoHorarios.length === 0 && (
            <p className="text-[10px] text-amber-400/80 mt-2">Nenhum horário marcado — o resumo não será enviado.</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSendDigest} disabled={sendingDigest || !chatId}
            className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            {sendingDigest ? "Gerando…" : "Enviar resumo agora"}
          </button>
          <a
            href={`${API_URL}/api/digest/image`} target="_blank" rel="noreferrer"
            className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            Ver imagem
          </a>
          {digestMsg && (
            <span className={`text-xs font-mono flex items-center gap-1 ${digestMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {digestMsg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {digestMsg.text}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider border border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--accent-wash)] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button
          onClick={handleTest} disabled={testing || !chatId}
          className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-40"
          style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
        >
          {testing ? "Enviando…" : "Enviar teste"}
        </button>
        {msg && (
          <span className={`text-xs font-mono flex items-center gap-1 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
            {msg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {msg.text}
          </span>
        )}
        {testMsg && (
          <span className={`text-xs font-mono flex items-center gap-1 ${testMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
            {testMsg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {testMsg.text}
          </span>
        )}
      </div>

      <p className="text-[11px] text-zinc-600 flex items-start gap-1.5">
        <Shield size={12} className="mt-0.5 flex-shrink-0" />
        O token do bot fica só na Vercel (env var, nunca na planilha). O chat_id é salvo na aba{" "}
        <code className="bg-zinc-800 px-1 rounded text-zinc-300">alertas_config</code>.
      </p>
    </div>
  );
}
