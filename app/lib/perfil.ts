"use client";
import { useEffect, useState } from "react";
import { aplicarPaleta, ES_PALETA, type Paleta } from "./paleta";

/* Perfil del usuario para la UI (pantalla de Cuenta + menú del Nav).
   Mismo patrón que api.ts: cache en memoria por sesión de página + dedupe +
   suscripción. Al llegar el perfil se aplica su paleta (la preferencia de la
   base pisa el espejo localStorage — viaja entre dispositivos, 6.17). */

export type Perfil = {
  email: string | null;
  nombre: string;
  apellido: string;
  apodo: string;
  universidad: string;
  carrera: string;
  temaColor: Paleta;
  fotoUrl: string | null;
};

let cache: Perfil | null = null;
let inFlight: Promise<Perfil | null> | null = null;
const listeners = new Set<() => void>();

function notify() { listeners.forEach(fn => fn()); }
export function suscribirPerfil(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function perfilCacheado(): Perfil | null { return cache; }

function sincronizarPaleta(p: Perfil) {
  if (ES_PALETA(p.temaColor)) aplicarPaleta(p.temaColor);
}

export async function fetchPerfil(force = false): Promise<Perfil | null> {
  if (!force && cache) return cache;
  if (!force && inFlight) return inFlight;
  inFlight = (async () => {
    const r = await fetch("/api/account/profile", { cache: "no-store" });
    if (!r.ok) return null;   // 401 lo maneja el middleware/las páginas
    const d = await r.json();
    if (!d?.perfil) return null;
    cache = d.perfil as Perfil;
    sincronizarPaleta(cache);
    notify();
    return cache;
  })();
  try { return await inFlight; } finally { inFlight = null; }
}

/** Guarda campos del perfil (parcial). Devuelve el perfil actualizado o null. */
export async function guardarPerfil(cambios: Partial<Omit<Perfil, "email" | "fotoUrl">>): Promise<Perfil | null> {
  const r = await fetch("/api/account/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.perfil) return null;
  cache = d.perfil as Perfil;
  sincronizarPaleta(cache);
  notify();
  return cache;
}

/** Sube la foto (bytes ya reducidos por la UI). Devuelve la signed URL o null. */
export async function subirFoto(blob: Blob): Promise<string | null> {
  const r = await fetch("/api/account/avatar", { method: "POST", body: blob });
  if (!r.ok) return null;
  const d = await r.json();
  if (cache && d?.fotoUrl) { cache = { ...cache, fotoUrl: d.fotoUrl }; notify(); }
  return d?.fotoUrl ?? null;
}

export async function quitarFoto(): Promise<boolean> {
  const r = await fetch("/api/account/avatar", { method: "DELETE" });
  if (!r.ok) return false;
  if (cache) { cache = { ...cache, fotoUrl: null }; notify(); }
  return true;
}

export function limpiarPerfilCache() { cache = null; }

export function usePerfil() {
  const [perfil, setPerfil] = useState<Perfil | null>(perfilCacheado);
  const [loading, setLoading] = useState(cache === null);
  useEffect(() => {
    let vivo = true;
    fetchPerfil().then(p => { if (vivo) { setPerfil(p); setLoading(false); } })
      .catch(() => { if (vivo) setLoading(false); });
    const unsub = suscribirPerfil(() => setPerfil(perfilCacheado()));
    return () => { vivo = false; unsub(); };
  }, []);
  return { perfil, loading };
}

/** Iniciales para el avatar sin foto (apodo > nombre+apellido > email). */
export function iniciales(p: Perfil | null): string {
  if (!p) return "·";
  const de = (s: string) => s.trim().charAt(0).toUpperCase();
  if (p.nombre && p.apellido) return de(p.nombre) + de(p.apellido);
  if (p.apodo) return de(p.apodo);
  if (p.nombre) return de(p.nombre);
  if (p.email) return p.email.charAt(0).toUpperCase();
  return "·";
}

/** Nombre corto para mostrar en el Nav. */
export function nombreCorto(p: Perfil | null): string {
  if (!p) return "";
  return p.apodo || p.nombre || (p.email ? p.email.split("@")[0] : "");
}
