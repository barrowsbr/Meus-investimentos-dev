"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Bot, Send, User, Trash2, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Como está minha carteira hoje?",
  "Explique o que é Sharpe Ratio",
  "Qual a diferença entre LCI e LCA?",
  "Como funciona o come-cotas em FIIs?",
  "O que é FIFO no imposto de renda?",
];

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          isUser ? "bg-accent/20" : "bg-indigo-500/20"
        }`}
      >
        {isUser ? (
          <User size={15} className="text-accent" />
        ) : (
          <Bot size={15} className="text-indigo-400" />
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-accent/10 text-zinc-100 rounded-tr-sm"
            : "bg-white/[0.04] text-zinc-200 rounded-tl-sm border border-white/[0.06]"
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

export default function AgenteIAPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const history = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro na API");
      setMessages([...newMessages, { role: "assistant", content: data.response }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setMessages([
        ...newMessages,
        { role: "assistant", content: `⚠️ Erro: ${msg}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <PageHeader
        title="Agente IA"
        description="Assistente financeiro com conhecimento do mercado brasileiro"
      />

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto glass-card p-4 mb-4 flex flex-col gap-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Bot size={32} className="text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="text-zinc-300 font-medium mb-1">Olá! Sou seu assistente financeiro.</p>
              <p className="text-zinc-500 text-sm">Pergunte sobre seu portfólio, tributação, estratégias e mais.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-xs px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07] transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
              <Bot size={15} className="text-indigo-400" />
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="text-indigo-400 animate-spin" />
              <span className="text-zinc-500 text-sm">Pensando…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="glass-card p-3">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte algo sobre seus investimentos… (Enter para enviar)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none resize-none max-h-32 py-2 px-1"
            style={{ lineHeight: "1.5" }}
          />
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="p-2 text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
              title="Limpar conversa"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={16} className="text-white" />
          </button>
        </form>
        <p className="text-zinc-700 text-[10px] mt-2 px-1">
          Shift+Enter para nova linha · Enter para enviar
        </p>
      </div>
    </div>
  );
}
