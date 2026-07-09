"use client";
import type { AppData, Materia } from "./types";
import { DATA_DEFAULT } from "./types";

type PatchBody = Partial<AppData> & { _delta?: boolean; _archivar?: { nombre: string } };

let cache: AppData | null = null;
let lastFetched = 0;
let inFlight: Promise<AppData> | null = null;
const TTL = 15000; // ms: dentro de esta ventana, navegar entre páginas sirve del cache (sin pegarle a /api/db)
const listeners = new Set<() => void>();

export function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach(fn => fn()); }
export function getCached(): AppData { return cache ?? DATA_DEFAULT; }

export async function fetchData(force = false): Promise<AppData> {
  if (!force && cache && Date.now() - lastFetched < TTL) return cache;
  if (!force && inFlight) return inFlight;          // dedupe: un solo request concurrente
  inFlight = (async () => {
    const r = await fetch("/api/db", { cache: "no-store" });
    if (!r.ok) throw new Error("Error cargando datos");
    const d: AppData = await r.json();
    cache = d; lastFetched = Date.now(); notify(); return d;
  })();
  try { return await inFlight; } finally { inFlight = null; }
}

async function patch(body: PatchBody): Promise<AppData> {
  const r = await fetch("/api/db", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Error guardando datos");
  const { data } = await r.json();
  if (data) { cache = data; lastFetched = Date.now(); notify(); }
  return data as AppData;
}

export async function saveMaterias(m: Materia[])                    { return patch({ materias: m }); }
export async function addMinutos(id: string, mins: number)          { return patch({ sesiones: { [id]: mins }, _delta: true }); }
export async function savePreparacion(p: Record<string, number>)    { return patch({ preparacion: p }); }
export async function resetHoras()                                   { return patch({ sesiones: {}, preparacion: {} }); }
export async function clearPlanEstudio()                             { return patch({ planEstudio: {} }); }
export async function savePlanEstudio(p: Record<string, string[]>)  { return patch({ planEstudio: p }); }
export async function saveNotas(notas: string[])                    { return patch({ notas }); }
export async function resetData()                                    { return patch({ sesiones: {}, preparacion: {}, materias: DATA_DEFAULT.materias, planEstudio: {} }); }
export async function archivarSemestre(nombre: string, mats: Materia[]) {
  return patch({ _archivar: { nombre }, materias: mats });
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
