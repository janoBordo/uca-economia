import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseForRequest, supabaseAdmin } from "../../../lib/supabase/server";
import { rlPassword, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";

// Cambiar contraseña estando logueado (sección 6.16).
// Reglas: exige la contraseña ACTUAL (Supabase no lo fuerza solo), rate limit
// estricto (fuerza bruta), y al confirmar cierra sesión en todos los demás
// dispositivos. Sin UI todavía — la pantalla llega en una fase posterior.
// El front deberá mandar también un token de Turnstile (captchaToken): la
// verificación de la contraseña actual pasa por el login de Supabase, que
// tiene CAPTCHA activo.

export const runtime = "nodejs";

const Body = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
  captchaToken: z.string().max(4096).optional(),
});

const generico = (msg: string, status: number) =>
  NextResponse.json({ ok: false, error: msg }, { status });

export async function POST(req: Request) {
  // Rate limit por IP antes de tocar nada (falla cerrado)
  const ip = clientIp(req);
  const ipLimit = await checkLimit(rlPassword, `ip:${ip}`, true);
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfter);

  // Autenticación: sesión válida obligatoria
  const supabase = supabaseForRequest(req);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) return generico("No autenticado.", 401);
  const user = userData.user;
  const email = userData.user.email as string;

  // Rate limit por usuario (además del de IP)
  const userLimit = await checkLimit(rlPassword, `user:${user.id}`, true);
  if (!userLimit.ok) return tooMany(userLimit.retryAfter);

  // Validación de entrada server-side
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return generico("Datos inválidos.", 400);
  }
  if (body.currentPassword === body.newPassword)
    return generico("La contraseña nueva tiene que ser distinta de la actual.", 400);

  // Autorización extra: re-verificar la contraseña actual contra Supabase Auth.
  // Cliente descartable sin persistencia — la sesión que genera se revoca abajo.
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: pwdError } = await verifier.auth.signInWithPassword({
    email,
    password: body.currentPassword,
    options: body.captchaToken ? { captchaToken: body.captchaToken } : undefined,
  });
  if (pwdError) {
    // Mensaje genérico a propósito: no distinguir "contraseña mal" de otros
    // fallos le quita señal a un atacante (el detalle queda en logs de server).
    console.error("change-password: verificación falló", pwdError.code ?? pwdError.message);
    return generico("No se pudo verificar la contraseña actual.", 403);
  }

  // Aplicar la contraseña nueva (admin API — ya verificamos identidad arriba)
  const admin = supabaseAdmin();
  const { error: updError } = await admin.auth.admin.updateUserById(user.id, {
    password: body.newPassword,
  });
  if (updError) {
    console.error("change-password: update falló", updError.message);
    return generico("No se pudo actualizar la contraseña.", 500);
  }

  // Cerrar sesión en todos los demás dispositivos (incluida la sesión
  // descartable de la verificación). La sesión actual sigue viva.
  const { error: soError } = await supabase.auth.signOut({ scope: "others" });
  if (soError) console.error("change-password: signOut others falló", soError.message);

  return NextResponse.json({ ok: true });
}
