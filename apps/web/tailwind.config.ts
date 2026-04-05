import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        frame: {
          bg: "#0a0a0a",
          surface: "#141414",
          border: "#262626",
          text: "#e5e5e5",
          muted: "#737373",
          accent: "#3b82f6",
          success: "#22c55e",
          warning: "#eab308",
          error: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};

export default config;
