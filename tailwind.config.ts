import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'Share Tech Mono'", "monospace"],
        display: ["'Orbitron'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
      colors: {
        cyber: {
          green: "#00ff88",
          blue: "#00d4ff",
          purple: "#7c3aed",
          pink: "#ff0080",
          dark: "#020408",
          panel: "#0a0f1a",
          border: "#1a2540",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "scan": "scan 3s linear infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        glow: {
          from: { boxShadow: "0 0 5px #00ff88, 0 0 10px #00ff88" },
          to: { boxShadow: "0 0 20px #00ff88, 0 0 40px #00ff88, 0 0 80px #00ff8840" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
