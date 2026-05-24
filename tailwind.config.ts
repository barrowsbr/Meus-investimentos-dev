import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0D0E11",
        card: "#13141A",
        "card-hover": "#191B22",
        border: "#1E2028",
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
