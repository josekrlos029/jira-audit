import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1a1f36", soft: "#5b6478" },
        line: { DEFAULT: "#e4e7ef", strong: "#cfd4e0" },
        brand: { DEFAULT: "#2f54eb", soft: "#eaf0ff", hover: "#1d3fcc" },
        good: { DEFAULT: "#15803d", soft: "#dcfce7" },
        warn: { DEFAULT: "#b45309", soft: "#fef3c7" },
        bad: { DEFAULT: "#b91c1c", soft: "#fee2e2" },
        muted: { DEFAULT: "#6b7280", soft: "#f1f3f8" },
        indigo: { soft: "#e0e7ff" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.04), 0 4px 16px rgba(15,23,42,.04)",
      },
    },
  },
  plugins: [],
};

export default config;
