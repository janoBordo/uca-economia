import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rlOtp, rlAuth, checkLimit, clientIp, tooMany } from "../../../../lib/ratelimit";
import { generico } from "../../../../lib/http";
import { passwordValida, PASSWORD_MSG } from "../../../../lib/password";

// Paso 2 de la recuperación (6.1): verifica el código OTP y define la
// contraseña nueva. Límite ESTRICTO de intentos por email (5/15min,
// fail-closed) — sin esto un código de 6 dígitos se adivina por fuerza bruta.
// El código además vence a los 10 min y es de un solo uso (config Supabase).
// Al confirmar la nueva contraseña se cierran TODAS las sesiones del usuario
// (todos los dispositivos, incluida la temporal de este flujo): vuelve a
// entrar por /login con la clave nueva.

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const Body = z.object({
  email: z.string().trim().toLowerCase().min(6).max(255).regex(EMAIL_RE),
  code: z.string().trim().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(72),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLim = await checkLimit(rlAuth, `otp:ip:${ip}`, true);
  if (!ipLim.ok) return tooMany(ipLim.retryAfter);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return generico("Datos inválidos.", 400);
  }
  if (!passwordValida(body.newPassword)) return generico(PASSWORD_MSG, 400);

  // El límite que importa contra fuerza bruta: por cuenta objetivo.
  const mailLim = await checkLimit(rlOtp, `email:${body.email}`, true);
  if (!mailLim.ok) return tooMany(mailLim.retryAfter);

  // Cliente descartable: la sesión que crea verifyOtp vive solo en memoria
  // de este request y se revoca globalmente al final. Nunca llega al browser.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await anon.auth.verifyOtp({
    email: body.email,
    token: body.code,
    type: "recovery",
  });
  if (error || !data.session) {
    // Mismo mensaje para código incorrecto, vencido o email inexistente.
    console.error("auth/recover/verify:", error?.code ?? error?.message ?? "sin sesión");
    return generico("Código inválido o vencido.", 400);
  }

  const { error: updError } = await anon.auth.updateUser({ password: body.newPassword });
  // Pase lo que pase, revocar TODAS las sesiones (6.1: cerrar sesión en todos
  // los demás dispositivos al confirmar la contraseña nueva).
  const { error: soError } = await anon.auth.signOut({ scope: "global" });
  if (soError) console.error("auth/recover/verify: signOut global falló", soError.message);

  if (updError) {
    console.error("auth/recover/verify: update falló", updError.code ?? updError.message);
    if (updError.code === "same_password")
      return generico("La contraseña nueva no puede ser igual a la anterior. Pedí un código nuevo.", 400);
    return generico("No se pudo actualizar la contraseña. Pedí un código nuevo.", 400);
  }

  return NextResponse.json({ ok: true });
}
