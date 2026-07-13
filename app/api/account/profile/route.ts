import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseForRequest, supabaseAdmin } from "../../../lib/supabase/server";
import { rlDb, rlProfile, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";

// Perfil del usuario (pantalla de Cuenta, 6.17). Lecturas y escrituras SIEMPRE
// sobre la fila propia vía el cliente por-request (RLS: profiles_*_own). El
// admin client se usa únicamente para firmar la URL de la foto (bucket privado;
// el path sale de la fila propia, jamás de input del cliente — sin IDOR).

export const runtime = "nodejs";

const TEMAS = ["azul", "bordo", "negro", "verde", "dorado"] as const;

const Body = z.object({
  nombre: z.string().trim().max(60).optional(),
  apellido: z.string().trim().max(60).optional(),
  apodo: z.string().trim().max(40).optional(),
  universidad: z.string().trim().max(80).optional(),
  carrera: z.string().trim().max(80).optional(),
  temaColor: z.enum(TEMAS).optional(),
}).strict();

const generico = (msg: string, status: number) =>
  NextResponse.json({ ok: false, error: msg }, { status });

const CAMPOS = "nombre,apellido,apodo,universidad,carrera,foto_url,tema_color";

async function firmarFoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin()
    .storage.from("avatars").createSignedUrl(path, 3600);
  if (error) { console.error("profile: signed url falló", error.message); return null; }
  return data.signedUrl;
}

function aPerfil(row: Record<string, unknown>, email: string | null, fotoUrl: string | null) {
  return {
    ok: true,
    perfil: {
      email,
      nombre: row.nombre ?? "",
      apellido: row.apellido ?? "",
      apodo: row.apodo ?? "",
      universidad: row.universidad ?? "",
      carrera: row.carrera ?? "",
      temaColor: row.tema_color ?? "azul",
      fotoUrl,
    },
  };
}

export async function GET(req: Request) {
  const lim = await checkLimit(rlDb, `profile:${clientIp(req)}`, false);
  if (!lim.ok) return tooMany(lim.retryAfter);
  const sb = supabaseForRequest(req);
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) return generico("No autenticado.", 401);

  const { data: row, error } = await sb.from("profiles").select(CAMPOS).eq("id", auth.user.id).single();
  if (error || !row) {
    console.error("profile GET:", error?.message);
    return generico("Algo salió mal.", 500);
  }
  return NextResponse.json(aPerfil(row, auth.user.email ?? null, await firmarFoto(row.foto_url)));
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLim = await checkLimit(rlProfile, `ip:${ip}`, true);
  if (!ipLim.ok) return tooMany(ipLim.retryAfter);

  const sb = supabaseForRequest(req);
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) return generico("No autenticado.", 401);

  const userLim = await checkLimit(rlProfile, `user:${auth.user.id}`, true);
  if (!userLim.ok) return tooMany(userLim.retryAfter);

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return generico("Datos inválidos.", 400); }

  const cambios: Record<string, string> = {};
  if (body.nombre !== undefined) cambios.nombre = body.nombre;
  if (body.apellido !== undefined) cambios.apellido = body.apellido;
  if (body.apodo !== undefined) cambios.apodo = body.apodo;
  if (body.universidad !== undefined) cambios.universidad = body.universidad;
  if (body.carrera !== undefined) cambios.carrera = body.carrera;
  if (body.temaColor !== undefined) cambios.tema_color = body.temaColor;
  if (Object.keys(cambios).length === 0) return generico("Nada para guardar.", 400);

  const { data: row, error } = await sb.from("profiles")
    .update(cambios).eq("id", auth.user.id).select(CAMPOS).single();
  if (error || !row) {
    console.error("profile POST:", error?.message);
    return generico("Algo salió mal.", 500);
  }
  return NextResponse.json(aPerfil(row, auth.user.email ?? null, await firmarFoto(row.foto_url)));
}
