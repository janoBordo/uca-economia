import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rlSignup, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { generico } from "../../../lib/http";
import { passwordValida, PASSWORD_MSG } from "../../../lib/password";

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
  // Política de contraseñas (v10.10): la misma regla que fuerza Supabase Auth
  // (password_required_characters), con mensaje claro desde acá.
  if (!passwordValida(body.password)) return generico(PASSWORD_MSG, 400);

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
    console.error("auth/signup:", error.code ?? error.message);
    if (error.code === "captcha_failed" || /captcha/i.test(error.message))
      return generico("Falló la verificación anti-bot. Recargá e intentá de nuevo.", 400);
    if (error.code === "weak_password" || error.status === 422)
      return generico("Datos inválidos.", 400);
    if (error.status === 429) return tooMany(60);
    return generico("No se pudo crear la cuenta. Probá de nuevo más tarde.", 500);
  }

  // Email YA registrado y confirmado: con confirmación de email activa Supabase
  // responde "éxito" ofuscado pero con `identities: []` (la señal documentada).
  // v10.10 (pedido de Jano): en vez del genérico "revisá tu casilla" —que
  // confundía— se avisa claro. La cuenta existente NUNCA se pisa: signUp no
  // cambia la contraseña de un usuario confirmado. El costo de enumeración es
  // aceptable: CAPTCHA + rate limit 8/h por IP, y es lo que hacen las apps
  // grandes en el registro.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return generico("Ya existe una cuenta con ese email. Iniciá sesión o, si no te acordás la contraseña, recuperala.", 409);
  }

  // Cargar el perfil inicial en la fila que creó el trigger on_auth_user_created.
  // Admin (bypasea RLS) porque todavía no hay sesión (falta confirmar el email).
  // Best-effort: un fallo acá no invalida el alta ya hecha.
  // OJO (v10.10): acá ya NO se setea tema_color — la paleta arranca azul y se
  // personaliza recién adentro de la app (/cuenta), pedido explícito de Jano.
  const userId = data.user?.id;
  if (userId) {
    const cambios: Record<string, string> = {};
    if (body.nombre) cambios.nombre = body.nombre;
    if (body.apellido) cambios.apellido = body.apellido;
    if (body.universidad) cambios.universidad = body.universidad;
    if (body.carrera) cambios.carrera = body.carrera;
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
