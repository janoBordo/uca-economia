import { NextResponse } from "next/server";

/* Respuestas de error compartidas por todas las rutas de API (v10.8 — antes
   cada route definía su copia local de estos helpers).
   Regla 6.9: al cliente SIEMPRE mensajes genéricos sin señal; el detalle real
   va únicamente al log del server. */

/** `{ ok:false, error:msg }` con el status dado. */
export const generico = (msg: string, status: number) =>
  NextResponse.json({ ok: false, error: msg }, { status });

/** 401 uniforme para toda ruta que exige sesión. */
export const noAuth = () => generico("No autenticado.", 401);

/** 500 genérico al cliente + detalle completo al log del server (6.9).
    `donde` identifica la ruta y el verbo en el log (ej. "api/db GET"). */
export const fallo = (e: unknown, donde: string) => {
  console.error(`${donde}:`, e instanceof Error ? e.message : e);
  return generico("Algo salió mal.", 500);
};
