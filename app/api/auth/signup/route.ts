import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rlSignup, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";

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
});

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
  const { error } = await anon.auth.signUp({
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

  return NextResponse.json({ ok: true });
}
