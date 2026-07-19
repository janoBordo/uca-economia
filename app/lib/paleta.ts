"use client";

/* Temas de color por universidad (sección 6.17 de la migración).
   La paleta REAL vive en CSS (globals.css: :root + html[data-palette=…]) y
   Tailwind la consume vía variables. Este módulo solo maneja: el catálogo de
   paletas (swatches espejo del CSS para el selector), el mapeo fijo
   universidad → paleta decidido por Jano, aplicar/leer la paleta activa
   (atributo + espejo localStorage para el anti-flash), y resolver colores
   computados para SVG/charts (donde var() no funciona como atributo). */

import { type Paleta } from "./universidades";

/* El catálogo universidad → paleta vive en universidades.ts (módulo sin
   "use client": también lo usa el server en /api/auth/signup). Acá se
   re-exporta para que las vistas sigan importando todo desde paleta.ts. */
export { UNIVERSIDADES, UNIVERSIDAD_OTRA, paletaSugerida } from "./universidades";
export type { Paleta } from "./universidades";

export const PALETAS: { id: Paleta; label: string; primario: string; acento: string }[] = [
  // primario/acento = espejo de globals.css (solo para swatches del selector)
  { id: "azul",   label: "Azul y Blanco",    primario: "#0B1F4D", acento: "#C9A227" },
  { id: "bordo",  label: "Bordó y Blanco",   primario: "#641B2E", acento: "#C05A6E" },
  { id: "negro",  label: "Negro y Blanco",   primario: "#1A1A1A", acento: "#8C8C8C" },
  { id: "verde",  label: "Verde y Blanco",   primario: "#14532D", acento: "#55A868" },
  { id: "dorado", label: "Dorado y Blanco",  primario: "#7A5C10", acento: "#E3B93B" },
];

export const ES_PALETA = (v: string): v is Paleta => PALETAS.some(p => p.id === v);

/* Logos de universidad (nav). Solo las que Jano pasó; el resto no muestra logo.
   Archivos en public/logos/. La clave es el `nombre` exacto de UNIVERSIDADES. */
const LOGOS: Record<string, string> = {
  UCA:      "/logos/uca.svg",
  UADE:     "/logos/uade.svg",
  Udesa:    "/logos/udesa.svg",
  UB:       "/logos/ub.svg",
  UBA:      "/logos/uba.svg",
  UTN:      "/logos/utn.svg",
  UP:       "/logos/up.svg",
  UNLP:     "/logos/unlp.svg",
  ITBA:     "/logos/itba.svg",
  Austral:  "/logos/austral.svg",
  UAI:      "/logos/uai.svg",
  UCEMA:    "/logos/ucema.svg",
  Kennedy:  "/logos/kennedy.svg",
  USAL:     "/logos/usal.svg",
  UNC:      "/logos/unc.svg",
  UNR:      "/logos/unr.svg",
  "Siglo 21": "/logos/siglo21.svg",
};

export function logoUniversidad(universidad: string): string | null {
  return LOGOS[universidad] ?? null;
}

/** Aplica la paleta al documento y la espeja en localStorage (anti-flash). */
export function aplicarPaleta(p: Paleta) {
  if (typeof document === "undefined") return;
  if (p === "azul") document.documentElement.removeAttribute("data-palette");
  else document.documentElement.setAttribute("data-palette", p);
  try { localStorage.setItem("uca_palette", p); } catch { /* ignore */ }
}

export function paletaActiva(): Paleta {
  if (typeof document === "undefined") return "azul";
  const attr = document.documentElement.getAttribute("data-palette") ?? "azul";
  return ES_PALETA(attr) ? attr : "azul";
}

/** Color de la paleta activa resuelto a CSS, para SVG/charts (Recharts pasa
    fill/stroke como atributo, donde var() no aplica). */
export function rgbVar(
  varName: "--navy-rgb" | "--navy-soft-rgb" | "--ocre-rgb",
  alpha?: number
): string {
  const fallback = varName === "--ocre-rgb" ? "201 162 39" : varName === "--navy-soft-rgb" ? "27 51 95" : "11 31 77";
  const v = typeof window === "undefined"
    ? fallback
    : getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
  return alpha != null ? `rgb(${v} / ${alpha})` : `rgb(${v})`;
}
