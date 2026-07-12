import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rlRecover, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";

// Paso 1 de "olvidé mi contraseña" (6.1/6.16): manda un código OTP de 6
// dígitos por email (template de Supabase con {{ .Token }}, vence en 10 min,
// un solo uso — al pedir uno nuevo el anterior queda inválido).
// La respuesta es SIEMPRE la misma exista o no el email (anti-enumeración).
// CAPTCHA verificado por Supabase; rate limit propio por IP y por email.

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const Body = z.object({
  email: z.string().trim().toLowerCase().min(6).max(255).regex(EMAIL_RE),
  captchaToken: z.string().min(1).max(4096),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLim = await checkLimit(rlRecover, `ip:${ip}`, true);
  if (!ipLim.ok) return tooMany(ipLim.retryAfter);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
  }

  const mailLim = await checkLimit(rlRecover, `email:${body.email}`, true);
  if (!mailLim.ok) return tooMany(mailLim.retryAfter);

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error } = await anon.auth.resetPasswordForEmail(body.email, {
    captchaToken: body.captchaToken,
  });

  if (error) {
    console.error("auth/recover:", error.code ?? error.message);
    if (error.code === "captcha_failed" || /captcha/i.test(error.message))
      return NextResponse.json(
        { ok: false, error: "Falló la verificación anti-bot. Recargá e intentá de nuevo." },
        { status: 400 }
      );
    // Cualquier otro error (email inexistente, límite de mails de Supabase,
    // SMTP caído) responde igual que el éxito: no filtrar si el email existe.
  }

  return NextResponse.json({ ok: true });
}
