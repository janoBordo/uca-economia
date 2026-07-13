import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // navy/ocre salen de las variables de paleta (globals.css :root +
        // html[data-palette=…]) — temas de color por universidad (6.17).
        navy:  {
          DEFAULT:"rgb(var(--navy-rgb) / <alpha-value>)",
          deep:   "rgb(var(--navy-deep-rgb) / <alpha-value>)",
          soft:   "rgb(var(--navy-soft-rgb) / <alpha-value>)",
          muted:  "rgb(var(--navy-muted-rgb) / <alpha-value>)",
        },
        ocre:  {
          DEFAULT:"rgb(var(--ocre-rgb) / <alpha-value>)",
          light:  "rgb(var(--ocre-light-rgb) / <alpha-value>)",
          dark:   "rgb(var(--ocre-dark-rgb) / <alpha-value>)",
        },
        canvas:"#F5F4F0",
      },
      fontFamily: { sans: ["Inter","system-ui","sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
