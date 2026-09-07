"use client";
import { useEffect, useState } from "react";
import { useEfectoDeHidratacion } from "./hidratacion";
import { aplicarPaleta, ES_PALETA, type Paleta } from "./paleta";
import { limpiarCache } from "./api";

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

/* `ultimaCarga` = cuándo lo confirmó el server. Arranca en 0 a propósito: lo
   que viene del espejo se PINTA al instante pero se considera vencido, así que
   la primera carga de cada pestaña siempre revalida (si no, el perfil
   rehidratado se daba por bueno para siempre y la foto —que no se espeja,
   porque es una URL firmada que caduca— no volvía a aparecer nunca). Pasada
   esa revalidación, el TTL evita repetir el pedido en cada navegación: el
   perfil cambia una vez cada muchos meses, no vale una llamada por pantalla. */
let ultimaCarga = 0;
const TTL_PERFIL = 5 * 60 * 1000;

/* Espejo persistente del perfil (v10.14), mismo criterio que el de api.ts: sin
   él, cada carga completa de página mostraba el avatar y el nombre del Nav
   vacíos hasta que volvía /api/account/profile. Se rehidrata sincrónicamente
   antes del primer render y se revalida en segundo plano.

   `fotoUrl` NO se espeja: es una signed URL que vence a la hora, así que
   guardarla daría una imagen rota. Se pintan las iniciales (que ya son el
   fallback normal) y la foto aparece con la revalidación. */
const LS_PERFIL = "stuniv_perfil_v1";

if (typeof window !== "undefined" && !window.location.search.includes("bienvenida=1")) {
  try {
    const crudo = localStorage.getItem(LS_PERFIL);
    if (crudo) {
      const p = JSON.parse(crudo) as Perfil;
      if (p && typeof p.nombre === "string") cache = { ...p, fotoUrl: null };
    }
  } catch { /* storage bloqueado o JSON corrupto: se pide a la red */ }
}

function espejarPerfil() {
  if (typeof window === "undefined" || !cache) return;
  try { localStorage.setItem(LS_PERFIL, JSON.stringify({ ...cache, fotoUrl: null })); } catch {}
}

function notify() { listeners.forEach(fn => fn()); }
export function suscribirPerfil(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function perfilCacheado(): Perfil | null { return cache; }

function sincronizarPaleta(p: Perfil) {
  if (ES_PALETA(p.temaColor)) aplicarPaleta(p.temaColor);
}

/* Igual que en api.ts: el <head> ya largó GET /api/account/profile en paralelo
   con la descarga del bundle. Acá se adopta esa respuesta en vez de pedir lo
   mismo otra vez. Mismo endpoint, mismas cookies, mismo manejo de error. */
function respuestaAdelantada(): Promise<Response | null> | null {
  if (typeof window === "undefined") return null;
  const pre = (window as unknown as { __stunivPre?: { perfil?: Promise<Response | null> } }).__stunivPre;
  const p = pre?.perfil;
  if (!p) return null;
  delete pre!.perfil;   // se consume una sola vez
  return p;
}

export async function fetchPerfil(force = false): Promise<Perfil | null> {
  const fresco = cache && Date.now() - ultimaCarga < TTL_PERFIL;
  if (!force && fresco) return cache;
  if (!force && inFlight) return inFlight;
  const adelantada = respuestaAdelantada();
  inFlight = (async () => {
    const r = (!force && await adelantada)
      || await fetch("/api/account/profile", { cache: "no-store" });
    // Ante un fallo (401, red, 429) se conserva lo que ya había: sin espejo eso
    // es null —el comportamiento de siempre—, y con espejo el Nav no se vacía
    // por un tropiezo. La sesión muerta la corta /api/db, que sí redirige.
    if (!r.ok) return cache;
    const d = await r.json();
    if (!d?.perfil) return cache;
    cache = d.perfil as Perfil;
    ultimaCarga = Date.now();
    sincronizarPaleta(cache);
    espejarPerfil();
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
  ultimaCarga = Date.now();
  sincronizarPaleta(cache);
  espejarPerfil();
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

/** Corta TODO el estado local de la sesión (perfil + datos, memoria y espejos).
    Se llama al salir y al borrar la cuenta: en una compu compartida, la sesión
    siguiente arranca de cero y nunca puede pintar datos de la anterior. */
export function limpiarPerfilCache() {
  cache = null; ultimaCarga = 0;
  if (typeof window !== "undefined") { try { localStorage.removeItem(LS_PERFIL); } catch {} }
  limpiarCache();
}

export function usePerfil() {
  // Arranca vacío (= lo que sirve el HTML estático) y adopta el espejo en un
  // layout effect: sin mismatch de hidratación y sin que se vea el hueco.
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  useEfectoDeHidratacion(() => {
    if (cache) { setPerfil(cache); setLoading(false); }
  }, []);
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
