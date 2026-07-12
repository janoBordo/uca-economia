import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseForRequest } from "../../../lib/supabase/server";
import { rlAuth, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";

// Iniciar sesión (6.1). El CAPTCHA lo verifica Supabase Auth (Turnstile).
// La sesión queda en cookies HttpOnly+Secure+SameSite (hardenCookie) — nunca
// en localStorage ni legible por JS (6.7). Rate limit propio por IP y por
// email además del de Supabase, fail-closed (6.5).

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const Body = z.object({
  email: z.string().trim().toLowerCase().min(6).max(255).regex(EMAIL_RE),
  password: z.string().min(1).max(72),
  captchaToken: z.string().min(1).max(4096),
});

const generico = (msg: string, status: number) =>
  NextResponse.json({ ok: false, error: msg }, { status });

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLim = await checkLimit(rlAuth, `login:ip:${ip}`, true);
  if (!ipLim.ok) return tooMany(ipLim.retryAfter);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return generico("Datos inválidos.", 400);
  }

  // Límite también por cuenta objetivo: frena fuerza bruta distribuida.
  const mailLim = await checkLimit(rlAuth, `login:email:${body.email}`, true);
  if (!mailLim.ok) return tooMany(mailLim.retryAfter);

  const supabase = supabaseForRequest(req); // cliente ligado a cookies
  const { error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
    options: { captchaToken: body.captchaToken },
  });

  if (error) {
    console.error("auth/login:", error.code ?? error.message);
    if (error.code === "captcha_failed" || /captcha/i.test(error.message))
      return generico("Falló la verificación anti-bot. Recargá e intentá de nuevo.", 400);
    if (error.code === "email_not_confirmed")
      return generico("Tenés que confirmar tu email antes de entrar. Revisá tu casilla.", 403);
    if (error.status === 429) return tooMany(60);
    // Credenciales malas, cuenta baneada/eliminada, etc. → mismo mensaje
    // (no darle señal a un atacante de qué falló exactamente).
    return generico("Email o contraseña incorrectos.", 401);
  }

  return NextResponse.json({ ok: true });
}
