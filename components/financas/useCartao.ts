"use client";

// Hook compartilhado dos dados do cartão (/api/financas/cartao) — usado pelas
// abas Gastos e Custos. Cache de MÓDULO (60s) para as duas abas não baterem na
// API em dobro ao alternar; `recarregar` fura o cache.

import { useEffect, useState, useCallback } from "react";

export interface TransCartao {
  chave: string; data: string; valor: number; descricao: string;
  estabelecimento: string; categoria: string; parcela: { n: number; total: number } | null;
}
export interface AssinaturaDet { nome: string; valorMensal: number; ultimaData: string; ocorrencias: number; meses: number }
export interface ParcelamentoDet {
  nome: string; valorParcela: number; totalParcelas: number; parcelaAtual: number;
  restantes: number; valorTotal: number; valorRestante: number; fimPrevisto: string; ultimaData: string;
}
export interface RespCartao {
  transacoes: TransCartao[]; categorias: string[];
  assinaturas: AssinaturaDet[]; parcelamentos: ParcelamentoDet[];
  fechamentoDia?: number | null;
  cobertura?: { de: string; ate: string } | null;
  error?: string;
}

let _cache: { at: number; data: RespCartao } | null = null;
const TTL_MS = 60_000;

export function useCartao() {
  const [cartao, setCartao] = useState<RespCartao | null>(_cache?.data ?? null);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback((forcar: boolean) => {
    if (!forcar && _cache && Date.now() - _cache.at < TTL_MS) { setCartao(_cache.data); return; }
    fetch("/api/financas/cartao")
      .then((r) => r.json())
      .then((d: RespCartao) => {
        if (d.error) throw new Error(d.error);
        _cache = { at: Date.now(), data: d };
        setCartao(d);
        setErro(null);
      })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => { buscar(false); }, [buscar]);

  const recarregar = useCallback(() => buscar(true), [buscar]);
  // Atualização otimista (recategorização) — mantém o cache coerente.
  const atualizar = useCallback((fn: (d: RespCartao) => RespCartao) => {
    setCartao((d) => {
      if (!d) return d;
      const novo = fn(d);
      _cache = { at: _cache?.at ?? Date.now(), data: novo };
      return novo;
    });
  }, []);

  return { cartao, erro, recarregar, atualizar };
}
