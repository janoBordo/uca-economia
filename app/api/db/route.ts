import { NextResponse } from "next/server";
import { z } from "zod";
import type { AppData, Materia, SemestreArchivado } from "../../lib/types";
import { rlDb, checkLimit, clientIp, tooMany } from "../../lib/ratelimit";
import { supabaseForRequest } from "../../lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Fase 3: /api/db ya NO toca Vercel KV. Sirve y escribe los datos POR USUARIO
// sobre las tablas de Supabase (RLS forzado — el cliente de este request va
// atado a la sesión, la base misma niega filas ajenas). El contrato con el
// cliente sigue siendo AppData (GET trae todo, POST merge parcial), con una
// diferencia de capacidad (3.2.1): el historial de semestres archivados —
// lo único que crece sin límite — solo viaja con ?full=1 (lo pide /semestre).
// Los incrementos de minutos van por el RPC atómico add_minutos (6.13).

export const runtime = "nodejs";

type PatchBody = Partial<AppData> & { _delta?: boolean; _archivar?: { nombre: string } };

// Validación server-side del body (6.4). Ids ahora son uuid (PKs reales de la
// base); examen mantiene el semántico del modelo viejo: "YYYY-MM-DDTHH:MM"
// local sin zona horaria (o vacío = sin fecha).
const EXAMEN_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MateriaSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1).max(100),
  examen: z.string().max(30).refine(v => v === "" || EXAMEN_RE.test(v), "fecha inválida"),
  metaHoras: z.number().min(0).max(10000),
});
const PatchSchema = z
  .object({
    materias: z.array(MateriaSchema).max(50),
    // _delta: incrementos 1..1440 min (mismo rango que el RPC). Sin _delta solo
    // se usa para resetear ({}), pero se acepta reemplazo explícito acotado.
    sesiones: z.record(z.string().uuid(), z.number().int().min(0).max(100000000)),
    preparacion: z.record(z.string().uuid(), z.number().min(0).max(100)),
    planEstudio: z.record(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      z.array(z.string().uuid()).max(32)
    ),
    notas: z.array(z.string().max(144)).max(100),
    _delta: z.boolean(),
    _archivar: z.object({ nombre: z.string().min(1).max(100) }),
  })
  .partial()
  .strict();

const noAuth = () =>
  NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
const fallo = (e: unknown, donde: string) => {
  // Detalle completo al log del server; al cliente solo un mensaje genérico (6.9)
  console.error(`api/db ${donde}:`, e instanceof Error ? e.message : e);
  return NextResponse.json({ ok: false, error: "Algo salió mal." }, { status: 500 });
};

const normExamen = (v: string | null): string => (v ? v.slice(0, 16) : "");

/** Arma el AppData del usuario desde las tablas (todo bajo RLS). */
async function getData(sb: SupabaseClient, full: boolean): Promise<AppData> {
  const [mats, ses, plan, notas, sems] = await Promise.all([
    sb.from("materias")
      .select("id,nombre,examen,meta_horas,preparacion")
      .order("posicion", { ascending: true }).order("created_at", { ascending: true })
      .limit(50),
    sb.from("sesiones_estudio").select("materia_id,minutos").limit(50),
    sb.from("plan_estudio").select("fecha,materia_ids").limit(400),
    sb.from("notas").select("texto").order("posicion", { ascending: true }).limit(100),
    full
      ? sb.from("semestres")
          .select("id,numero,nombre,materias,sesiones,archived_at")
          .order("numero", { ascending: true }).limit(100)
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  const err = mats.error ?? ses.error ?? plan.error ?? notas.error ?? sems.error;
  if (err) throw new Error(err.message);

  const materias: Materia[] = (mats.data ?? []).map(m => ({
    id: m.id, nombre: m.nombre, examen: normExamen(m.examen), metaHoras: Number(m.meta_horas),
  }));
  const sesiones: Record<string, number> = {};
  for (const s of ses.data ?? []) if (s.minutos > 0) sesiones[s.materia_id] = s.minutos;
  const preparacion: Record<string, number> = {};
  for (const m of mats.data ?? []) if (m.preparacion > 0) preparacion[m.id] = m.preparacion;
  const planEstudio: Record<string, string[]> = {};
  for (const p of plan.data ?? []) if (p.materia_ids?.length) planEstudio[p.fecha] = p.materia_ids;
  const semestres: SemestreArchivado[] = ((sems.data ?? []) as {
    id: string; numero: number; nombre: string;
    materias: Materia[]; sesiones: Record<string, number>; archived_at: string;
  }[]).map(s => ({
    id: s.id, numero: s.numero, nombre: s.nombre,
    materias: s.materias ?? [], sesiones: s.sesiones ?? {}, archivedAt: s.archived_at,
  }));

  return {
    materias, sesiones, preparacion, semestres, planEstudio,
    notas: (notas.data ?? []).map(n => n.texto),
  };
}

export async function GET(req: Request) {
  const lim = await checkLimit(rlDb, `get:${clientIp(req)}`, false);
  if (!lim.ok) return tooMany(lim.retryAfter);
  const sb = supabaseForRequest(req);
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) return noAuth();
  try {
    const full = new URL(req.url).searchParams.get("full") === "1";
    return NextResponse.json(await getData(sb, full));
  } catch (e) { return fallo(e, "GET"); }
}

export async function POST(req: Request) {
  const lim = await checkLimit(rlDb, `post:${clientIp(req)}`, false);
  if (!lim.ok) return tooMany(lim.retryAfter);
  const sb = supabaseForRequest(req);
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) return noAuth();
  const userId = auth.user.id;

  let body: PatchBody;
  try {
    const parsed = PatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
    }
    body = parsed.data as PatchBody;
  } catch { return NextResponse.json({ ok: false, error: "Datos inválidos." }, { status: 400 }); }

  try {
    // ── Cerrar semestre: snapshot + limpieza en UNA transacción (RPC) ──
    if (body._archivar) {
      const { error } = await sb.rpc("archivar_semestre", { p_nombre: body._archivar.nombre });
      if (error) throw new Error(error.message);
      // Materias del semestre nuevo (hoy la UI arranca vacío y las cargás vos)
      if (body.materias?.length) await reemplazarMaterias(sb, userId, body.materias);
      const data = await getData(sb, true); // con historial: /semestre lo muestra al toque
      return NextResponse.json({ ok: true, data });
    }

    // ── Merge parcial campo por campo (solo lo que vino en el body) ──
    if (body.materias) await reemplazarMaterias(sb, userId, body.materias);

    if (body.preparacion) {
      const entries = Object.entries(body.preparacion);
      if (entries.length === 0) {
        // reset (Borrar horas y preparación)
        const { error } = await sb.from("materias").update({ preparacion: 0 }).gt("preparacion", 0);
        if (error) throw new Error(error.message);
      } else {
        // agrupado por valor (los sliders mandan el record completo)
        const porValor = new Map<number, string[]>();
        for (const [id, v] of entries) {
          const val = Math.round(v);
          porValor.set(val, [...(porValor.get(val) ?? []), id]);
        }
        for (const [val, ids] of Array.from(porValor.entries())) {
          const { error } = await sb.from("materias").update({ preparacion: val }).in("id", ids);
          if (error) throw new Error(error.message);
        }
      }
    }

    if (body.sesiones) {
      const entries = Object.entries(body.sesiones);
      if (body._delta) {
        // Incremento ATÓMICO por materia (RPC upsert — 6.13; nunca leer-modificar-escribir)
        for (const [materiaId, mins] of entries) {
          if (mins < 1 || mins > 1440) {
            return NextResponse.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
          }
          const { error } = await sb.rpc("add_minutos", { p_materia_id: materiaId, p_delta: mins });
          if (error) throw new Error(error.message);
        }
      } else if (entries.length === 0) {
        // reset (Borrar horas y preparación)
        const { error } = await sb.from("sesiones_estudio").delete().gte("minutos", 0);
        if (error) throw new Error(error.message);
      } else {
        const filas = entries.map(([materia_id, minutos]) => ({ materia_id, user_id: userId, minutos }));
        const { error } = await sb.from("sesiones_estudio").upsert(filas, { onConflict: "materia_id" });
        if (error) throw new Error(error.message);
      }
    }

    if (body.planEstudio) {
      // Reemplazo completo del plan (la UI siempre manda el record entero)
      const { error: delErr } = await sb.from("plan_estudio").delete().gte("fecha", "1970-01-01");
      if (delErr) throw new Error(delErr.message);
      const filas = Object.entries(body.planEstudio)
        .filter(([, ids]) => ids.length > 0)
        .map(([fecha, materia_ids]) => ({ user_id: userId, fecha, materia_ids }));
      if (filas.length) {
        const { error } = await sb.from("plan_estudio").insert(filas);
        if (error) throw new Error(error.message);
      }
    }

    if (body.notas) {
      const { error: delErr } = await sb.from("notas").delete().gte("posicion", 0);
      if (delErr) throw new Error(delErr.message);
      const filas = body.notas
        .filter(t => t.length > 0)
        .map((texto, posicion) => ({ user_id: userId, texto, posicion }));
      if (filas.length) {
        const { error } = await sb.from("notas").insert(filas);
        if (error) throw new Error(error.message);
      }
    }

    // Estado resultante SIN historial de semestres (no cambió acá; el cliente
    // conserva el que ya tiene en cache — menos egress por escritura).
    const data = await getData(sb, false);
    return NextResponse.json({ ok: true, data: { ...data, semestres: undefined } });
  } catch (e) { return fallo(e, "POST"); }
}

/** Reemplaza el set de materias del usuario: upsert de las que vienen (con su
    orden) + borra las que ya no están (cascade limpia sus sesiones). No toca
    la columna preparacion en updates (viaja por su propio campo). */
async function reemplazarMaterias(sb: SupabaseClient, userId: string, materias: Materia[]) {
  const filas = materias.map((m, i) => ({
    id: m.id,
    user_id: userId,
    nombre: m.nombre,
    examen: m.examen === "" ? null : m.examen,
    meta_horas: m.metaHoras,
    posicion: i,
  }));
  if (filas.length) {
    const { error } = await sb.from("materias").upsert(filas, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  const ids = materias.map(m => m.id);
  const q = sb.from("materias").delete();
  const { error } = ids.length
    ? await q.not("id", "in", `(${ids.join(",")})`)
    : await q.gte("posicion", 0);
  if (error) throw new Error(error.message);
}
