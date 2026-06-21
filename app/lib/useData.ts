"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchData, getCached, subscribe } from "./api";
import type { AppData } from "./types";

export function useData() {
  const [data, setData] = useState<AppData>(getCached);
  const reload = useCallback(() => { fetchData(true).then(setData).catch(console.error); }, []);
  useEffect(() => {
    // Montaje: sirve del cache si está fresco (TTL); sólo pega a la red si hace falta.
    fetchData().then(setData).catch(console.error);
    const unsub = subscribe(() => setData(getCached()));
    return () => { unsub(); };
  }, []);
  return { data, reload };
}
