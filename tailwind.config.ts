import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1220",
        slate1: "#0F172A",
        slate2: "#334155",
        muted: "#64748B",
        bg: "#F1F5F9",
        surface: "#FFFFFF",
        surface2: "#F8FAFC",
        line: "#E2E8F0",
        linesoft: "#EEF2F7",
        accent: "#06B6D4",
        accentdeep: "#0E7490",
        accentbright: "#22D3EE",
        accentwash: "#ECFEFF",
        verde: "#059669",
        verdewash: "#ECFDF5",
        amarelo: "#D97706",
        amarelowash: "#FFFBEB",
        vermelho: "#DC2626",
        vermelhowash: "#FEF2F2",
        neutro: "#475569",
        neutrowash: "#F1F5F9",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { sm: "6px", DEFAULT: "10px", lg: "14px" },
      boxShadow: { card: "0 1px 2px rgba(15,23,42,.04), 0 14px 34px -20px rgba(15,23,42,.28)" },
    },
  },
  plugins: [],
};
export default config;
