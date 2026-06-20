import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy:  { DEFAULT:"#0B1F4D", deep:"#060F2A", soft:"#1B335F", muted:"#2D4A7A" },
        ocre:  { DEFAULT:"#C9A227", light:"#E0BF4A", dark:"#A07C10" },
        canvas:"#F5F4F0",
      },
      fontFamily: { sans: ["Inter","system-ui","sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
