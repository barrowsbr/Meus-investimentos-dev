import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Barroots Terminal (tema âmbar). O chrome e os componentes
        // migrados usam as CSS vars (--bg/--panel/--line/...) e trocam de tema;
        // estas constantes alinham as classes utilitárias legadas ao mesmo visual.
        bg: "#08080A",
        card: "#0D0E12",
        "card-hover": "#11131A",
        border: "#1E2027",
        accent: "#E8A33D",
        "accent-light": "#F0B860",
        positive: "#3FB950",
        negative: "#F0504A",
        info: "#5BA8FF",
        warning: "#E8A33D",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // terminal = cantos retos; neutraliza rounded-* das páginas legadas.
        // `full` permanece para pontos/indicadores circulares.
        DEFAULT: "0px", sm: "0px", md: "0px",
        lg: "0px", xl: "0px", "2xl": "0px", "3xl": "0px", full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
