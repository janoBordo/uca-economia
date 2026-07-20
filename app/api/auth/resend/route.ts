import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rlResend, rlResendIp, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";
import { generico } from "../../../lib/http";

// Reenviar el mail de confirmación de cuenta (v10.10). Lo pide el botón de la
// pantalla "Revisá tu casilla" del registro, con cooldown de 60s y máximo 3
// reenvíos en la UI; acá el límite real: 3/h por email + 10/h por IP, ambos
// fail-closed (manda mails reales por el SMTP de Gmail). Supabase suma su
// propio mínimo entre mails al mismo destinatario (smtp_max_frequency 60s).
// La respuesta es genérica: no filtra si el email existe ni su estado.

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const Body = z.object({
  email: z.string().trim().toLowerCase().min(6).max(255).regex(EMAIL_RE),
  captchaToken: z.string().min(1).max(4096),
});

export async function POST(req: Request) {
  const ipLim = await checkLimit(rlResendIp, `ip:${clientIp(req)}`, true);
  if (!ipLim.ok) return tooMany(ipLim.retryAfter);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return generico("Datos inválidos.", 400);
  }

  const mailLim = await checkLimit(rlResend, `email:${body.email}`, true);
  if (!mailLim.ok) return tooMany(mailLim.retryAfter);

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error } = await anon.auth.resend({
    type: "signup",
    email: body.email,
    options: { captchaToken: body.captchaToken },
  });

  if (error) {
    console.error("auth/resend:", error.code ?? error.message);
    if (error.code === "captcha_failed" || /captcha/i.test(error.message))
      return generico("Falló la verificación anti-bot. Probá de nuevo.", 400);
    if (error.status === 429) return tooMany(60);
    // Email inexistente, ya confirmado, etc. → misma respuesta que el éxito
    // (no darle señal a nadie; si ya está confirmada, el usuario entra por /login).
  }

  return NextResponse.json({ ok: true });
}
