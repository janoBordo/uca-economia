import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import type { AppData, SemestreArchivado } from "../../lib/types";
import { DATA_DEFAULT } from "../../lib/types";

const KEY = "uca_data";
type PatchBody = Partial<AppData> & { _delta?: boolean; _archivar?: { nombre: string } };

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

export async function GET() { return NextResponse.json(await getData()); }

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PatchBody;
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
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
