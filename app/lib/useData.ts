"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchData, getCached, hayCache, subscribe } from "./api";
import { useEfectoDeHidratacion } from "./hidratacion";
import { DATA_DEFAULT, type AppData } from "./types";

/* `listo` (v10.14): distingue "vacío porque el usuario no cargó nada" de
   "vacío porque todavía no llegó la primera respuesta". Gracias al cache
   persistente de api.ts pasa a true antes del primer paint en cualquier carga
   que no sea la primerísima de la vida del dispositivo — así las pantallas no
   parpadean mostrando un estado vacío que no es real.

   El estado ARRANCA vacío a propósito, igual que el HTML estático que sirve
   Next, y el cache se adopta en un layout effect (ver hidratacion.ts): pintar
   directo desde localStorage rompería la hidratación de React y costaría un
   re-render del árbol entero, justo lo contrario de lo que se busca. */
export function useData(opts?: { full?: boolean }) {
  const full = opts?.full === true;
  const [data, setData] = useState<AppData>(DATA_DEFAULT);
  const [listo, setListo] = useState(false);
  const reload = useCallback(() => {
    fetchData(true, { full }).then(d => { setData(d); setListo(true); }).catch(console.error);
  }, [full]);

  // Antes del paint: si hay datos conocidos de este dispositivo, se pintan ya.
  useEfectoDeHidratacion(() => {
    if (hayCache()) { setData(getCached()); setListo(true); }
  }, []);

  useEffect(() => {
    // Montaje: sirve del cache si está fresco (TTL); sólo pega a la red si hace falta.
    fetchData(false, { full })
      .then(d => { setData(d); setListo(true); })
      .catch(e => { console.error(e); setListo(true); });
    const unsub = subscribe(() => setData(getCached()));
    return () => { unsub(); };
  }, [full]);
  return { data, reload, listo };
}
