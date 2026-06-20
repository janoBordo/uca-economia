"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchData, getCached, subscribe } from "./api";
import type { AppData } from "./types";

export function useData() {
  const [data, setData] = useState<AppData>(getCached);
  const reload = useCallback(() => { fetchData().then(setData).catch(console.error); }, []);
  useEffect(() => {
    reload();
    const unsub = subscribe(() => setData(getCached()));
    return () => { unsub(); };
  }, [reload]);
  return { data, reload };
}
