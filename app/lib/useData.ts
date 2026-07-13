"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchData, getCached, subscribe } from "./api";
import type { AppData } from "./types";

export function useData(opts?: { full?: boolean }) {
  const full = opts?.full === true;
  const [data, setData] = useState<AppData>(getCached);
  const reload = useCallback(() => { fetchData(true, { full }).then(setData).catch(console.error); }, [full]);
  useEffect(() => {
    // Montaje: sirve del cache si está fresco (TTL); sólo pega a la red si hace falta.
    fetchData(false, { full }).then(setData).catch(console.error);
    const unsub = subscribe(() => setData(getCached()));
    return () => { unsub(); };
  }, [full]);
  return { data, reload };
}
