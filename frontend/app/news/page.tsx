"use client";
import { useState } from "react";
import { useNews } from "@/lib/hooks";

const CATEGORIES = [
  { value: undefined, label: "Todas" },
  { value: "crypto",      label: "Crypto" },
  { value: "macro",       label: "Macro" },
  { value: "geopolitica", label: "Geopolítica" },
  { value: "tech",        label: "Tech/IA" },
];

export default function NewsPage() {
  const [category, setCategory] = useState<string | undefined>(undefined);
  const { data: newsList, loading } = useNews(category);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-50">Notícias</h1>
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              onClick={() => setCategory(c.value)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                category === c.value
                  ? "bg-cyan-500/30 text-cyan-300 font-medium"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !newsList?.length ? (
        <p className="text-slate-500 text-center py-16">Nenhuma notícia encontrada</p>
      ) : (
        <div className="space-y-3">
          {newsList.map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4
                         hover:bg-[#0f1729]/90 hover:border-cyan-500/20 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-slate-100 font-medium leading-snug">{item.title}</h3>
                  {item.summary && (
                    <p className="text-slate-400 text-sm mt-1 line-clamp-2">{item.summary}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-500">{item.source}</span>
                    <span className="text-xs text-slate-600">{item.published}</span>
                    {item.tickers?.map((t) => (
                      <span key={t} className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-slate-600 text-lg mt-0.5">→</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
