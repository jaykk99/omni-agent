import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#0b0d10",
          900: "#111418",
          800: "#171b21",
          700: "#20252d",
          600: "#2b313b",
        },
        accent: {
          500: "#6b5bff",
          400: "#8577ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
