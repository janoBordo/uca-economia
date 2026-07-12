"use client";
import { useEffect, useState } from "react";

/* Usuario de la sesión actual, para la UI. Las cookies de sesión son HttpOnly
   (el JS del navegador no puede leerlas — a propósito, 6.7), así que esto se
   resuelve preguntándole a GET /api/auth/me. En rutas protegidas el middleware
   ya garantizó que hay sesión; si igual responde 401, user queda null. */

export type SessionUser = { id: string; email: string | null };

export function useUser() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo) setUser(d?.user ?? null); })
      .catch(() => { if (vivo) setUser(null); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, []);
  return { user, loading };
}
