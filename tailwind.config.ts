import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#09090b",
        card: "#18181b",
        "card-hover": "#1f1f23",
        border: "#27272a",
        accent: "#d4a574",
        "accent-light": "#e8c9a0",
        positive: "#4ade80",
        negative: "#f87171",
        info: "#60a5fa",
        warning: "#fbbf24",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
