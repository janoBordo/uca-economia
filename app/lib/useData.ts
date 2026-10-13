"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { fetchData, getCached, subscribe, cacheConfirmado } from "./api";
import { DATA_DEFAULT } from "./types";

/* `listo` (v10.14): distingue "vacío porque el usuario no cargó nada" de
   "vacío porque todavía no llegó la primera respuesta". Gracias al cache
   persistente de api.ts pasa a true antes del primer paint en cualquier carga
   que no sea la primerísima de la vida del dispositivo — así las pantallas no
   parpadean mostrando un estado vacío que no es real.

   El snapshot del servidor es vacío, igual que el HTML estático. React adopta
   el cache al hidratar. useSyncExternalStore sincroniza las notificaciones con
   el render: cerrar el editor tras guardar ya no adelanta el cambio de datos. */
const getServerSnapshot = () => DATA_DEFAULT;
export function useData(opts?: { full?: boolean }) {
  const full = opts?.full === true;
  const data = useSyncExternalStore(subscribe, getCached, getServerSnapshot);
  const listo = data !== DATA_DEFAULT;
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    setError("");
    fetchData(true, { full })
      .catch(e => { console.error(e); setError("No se pudieron cargar los datos."); });
  }, [full]);

  useEffect(() => {
    // Montaje: sirve del cache si está fresco (TTL); sólo pega a la red si hace falta.
    let activo = true;
    fetchData(false, { full })
      .catch(e => { if (activo) { console.error(e); setError("No se pudieron cargar los datos."); } });
    return () => { activo = false; };
  }, [full]);
  return { data, reload, listo, confirmado: listo && cacheConfirmado(), error };
}
