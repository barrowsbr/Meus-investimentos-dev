"use client";

// ErrorBoundary — isola crashes de um subtree para que ele não derrube o app
// inteiro (tela branca). Sem um boundary, qualquer erro de render em um
// componente (ex.: o globo three.js) desmonta toda a árvore React. Aqui o
// subtree quebrado vira `fallback` (ou some) e o resto do app segue vivo.

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Nome para log (identifica qual área quebrou). */
  label?: string;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
