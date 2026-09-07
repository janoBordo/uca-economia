"use client";
import type { AppData, Materia, PatchBody } from "./types";
import { DATA_DEFAULT } from "./types";

let cache: AppData | null = null;
let cacheFull = false;     // ¿el cache incluye el historial de semestres? (solo lo pide /semestre)
let lastFetched = 0;
let inFlight: Promise<AppData> | null = null;
let inFlightFull = false;
const TTL = 60000; // ms: dentro de esta ventana, navegar entre páginas sirve del cache (sin pegarle a /api/db).
// 60s (antes 15s): las escrituras propias refrescan el cache al instante igual,
// así que en el mismo dispositivo no cambia nada; solo se alarga la ventana de
// revalidación al navegar → ~3x menos GETs a /api/db por sesión (3.2.1).
const listeners = new Set<() => void>();

/* ── Cache PERSISTENTE (v10.14) ──────────────────────────────────────────────
   El cache de arriba vive en una variable de módulo: se borraba entero en cada
   carga completa de página (F5, abrir la app de cero, volver desde otra pestaña).
   Resultado: la primera pintura era siempre con datos vacíos y el contenido real
   aparecía recién cuando volvía /api/db — o sea, una pantalla de carga.

   Ahora el último AppData conocido se espeja en localStorage y se rehidrata de
   forma SÍNCRONA al cargar el módulo, antes del primer render: la app pinta con
   datos reales en el frame 1 y revalida contra el server en segundo plano
   (stale-while-revalidate). Cuando llega la respuesta, `notify()` actualiza la
   UI sin que haya habido un estado "vacío" en el medio.

   Multiusuario: el espejo se BORRA al entrar (login/registro), al salir y ante
   cualquier 401 — así, en una compu compartida, la sesión siguiente nunca puede
   pintar los datos de la anterior. `lastFetched` arranca en 0 a propósito: lo
   rehidratado se muestra pero se considera vencido, así que siempre se revalida. */
const LS_KEY = "stuniv_db_v1";

function rehidratar() {
  if (typeof window === "undefined") return;
  try {
    // Sesión recién estrenada en este navegador (link de confirmación del mail):
    // lo que haya guardado es de otra cuenta. Se tira antes de pintar nada.
    if (window.location.search.includes("bienvenida=1")) {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem("stuniv_perfil_v1");
      return;
    }
    const crudo = localStorage.getItem(LS_KEY);
    if (!crudo) return;
    const g = JSON.parse(crudo) as { d?: AppData; full?: boolean };
    if (g?.d && Array.isArray(g.d.materias)) { cache = g.d; cacheFull = g.full === true; }
  } catch { /* JSON corrupto o storage bloqueado: se ignora y se pide a la red */ }
}
rehidratar();

function espejar() {
  if (typeof window === "undefined" || !cache) return;
  try { localStorage.setItem(LS_KEY, JSON.stringify({ d: cache, full: cacheFull })); }
  catch { /* quota llena / modo privado: el cache en memoria sigue funcionando */ }
}

/** Borra el cache (memoria + espejo). Se llama al entrar, al salir y ante 401. */
export function limpiarCache() {
  cache = null; cacheFull = false; lastFetched = 0;
  if (typeof window !== "undefined") { try { localStorage.removeItem(LS_KEY); } catch {} }
}

/** ¿Ya hay datos reales para pintar? (false sólo en la primerísima carga). */
export function hayCache(): boolean { return cache !== null; }

// Sesión vencida/cerrada (ej. botón "atrás" después del logout): a /login.
function sinSesion() {
  limpiarCache();
  if (typeof window !== "undefined" && window.location.pathname !== "/login")
    window.location.assign("/login");
}

export function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach(fn => fn()); }
export function getCached(): AppData { return cache ?? DATA_DEFAULT; }

/* El historial de semestres archivados (lo único que crece sin techo) solo
   viaja cuando alguien lo necesita (`full` — lo pide /semestre): menos egress
   por navegación = más usuarios/día dentro del tier gratis (3.2.1). Una vez
   que el cache es "full" se mantiene full para no perder el historial. */
/* ── Pedido ADELANTADO desde el <head> (v10.14) ──────────────────────────────
   El script inline de layout.tsx dispara GET /api/db apenas el navegador
   parsea el HTML, o sea EN PARALELO con la descarga y el parseo del bundle de
   React. Antes el pedido salía recién cuando hidrataba la app: la espera de
   red y la del JavaScript eran una detrás de la otra. Acá se adopta esa
   respuesta ya en vuelo (o ya llegada) en vez de pedir lo mismo de nuevo.
   Es el MISMO request de siempre —mismo endpoint, mismas cookies HttpOnly,
   mismo manejo de 401— sólo que largado antes. */
type Adelantado = { db?: Promise<Response | null>; dbFull?: boolean };
function respuestaAdelantada(pedirFull: boolean): Promise<Response | null> | null {
  if (typeof window === "undefined") return null;
  const pre = (window as unknown as { __stunivPre?: Adelantado }).__stunivPre;
  const p = pre?.db;
  if (!p) return null;
  delete pre!.db;                       // se consume una sola vez
  if (pedirFull && !pre!.dbFull) return null;  // no sirve: se descarta y se pide bien
  return p;
}

export async function fetchData(force = false, opts?: { full?: boolean }): Promise<AppData> {
  const needFull = opts?.full === true;
  const fresco = cache && Date.now() - lastFetched < TTL;
  if (!force && fresco && (!needFull || cacheFull)) return cache!;
  if (!force && inFlight && (!needFull || inFlightFull)) return inFlight; // dedupe
  const pedirFull = needFull || cacheFull;
  inFlightFull = pedirFull;
  // Se consume SIEMPRE (aunque sea un force y no se use): así no queda una
  // respuesta vieja colgada del window esperando a un fetch posterior.
  const adelantada = respuestaAdelantada(pedirFull);
  inFlight = (async () => {
    const r = (!force && await adelantada)
      || await fetch(`/api/db${pedirFull ? "?full=1" : ""}`, { cache: "no-store" });
    if (r.status === 401) { sinSesion(); throw new Error("Sin sesión"); }
    if (!r.ok) throw new Error("Error cargando datos");
    const d: AppData = await r.json();
    cache = d; cacheFull = pedirFull; lastFetched = Date.now(); espejar(); notify(); return d;
  })();
  try { return await inFlight; } finally { inFlight = null; }
}

async function patch(body: PatchBody): Promise<AppData> {
  const r = await fetch("/api/db", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) { sinSesion(); throw new Error("Sin sesión"); }
  if (!r.ok) throw new Error("Error guardando datos");
  const { data } = await r.json();
  if (data) {
    // Las escrituras normales vuelven sin `semestres` (no cambió — se conserva
    // el del cache); cerrar semestre sí lo trae completo.
    const semestres = data.semestres ?? cache?.semestres ?? [];
    if (data.semestres) cacheFull = true;
    cache = { ...data, semestres };
    lastFetched = Date.now(); espejar(); notify();
  }
  return cache as AppData;
}

export async function saveMaterias(m: Materia[])                    { return patch({ materias: m }); }
export async function addMinutos(id: string, mins: number)          { return patch({ sesiones: { [id]: mins }, _delta: true }); }
export async function savePreparacion(p: Record<string, number>)    { return patch({ preparacion: p }); }
export async function resetHoras()                                   { return patch({ sesiones: {}, preparacion: {} }); }
export async function clearPlanEstudio()                             { return patch({ planEstudio: {} }); }
export async function savePlanEstudio(p: Record<string, string[]>)  { return patch({ planEstudio: p }); }
export async function saveNotas(notas: string[])                    { return patch({ notas }); }
export async function archivarSemestre(nombre: string, mats: Materia[]) {
  return patch({ _archivar: { nombre }, materias: mats });
}

/* Una materia puede tener varias fechas de examen (se guardan como filas
   duplicadas con el mismo nombre, ver v10.3.1). Para mostrarla UNA sola vez y
   tomar en cuenta el examen relevante, se agrupa por nombre y se elige por grupo:
   el examen más próximo a FUTURO; si todos están rendidos, el más reciente
   (cuando se cargue uno nuevo a futuro, pasa a mostrarse ese). */
export function materiasEfectivas(materias: Materia[]): Materia[] {
  const now = Date.now();
  const grupos = new Map<string, Materia[]>();
  for (const m of materias) {
    const k = m.nombre.trim().toLowerCase();
    const arr = grupos.get(k);
    if (arr) arr.push(m); else grupos.set(k, [m]);
  }
  const elegir = (ms: Materia[]): Materia => {
    let futuro: { m: Materia; t: number } | null = null;
    let pasado: { m: Materia; t: number } | null = null;
    for (const m of ms) {
      const t = new Date(m.examen).getTime();
      if (isNaN(t)) continue;
      if (t >= now) { if (!futuro || t < futuro.t) futuro = { m, t }; }
      else          { if (!pasado || t > pasado.t) pasado = { m, t }; }
    }
    return (futuro ?? pasado)?.m ?? ms[0];
  };
  return Array.from(grupos.values()).map(elegir);
}

// Ordena por proximidad de examen: primero los FUTUROS (el más próximo arriba),
// después los ya rendidos (el más reciente arriba). Evita el NaN de Infinity-Infinity
// que dejaba el orden original (y hacía caer siempre en la primera materia).
export function materiasPorProximidad(data: AppData): Materia[] {
  const now = Date.now();
  return [...data.materias].sort((a, b) => {
    const da = new Date(a.examen).getTime();
    const db = new Date(b.examen).getTime();
    const fa = da >= now, fb = db >= now;
    if (fa && fb) return da - db;   // ambos futuros → el más próximo primero
    if (fa !== fb) return fa ? -1 : 1;  // el futuro va antes que el pasado
    return db - da;                // ambos pasados → el más reciente primero
  });
}
