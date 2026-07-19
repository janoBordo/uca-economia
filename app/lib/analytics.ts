"use client";

/* Google Analytics 4 (v10.6) — helper único para emitir eventos.
   Reglas fijas:
   - Fire-and-forget: si gtag no cargó (adblocker, CSP, red) NUNCA rompe ni
     demora la app — la analítica es observación, jamás dependencia.
   - CERO datos personales: nada de emails, nombres, apodos ni contenido del
     usuario (nombres de materias, notas, textos). Solo nombres de evento y
     números/enums (minutos, modo, paleta). La postura de privacidad y
     seguridad auditada no se toca.
   El script de gtag se carga en app/layout.tsx; el ID de medición vive ahí. */

type Params = Record<string, string | number | boolean>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(evento: string, params?: Params) {
  try {
    window.gtag?.("event", evento, params);
  } catch {
    /* nunca es un error de la app */
  }
}
