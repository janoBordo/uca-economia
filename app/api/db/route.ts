import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { z } from "zod";
import type { AppData, SemestreArchivado } from "../../lib/types";
import { DATA_DEFAULT } from "../../lib/types";
import { rlDb, checkLimit, clientIp, tooMany } from "../../lib/ratelimit";

const KEY = "uca_data";
type PatchBody = Partial<AppData> & { _delta?: boolean; _archivar?: { nombre: string } };

// Validación server-side del body (6.4): un dato corrupto o malicioso nunca
// llega a la base. Mismos límites que la UI ya impone por diseño.
const MateriaSchema = z.object({
  id: z.string().min(1).max(60),
  nombre: z.string().min(1).max(100),
  examen: z.string().max(30),
  metaHoras: z.number().min(0).max(10000),
});
const PatchSchema = z
  .object({
    materias: z.array(MateriaSchema).max(50),
    sesiones: z.record(z.string().max(60), z.number().min(0).max(100000000)),
    preparacion: z.record(z.string().max(60), z.number().min(0).max(100)),
    semestres: z
      .array(
        z.object({
          id: z.string().max(60),
          numero: z.number().min(0).max(1000),
          nombre: z.string().max(100),
          materias: z.array(MateriaSchema).max(50),
          sesiones: z.record(z.string().max(60), z.number().min(0).max(100000000)),
          archivedAt: z.string().max(40),
        })
      )
      .max(100),
    planEstudio: z.record(z.string().max(12), z.array(z.string().max(60)).max(32)),
    notas: z.array(z.string().max(144)).max(100),
    _delta: z.boolean(),
    _archivar: z.object({ nombre: z.string().min(1).max(100) }),
  })
  .partial()
  .strict();

async function getData(): Promise<AppData> {
  try {
    const d = await kv.get<AppData>(KEY);
    if (!d) return DATA_DEFAULT;
    return {
      materias:    d.materias    ?? DATA_DEFAULT.materias,
      sesiones:    d.sesiones    ?? {},
      preparacion: d.preparacion ?? {},
      semestres:   d.semestres   ?? [],
      planEstudio: d.planEstudio ?? {},
      notas:       d.notas       ?? [],
    };
  } catch { return DATA_DEFAULT; }
}

export async function GET(req: Request) {
  const lim = await checkLimit(rlDb, `get:${clientIp(req)}`, false);
  if (!lim.ok) return tooMany(lim.retryAfter);
  return NextResponse.json(await getData());
}

export async function POST(req: Request) {
  const lim = await checkLimit(rlDb, `post:${clientIp(req)}`, false);
  if (!lim.ok) return tooMany(lim.retryAfter);
  try {
    const parsed = PatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
    }
    const body = parsed.data as PatchBody;
    const current = await getData();

    if (body._archivar) {
      const numero = current.semestres.length + 1;
      const archivo: SemestreArchivado = {
        id: new Date().toISOString(), numero,
        nombre: body._archivar.nombre,
        materias: current.materias,
        sesiones: current.sesiones,
        archivedAt: new Date().toISOString(),
      };
      const next: AppData = {
        materias:    body.materias ?? DATA_DEFAULT.materias,
        sesiones: {}, preparacion: {},
        semestres:   [...current.semestres, archivo],
        planEstudio: {}, notas: current.notas,
      };
      await kv.set(KEY, next);
      return NextResponse.json({ ok: true, data: next });
    }

    const merged: AppData = {
      materias:    body.materias    ?? current.materias,
      preparacion: body.preparacion ?? current.preparacion,
      sesiones:    { ...current.sesiones },
      semestres:   body.semestres   ?? current.semestres,
      planEstudio: body.planEstudio ?? current.planEstudio,
      notas:       body.notas       ?? current.notas,
    };

    if (body._delta && body.sesiones) {
      for (const [id, mins] of Object.entries(body.sesiones))
        merged.sesiones[id] = (current.sesiones[id] || 0) + (mins as number);
    } else if (body.sesiones !== undefined) {
      merged.sesiones = body.sesiones;
    }

    await kv.set(KEY, merged);
    return NextResponse.json({ ok: true, data: merged });
  } catch (e: unknown) {
    // Detalle completo al log del server; al cliente solo un mensaje genérico (6.9)
    console.error("api/db POST:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "Algo salió mal." }, { status: 500 });
  }
}
