import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd2ff",
          300: "#8eb4ff",
          400: "#598bff",
          500: "#3563f5",
          600: "#2247d9",
          700: "#1c39ae",
          800: "#1d338a",
          900: "#1d306f",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
