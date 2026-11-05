import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0b0d", raised: "#0f0f12", bench: "#1a1a20", line: "#26262f", ink: "#e6e6ec", dim: "#b6b6c2", gray: "#82828f",
        gold: "#f2c230", amber: "#ffc048", blue: "#5b7cfa", sky: "#a8baff", mint: "#35d07f", cream: "#fdfbc8", fur: "#c99762", rose: "#f08fb0",
      },
      fontFamily: { display: ["var(--font-display)", "Arial Narrow", "sans-serif"], data: ["var(--font-data)", "ui-monospace", "monospace"], voice: ["var(--font-voice)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
