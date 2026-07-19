/* Catálogo de universidades y su paleta sugerida (sección 6.17).
   Módulo SIN "use client" a propósito: es dato puro y lo importan tanto el
   cliente (selectores de /registro y /cuenta, vía re-export de paleta.ts)
   como el server (/api/auth/signup asigna tema_color al crear el perfil).
   Antes el server tenía un espejo copiado a mano ("mantener en sync") — v10.8
   lo unifica acá para que exista una sola fuente de verdad. */

export type Paleta = "azul" | "bordo" | "negro" | "verde" | "dorado";

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
  { nombre: "UNC",     paleta: "azul"  },
  { nombre: "UNR",     paleta: "bordo" },
  { nombre: "Siglo 21", paleta: "verde" },
];

export const UNIVERSIDAD_OTRA = "Otra";

export function paletaSugerida(universidad: string): Paleta | null {
  return UNIVERSIDADES.find(u => u.nombre === universidad)?.paleta ?? null;
}
