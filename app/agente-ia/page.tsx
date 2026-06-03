"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { Bot, Send, User, Trash2, Loader2, Sparkles, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PageHeader from "@/components/PageHeader";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
}

const SUGGESTIONS = [
  "Como está minha alocação hoje? Está equilibrada?",
  "Quais ativos estão rendendo mais e menos?",
  "Me dê uma análise da minha renda fixa",
  "Quanto recebi de proventos e qual meu yield on cost?",
];

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children, ...props }) => (
          <div className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse" {...props}>{children}</table>
          </div>
        ),
        thead: ({ children, ...props }) => (
          <thead className="border-b border-zinc-700" {...props}>{children}</thead>
        ),
        th: ({ children, ...props }) => (
          <th className="px-2 py-1.5 text-left text-[10px] text-zinc-400 font-semibold uppercase tracking-wider" {...props}>{children}</th>
        ),
        td: ({ children, ...props }) => (
          <td className="px-2 py-1.5 text-zinc-300 border-b border-zinc-800/50" {...props}>{children}</td>
        ),
        h1: ({ children, ...props }) => (
          <h1 className="text-base font-bold text-zinc-100 mt-3 mb-1.5" {...props}>{children}</h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className="text-sm font-bold text-zinc-200 mt-3 mb-1" {...props}>{children}</h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 className="text-xs font-bold text-zinc-300 mt-2 mb-1" {...props}>{children}</h3>
        ),
        p: ({ children, ...props }) => (
          <p className="text-sm leading-relaxed mb-1.5" {...props}>{children}</p>
        ),
        ul: ({ children, ...props }) => (
          <ul className="list-disc list-inside space-y-0.5 my-1 text-sm" {...props}>{children}</ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="list-decimal list-inside space-y-0.5 my-1 text-sm" {...props}>{children}</ol>
        ),
        li: ({ children, ...props }) => (
          <li className="text-zinc-300" {...props}>{children}</li>
        ),
        strong: ({ children, ...props }) => (
          <strong className="font-bold text-zinc-100" {...props}>{children}</strong>
        ),
        code: ({ children, className, ...props }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-zinc-900/80 rounded-lg p-3 my-2 overflow-x-auto text-xs border border-zinc-800">
                <code className="text-zinc-300" {...props}>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-zinc-800/60 px-1.5 py-0.5 rounded text-xs text-emerald-400" {...props}>{children}</code>
          );
        },
        blockquote: ({ children, ...props }) => (
          <blockquote className="border-l-2 border-indigo-500/40 pl-3 my-2 text-zinc-400 italic text-sm" {...props}>{children}</blockquote>
        ),
        hr: (props) => (
          <hr className="border-zinc-800 my-3" {...props} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          isUser ? "bg-amber-500/15" : "bg-indigo-500/15"
        }`}
      >
        {isUser ? (
          <User size={15} className="text-amber-400" />
        ) : (
          <Bot size={15} className="text-indigo-400" />
        )}
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-amber-500/8 text-zinc-100 rounded-tr-sm border border-amber-500/10"
            : "bg-white/[0.03] text-zinc-200 rounded-tl-sm border border-white/[0.06]"
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <MarkdownContent content={msg.content} />
        )}
        {msg.model && (
          <p className="text-[9px] text-zinc-600 mt-2 text-right">{msg.model}</p>
        )}
      </div>
    </div>
  );
}

interface ModelStatus {
  model: string;
  label: string;
  provider: string;
  hasKey: boolean;
  cooldown: number;
}

export default function AgenteIAPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingModel, setStreamingModel] = useState("");
  const [modelStatus, setModelStatus] = useState<{ available: number; total: number; models: ModelStatus[] } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamingContent]);

  useEffect(() => {
    fetch(`${API_URL}/api/chat`)
      .then((r) => r.json())
      .then(setModelStatus)
      .catch(() => {});
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setStreamingContent("");
    setStreamingModel("");

    const history = messages.map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history, stream: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || data.detail || "Erro na API");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream reader");

      const decoder = new TextDecoder();
      let fullText = "";
      let modelUsed = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.model) {
              modelUsed = parsed.model;
              setStreamingModel(parsed.model);
            }
            if (parsed.text) {
              fullText += parsed.text;
              setStreamingContent(fullText);
            }
            if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      setMessages([...newMessages, { role: "assistant", content: fullText, model: modelUsed }]);
      setStreamingContent("");
      setStreamingModel("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setMessages([
        ...newMessages,
        { role: "assistant", content: `⚠️ Erro: ${msg}` },
      ]);
      setStreamingContent("");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, loading]);

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
        description="Análise inteligente do seu portfólio com dados em tempo real"
      />

      <div className="flex-1 overflow-y-auto glass-card p-4 mb-4 flex flex-col gap-4 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Sparkles size={28} className="text-indigo-400" />
            </div>
            <div className="text-center max-w-md">
              <p className="text-zinc-200 font-semibold mb-1">Consultor financeiro pessoal</p>
              <p className="text-zinc-500 text-sm mb-6">
                Analiso seu portfólio em tempo real — alocação, rentabilidade, riscos, tributação e mais.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="text-left px-3 py-2.5 rounded-xl text-xs text-zinc-400 hover:text-zinc-200
                      bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] hover:border-white/[0.1]
                      transition-all duration-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {modelStatus && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
                  <Zap size={10} className="text-zinc-600" />
                  <span className="text-[10px] text-zinc-600 mr-1">Modelos:</span>
                  {modelStatus.models.map((m) => (
                    <span
                      key={m.model}
                      className="text-[9px] px-1.5 py-0.5 rounded-full border"
                      style={{
                        background: m.hasKey
                          ? m.cooldown > 0 ? "rgba(251,146,60,0.08)" : "rgba(74,222,128,0.06)"
                          : "rgba(255,255,255,0.02)",
                        borderColor: m.hasKey
                          ? m.cooldown > 0 ? "rgba(251,146,60,0.2)" : "rgba(74,222,128,0.15)"
                          : "rgba(255,255,255,0.05)",
                        color: m.hasKey
                          ? m.cooldown > 0 ? "#fb923c" : "#86efac"
                          : "#52525b",
                      }}
                      title={m.hasKey
                        ? m.cooldown > 0 ? `Cooldown: ${m.cooldown}s` : "Disponível"
                        : `Configure ${m.provider === "gemini" ? "GEMINI_API_KEY" : m.label.includes("GPT") ? "OPENAI_API_KEY" : m.label.includes("Groq") ? "GROQ_API_KEY" : "DEEPSEEK_API_KEY"}`}
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {loading && streamingContent && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
              <Bot size={15} className="text-indigo-400" />
            </div>
            <div className="max-w-[85%] bg-white/[0.03] border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3">
              <MarkdownContent content={streamingContent} />
              {streamingModel && (
                <p className="text-[9px] text-zinc-600 mt-2 text-right">{streamingModel}</p>
              )}
            </div>
          </div>
        )}

        {loading && !streamingContent && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
              <Bot size={15} className="text-indigo-400" />
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="text-indigo-400 animate-spin" />
              <span className="text-zinc-500 text-sm">Analisando seu portfólio…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="glass-card p-3">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre seus investimentos… (Enter para enviar)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none resize-none max-h-32 py-2 px-1"
            style={{ lineHeight: "1.5" }}
          />
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); setStreamingContent(""); }}
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
