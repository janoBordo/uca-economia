"use client";

/* Temas de color por universidad (sección 6.17 de la migración).
   La paleta REAL vive en CSS (globals.css: :root + html[data-palette=…]) y
   Tailwind la consume vía variables. Este módulo solo maneja: el catálogo de
   paletas (swatches espejo del CSS para el selector), el mapeo fijo
   universidad → paleta decidido por Jano, aplicar/leer la paleta activa
   (atributo + espejo localStorage para el anti-flash), y resolver colores
   computados para SVG/charts (donde var() no funciona como atributo). */

export type Paleta = "azul" | "bordo" | "negro" | "verde" | "dorado";

export const PALETAS: { id: Paleta; label: string; primario: string; acento: string }[] = [
  // primario/acento = espejo de globals.css (solo para swatches del selector)
  { id: "azul",   label: "Azul y Blanco",    primario: "#0B1F4D", acento: "#C9A227" },
  { id: "bordo",  label: "Bordó y Blanco",   primario: "#641B2E", acento: "#C05A6E" },
  { id: "negro",  label: "Negro y Blanco",   primario: "#1A1A1A", acento: "#8C8C8C" },
  { id: "verde",  label: "Verde y Blanco",   primario: "#14532D", acento: "#55A868" },
  { id: "dorado", label: "Dorado y Blanco",  primario: "#7A5C10", acento: "#E3B93B" },
];

export const ES_PALETA = (v: string): v is Paleta => PALETAS.some(p => p.id === v);

/* Mapeo fijo del documento de migración. "Otra" = texto libre, sin paleta
   automática (se elige a mano). La asignación automática es solo el valor
   sugerido inicial — la paleta siempre se puede cambiar a mano en /cuenta. */
export const UNIVERSIDADES: { nombre: string; paleta: Paleta }[] = [
  { nombre: "UCA",     paleta: "azul"  },
  { nombre: "UADE",    paleta: "azul"  },
  { nombre: "ITBA",    paleta: "azul"  },
  { nombre: "Austral", paleta: "azul"  },
  { nombre: "Udesa",   paleta: "azul"  },
  { nombre: "UAI",     paleta: "bordo" },
  { nombre: "UCEMA",   paleta: "bordo" },
  { nombre: "Kennedy", paleta: "bordo" },
  { nombre: "UB",      paleta: "bordo" },
  { nombre: "UBA",     paleta: "negro" },
  { nombre: "UTN",     paleta: "negro" },
  { nombre: "UP",      paleta: "negro" },
  { nombre: "USAL",    paleta: "verde" },
  { nombre: "UNLP",    paleta: "verde" },
];
export const UNIVERSIDAD_OTRA = "Otra";

export function paletaSugerida(universidad: string): Paleta | null {
  return UNIVERSIDADES.find(u => u.nombre === universidad)?.paleta ?? null;
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
