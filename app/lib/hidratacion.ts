"use client";
import { useEffect, useLayoutEffect } from "react";

/* Efecto que corre ANTES de que el navegador pinte, sin romper el prerender.

   Por qué existe (v10.14): el cache persistente (api.ts / perfil.ts) rehidrata
   datos reales desde localStorage al evaluar el módulo. Si un componente los
   tomara como estado INICIAL (`useState(getCached)`), el primer render del
   cliente no coincidiría con el HTML estático que Next generó en el build —
   React lo detecta como hydration mismatch, tira el HTML del servidor y
   re-renderiza el árbol entero. O sea: el atajo pensado para ir más rápido
   terminaba pagando un render completo de más y llenando la consola de errores.

   La forma correcta es hidratar con lo mismo que mandó el server y adoptar el
   cache en un layout effect: corre después del commit pero ANTES del paint, así
   que el usuario nunca llega a ver el estado vacío y no hay mismatch.
   En el server no existe useLayoutEffect (React avisa), y ahí este efecto no
   tiene nada que hacer — por eso cae a useEffect fuera del navegador. */
export const useEfectoDeHidratacion =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
