import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rlSignup, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";
import { supabaseAdmin } from "../../../lib/supabase/server";

// Crear cuenta (6.1). El CAPTCHA lo verifica el propio Supabase Auth (Turnstile
// configurado en el proyecto) — sin captchaToken válido el signup se rechaza.
// La confirmación por email es obligatoria: la cuenta no sirve hasta confirmar.
// El doble campo de email (guardia anti-typo, 6.1) se re-verifica server-side.

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const Body = z.object({
  email: z.string().trim().toLowerCase().min(6).max(255).regex(EMAIL_RE),
  emailConfirm: z.string().trim().toLowerCase().min(6).max(255),
  password: z.string().min(8).max(72),
  captchaToken: z.string().min(1).max(4096),
  // Perfil inicial (se piden en el registro para arrancar con la paleta de la
  // universidad). Opcionales y best-effort: si el perfil no se escribe, el alta
  // igual queda hecha y el usuario los completa después en /cuenta.
  nombre: z.string().trim().max(60).optional(),
  apellido: z.string().trim().max(60).optional(),
  universidad: z.string().trim().max(80).optional(),
  carrera: z.string().trim().max(80).optional(),
});

// Mapeo universidad → tema_color. Espejo server-safe de UNIVERSIDADES en
// app/lib/paleta.ts (ese módulo es "use client") — mantener en sync.
const UNI_PALETA: Record<string, string> = {
  UCA: "azul", UADE: "azul", ITBA: "azul", Austral: "azul", Udesa: "azul", UNC: "azul",
  UAI: "bordo", UCEMA: "bordo", Kennedy: "bordo", UB: "bordo", UNR: "bordo",
  UBA: "negro", UTN: "negro", UP: "negro",
  USAL: "verde", UNLP: "verde", "Siglo 21": "verde",
};

const generico = (msg: string, status: number) =>
  NextResponse.json({ ok: false, error: msg }, { status });

export async function POST(req: Request) {
  const lim = await checkLimit(rlSignup, `ip:${clientIp(req)}`, true);
  if (!lim.ok) return tooMany(lim.retryAfter);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return generico("Datos inválidos.", 400);
  }
  if (body.email !== body.emailConfirm)
    return generico("Los dos emails no coinciden.", 400);

  // Cliente anon descartable: el signup no crea sesión (falta confirmar email).
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await anon.auth.signUp({
    email: body.email,
    password: body.password,
    options: { captchaToken: body.captchaToken },
  });

  if (error) {
    // Con confirmación de email activa, un email ya registrado NO devuelve
    // error (Supabase responde éxito ofuscado) — acá solo llegan fallas reales.
    console.error("auth/signup:", error.code ?? error.message);
    if (error.code === "captcha_failed" || /captcha/i.test(error.message))
      return generico("Falló la verificación anti-bot. Recargá e intentá de nuevo.", 400);
    if (error.code === "weak_password" || error.status === 422)
      return generico("Datos inválidos.", 400);
    if (error.status === 429) return tooMany(60);
    return generico("No se pudo crear la cuenta. Probá de nuevo más tarde.", 500);
  }

  // Cargar el perfil inicial en la fila que creó el trigger on_auth_user_created.
  // Admin (bypasea RLS) porque todavía no hay sesión (falta confirmar el email).
  // Best-effort: un fallo acá no invalida el alta ya hecha.
  const userId = data.user?.id;
  if (userId) {
    const cambios: Record<string, string> = {};
    if (body.nombre) cambios.nombre = body.nombre;
    if (body.apellido) cambios.apellido = body.apellido;
    if (body.universidad) cambios.universidad = body.universidad;
    if (body.carrera) cambios.carrera = body.carrera;
    const pal = body.universidad ? UNI_PALETA[body.universidad] : undefined;
    if (pal) cambios.tema_color = pal;
    if (Object.keys(cambios).length) {
      try {
        const { error: perr } = await supabaseAdmin()
          .from("profiles").update(cambios).eq("id", userId);
        if (perr) console.error("auth/signup perfil:", perr.message);
      } catch (e) {
        console.error("auth/signup perfil:", (e as Error).message);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
